import { describe, expect, test, vi } from 'vitest'
// `chamarEstruturado` é o único ponto de contato com a rede — mockado aqui
// para que `ranquear` seja testado de ponta a ponta (monta a chamada, valida
// a volta, refaz o que faltou) sem nunca tocar o SDK. `importOriginal`
// mantém `TIPOS` de verdade: só o invólucro de chamada é substituído.
vi.mock('./claude', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, chamarEstruturado: vi.fn() }
})
import { chamarEstruturado, TIPOS } from './claude'
import {
  NotasSchema,
  TAMANHO_LOTE,
  aplicarNotas,
  ranquear,
  resumirVaga,
  validarNotas,
} from './ranking'

const VAGA = {
  id: 'a1',
  cargo: 'Técnico de TI',
  empresa: 'Acme',
  cidade: 'Caxias do Sul, RS',
  modalidade: 'Presencial',
  min: 3.5,
  max: 4.5,
  days: 7,
  descricao: 'Suporte a usuários, redes, Windows Server.',
  rank: null,
  status: 'Ativa',
}

describe('resumirVaga', () => {
  test('leva só o que a nota precisa', () => {
    const r = resumirVaga(VAGA)
    expect(r).toEqual({
      id: 'a1',
      cargo: 'Técnico de TI',
      empresa: 'Acme',
      cidade: 'Caxias do Sul, RS',
      modalidade: 'Presencial',
      salario_min: 3.5,
      salario_max: 4.5,
      dias_desde_publicacao: 7,
      descricao: 'Suporte a usuários, redes, Windows Server.',
    })
  })

  test('não manda campos de tela', () => {
    const r = resumirVaga(VAGA)
    expect(r).not.toHaveProperty('rank')
    expect(r).not.toHaveProperty('status')
    expect(r).not.toHaveProperty('fav')
  })
})

describe('validarNotas', () => {
  const ids = ['a1', 'a2', 'a3']

  test('caso feliz: todas voltam', () => {
    const { validas, faltando } = validarNotas(
      [
        { id: 'a1', nota: 80, motivo: 'x' },
        { id: 'a2', nota: 60, motivo: 'y' },
        { id: 'a3', nota: 40, motivo: 'z' },
      ],
      ids,
    )
    expect(faltando).toEqual([])
    expect(validas.get('a1').nota).toBe(80)
  })

  test('id inventado é descartado', () => {
    const { validas, faltando } = validarNotas(
      [
        { id: 'a1', nota: 80, motivo: 'x' },
        { id: 'INVENTADO', nota: 99, motivo: 'y' },
      ],
      ids,
    )
    expect(validas.has('INVENTADO')).toBe(false)
    expect(faltando).toEqual(['a2', 'a3'])
  })

  test('duplicata: a primeira vence', () => {
    const { validas } = validarNotas(
      [
        { id: 'a1', nota: 80, motivo: 'primeira' },
        { id: 'a1', nota: 10, motivo: 'segunda' },
      ],
      ids,
    )
    expect(validas.get('a1').motivo).toBe('primeira')
  })

  test('resposta vazia deixa todas faltando', () => {
    const { validas, faltando } = validarNotas([], ids)
    expect(validas.size).toBe(0)
    expect(faltando).toEqual(ids)
  })

  test('resposta não-array não derruba', () => {
    const { faltando } = validarNotas(null, ids)
    expect(faltando).toEqual(ids)
  })

  test('nota fora de 0-100 é descartada', () => {
    const { validas, faltando } = validarNotas(
      [
        { id: 'a1', nota: 150, motivo: 'x' },
        { id: 'a2', nota: -5, motivo: 'y' },
        { id: 'a3', nota: 70, motivo: 'z' },
      ],
      ids,
    )
    expect(validas.size).toBe(1)
    expect(faltando.sort()).toEqual(['a1', 'a2'])
  })

  test('nota não-numérica é descartada', () => {
    const { faltando } = validarNotas([{ id: 'a1', nota: 'oitenta' }], ids)
    expect(faltando).toContain('a1')
  })
})

describe('aplicarNotas', () => {
  test('preenche rank e motivo', () => {
    const validas = new Map([['a1', { nota: 87, motivo: 'Domina o stack' }]])
    const [vaga] = aplicarNotas([VAGA], validas)
    expect(vaga.rank).toBe(87)
    expect(vaga.rankMotivo).toBe('Domina o stack')
  })

  test('vaga sem nota fica com rank null — a tela mostra "—"', () => {
    const [vaga] = aplicarNotas([VAGA], new Map())
    expect(vaga.rank).toBe(null)
  })

  test('não muda os outros campos', () => {
    const [vaga] = aplicarNotas([VAGA], new Map())
    expect(vaga.cargo).toBe('Técnico de TI')
    expect(vaga.status).toBe('Ativa')
  })
})

