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
})