describe('NotasSchema', () => {
  test('aceita a forma esperada', () => {
    expect(() =>
      NotasSchema.parse({ notas: [{ id: 'a1', nota: 80, motivo: 'x' }] }),
    ).not.toThrow()
  })

  test('nota fora de 0-100 é rejeitada no schema', () => {
    expect(() =>
      NotasSchema.parse({ notas: [{ id: 'a1', nota: 150, motivo: 'x' }] }),
    ).toThrow()
  })

  test('nota fracionária é rejeitada', () => {
    expect(() =>
      NotasSchema.parse({ notas: [{ id: 'a1', nota: 80.5, motivo: 'x' }] }),
    ).toThrow()
  })

  test('item sem motivo é rejeitado', () => {
    expect(() => NotasSchema.parse({ notas: [{ id: 'a1', nota: 80 }] })).toThrow()
  })
})

// `ranquear` é o ponto de entrada de verdade do módulo — monta a chamada,
// valida a volta e refaz o que faltou. Testar só as peças (resumirVaga,
// validarNotas, aplicarNotas) deixaria passar exatamente o defeito que a
// Task 5 já cometeu uma vez: um export central sem cobertura nenhuma do seu
// próprio comportamento fim a fim. `chamarEstruturado` é mockado (topo do
// arquivo) — zero rede.
function vaga(id) {
  return { ...VAGA, id }
}

describe('ranquear', () => {
  test('caminho feliz: uma chamada, TIPOS.RANKING, max_tokens 2000, output_config com schema, e volta com nota em cada vaga', async () => {
    chamarEstruturado.mockClear()
    chamarEstruturado.mockResolvedValue({
      parsed_output: {
        notas: [
          { id: 'a1', nota: 80, motivo: 'ok' },
          { id: 'a2', nota: 60, motivo: 'ok' },
        ],
      },
    })

    const vagas = [vaga('a1'), vaga('a2')]
    const resultado = await ranquear({ cargo: 'x' }, 'instrução', vagas)

    expect(chamarEstruturado).toHaveBeenCalledTimes(1)
    const [tipo, params] = chamarEstruturado.mock.calls[0]
    expect(tipo).toBe(TIPOS.RANKING)
    expect(params.max_tokens).toBe(2000)
    expect(params.output_config.format).toBeTruthy()
    // O perfil e as vagas resumidas viajam no conteúdo — sem isso a Claude
    // não teria com o que pontuar.
    const conteudo = params.messages[0].content
    expect(conteudo).toContain('a1')
    expect(conteudo).toContain('a2')

    expect(resultado.find((v) => v.id === 'a1').rank).toBe(80)
    expect(resultado.find((v) => v.id === 'a2').rank).toBe(60)
  })

  test('degrada com graça: id que faltou na primeira volta é pedido de novo, só ele, numa segunda chamada', async () => {
    chamarEstruturado.mockClear()
    chamarEstruturado
      .mockResolvedValueOnce({
        parsed_output: { notas: [{ id: 'a1', nota: 80, motivo: 'ok' }] }, // a2 não veio
      })
      .mockResolvedValueOnce({
        parsed_output: { notas: [{ id: 'a2', nota: 55, motivo: 'segunda' }] },
      })

    const vagas = [vaga('a1'), vaga('a2')]
    const resultado = await ranquear({ cargo: 'x' }, 'instrução', vagas)

    expect(chamarEstruturado).toHaveBeenCalledTimes(2)
    // A segunda chamada só leva o que faltou, não o lote inteiro de novo —
    // é o que mantém a segunda volta barata.
    const conteudoSegunda = chamarEstruturado.mock.calls[1][1].messages[0].content
    expect(conteudoSegunda).toContain('a2')
    expect(conteudoSegunda).not.toContain('"id": "a1"')

    expect(resultado.find((v) => v.id === 'a1').rank).toBe(80)
    expect(resultado.find((v) => v.id === 'a2').rank).toBe(55)
  })

  test('a segunda volta também vem incompleta: não lança, o que sobrar fica rank null e a lista inteira volta', async () => {
    chamarEstruturado.mockClear()
    chamarEstruturado
      .mockResolvedValueOnce({
        parsed_output: { notas: [{ id: 'a1', nota: 80, motivo: 'ok' }] },
      })
      .mockResolvedValueOnce({ parsed_output: { notas: [] } }) // a2 segue sem nota

    const vagas = [vaga('a1'), vaga('a2')]
    const lista = await ranquear({ cargo: 'x' }, 'instrução', vagas)

    expect(chamarEstruturado).toHaveBeenCalledTimes(2)
    expect(lista).toHaveLength(2)
    expect(lista.find((v) => v.id === 'a1').rank).toBe(80)
    expect(lista.find((v) => v.id === 'a2').rank).toBe(null)
  })

  // Corrigido depois de revisão: um `.slice(0, TAMANHO_LOTE)` sozinho no
  // início de `ranquear` descartava silenciosamente tudo além da vaga 12 —
  // nunca ia pra rede, nunca entrava em `faltando`, e saía com `rank: null`
  // sem nenhum aviso de que a causa era outra. `ranquear` agora fatia a
  // lista inteira em lotes de TAMANHO_LOTE; os três testes abaixo substituem
  // o teste antigo, que prendia o comportamento errado.
  test('25 vagas: fatia em lotes de TAMANHO_LOTE e pontua todas, não só as 12 primeiras', async () => {
    chamarEstruturado.mockClear()
    const ids = Array.from({ length: 25 }, (_, i) => `v${i}`)
    // validarNotas filtra pelo que cada lote realmente enviou, então devolver
    // as 25 em toda chamada simula o modelo respondendo certo a cada uma sem
    // eu precisar inspecionar o conteúdo de cada chamada aqui.
    chamarEstruturado.mockResolvedValue({
      parsed_output: { notas: ids.map((id) => ({ id, nota: 50, motivo: 'x' })) },
    })

    const vagas = ids.map((id) => vaga(id))
    const resultado = await ranquear({ cargo: 'x' }, 'instrução', vagas)

    const lotesEsperados = Math.ceil(ids.length / TAMANHO_LOTE)
    expect(chamarEstruturado).toHaveBeenCalledTimes(lotesEsperados)
    expect(resultado).toHaveLength(25)
    expect(resultado.every((v) => v.rank === 50)).toBe(true)
  })

  // Achado numa segunda revisão do coordenador: cortar em pedaços de tamanho
  // fixo deixa sobra pequena quando a divisão não é exata — 13 vagas com
  // TAMANHO_LOTE 12 viram [12, 1]. Um lote de 1 tem conjunto de comparação
  // vazio, e a nota que sairia dali não seria relativa a nada. O fatiamento
  // equilibrado evita isso: mesma quantidade de lotes, distribuídos o mais
  // uniforme possível. A asserção é sobre o TAMANHO dos lotes — a contagem de
  // chamadas já é coberta pelo teste acima e não pegaria esta regressão
  // sozinha, porque tanto [12, 1] quanto [7, 6] somam 2 chamadas.
  test('13 vagas: fatiamento equilibrado — nenhum lote fica com 1 vaga só, sem conjunto de comparação', async () => {
    chamarEstruturado.mockClear()
    const ids = Array.from({ length: 13 }, (_, i) => `v${i}`)
    chamarEstruturado.mockResolvedValue({
      parsed_output: { notas: ids.map((id) => ({ id, nota: 50, motivo: 'x' })) },
    })

    const vagas = ids.map((id) => vaga(id))
    await ranquear({ cargo: 'x' }, 'instrução', vagas)

    const tamanhosDosLotes = chamarEstruturado.mock.calls.map(
      ([, params]) => (params.messages[0].content.match(/"id": "/g) || []).length,
    )
    expect(tamanhosDosLotes).toEqual([7, 6])
    expect(tamanhosDosLotes.every((n) => n > 1)).toBe(true)
  })

  test('toda vaga enviada a ranquear passa por alguma chamada — nenhuma é descartada em silêncio pelo corte de lote', async () => {
    chamarEstruturado.mockClear()
    const ids = Array.from({ length: 25 }, (_, i) => `v${i}`)
    chamarEstruturado.mockResolvedValue({ parsed_output: { notas: [] } })

    const vagas = ids.map((id) => vaga(id))
    await ranquear({ cargo: 'x' }, 'instrução', vagas)

    // É esta a asserção que pegaria o defeito: com o `.slice(0, TAMANHO_LOTE)`
    // isolado de antes, só os 12 primeiros ids apareceriam em alguma chamada.
    const enviados = new Set()
    for (const [, params] of chamarEstruturado.mock.calls) {
      const conteudo = params.messages[0].content
      for (const id of ids) {
        if (conteudo.includes(`"id": "${id}"`)) enviados.add(id)
      }
    }
    expect(enviados).toEqual(new Set(ids))
  })

  test('lote grande com falha persistente numa vaga: o caminho degradado continua íntegro — resto pontuado, a que sobrou fica rank null, sem lançar', async () => {
    chamarEstruturado.mockClear()
    const ids = Array.from({ length: 25 }, (_, i) => `v${i}`)
    chamarEstruturado.mockImplementation(async (_tipo, params) => {
      const conteudo = params.messages[0].content
      const enviados = ids.filter((id) => conteudo.includes(`"id": "${id}"`))
      // v24 nunca volta pontuada, nem na primeira nem na segunda volta.
      const notas = enviados
        .filter((id) => id !== 'v24')
        .map((id) => ({ id, nota: 70, motivo: 'x' }))
      return { parsed_output: { notas } }
    })

    const vagas = ids.map((id) => vaga(id))
    const resultado = await ranquear({ cargo: 'x' }, 'instrução', vagas)

    expect(resultado).toHaveLength(25)
    expect(resultado.find((v) => v.id === 'v24').rank).toBe(null)
    expect(resultado.filter((v) => v.id !== 'v24').every((v) => v.rank === 70)).toBe(true)
  })
})
