import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { describe, expect, test, vi } from 'vitest'
// `chamarEstruturado` é o único ponto de contato com a rede — mockado aqui
// para que `ranquear` seja testado de ponta a ponta (monta a chamada, valida
// a volta, refaz o que faltou) sem nunca tocar o SDK. `importOriginal`
// mantém `TIPOS` de verdade: só o invólucro de chamada é substituído.
vi.mock('./claude', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, chamarEstruturado: vi.fn() }
})
import {
  EFFORT_RANKING,
  MAX_TOKENS,
  chamarEstruturado,
  TIPOS,
} from './claude'
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
  const refs = [0, 1, 2]

  test('caso feliz: todas voltam', () => {
    const { validas, faltando } = validarNotas(
      [
        { ref: 0, nota: 80, motivo: 'x' },
        { ref: 1, nota: 60, motivo: 'y' },
        { ref: 2, nota: 40, motivo: 'z' },
      ],
      refs,
    )
    expect(faltando).toEqual([])
    expect(validas.get(0).nota).toBe(80)
  })

  test('ref inventado é descartado', () => {
    const { validas, faltando } = validarNotas(
      [
        { ref: 0, nota: 80, motivo: 'x' },
        { ref: 99, nota: 99, motivo: 'y' },
      ],
      refs,
    )
    expect(validas.has(99)).toBe(false)
    expect(faltando).toEqual([1, 2])
  })

  test('duplicata: a primeira vence', () => {
    const { validas } = validarNotas(
      [
        { ref: 0, nota: 80, motivo: 'primeira' },
        { ref: 0, nota: 10, motivo: 'segunda' },
      ],
      refs,
    )
    expect(validas.get(0).motivo).toBe('primeira')
  })

  test('resposta vazia deixa todas faltando', () => {
    const { validas, faltando } = validarNotas([], refs)
    expect(validas.size).toBe(0)
    expect(faltando).toEqual(refs)
  })

  test('resposta não-array não derruba', () => {
    const { faltando } = validarNotas(null, refs)
    expect(faltando).toEqual(refs)
  })

  test('nota fora de 0-100 é descartada', () => {
    const { validas, faltando } = validarNotas(
      [
        { ref: 0, nota: 150, motivo: 'x' },
        { ref: 1, nota: -5, motivo: 'y' },
        { ref: 2, nota: 70, motivo: 'z' },
      ],
      refs,
    )
    expect(validas.size).toBe(1)
    expect(faltando).toEqual([0, 1])
  })

  test('nota não-numérica é descartada', () => {
    const { faltando } = validarNotas([{ ref: 0, nota: 'oitenta' }], refs)
    expect(faltando).toContain(0)
  })

  // O schema declara integer, e a revalidação do SDK é tudo-ou-nada — um ref
  // em texto derrubaria o lote antes de chegar aqui. Este é o cinto de
  // segurança para o caso de ele chegar assim mesmo, e o motivo de o
  // `Number()` existir no validarNotas.
  test('ref em texto casa com o ref numérico enviado', () => {
    const { validas } = validarNotas([{ ref: '1', nota: 70, motivo: 'x' }], refs)
    expect(validas.get(1).nota).toBe(70)
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
      NotasSchema.parse({ notas: [{ ref: 0, nota: 80, motivo: 'x' }] }),
    ).not.toThrow()
  })

  // O schema NÃO carrega a faixa de propósito. Se carregasse, a revalidação
  // do SDK no cliente é tudo-ou-nada: uma nota ruim derrubaria o lote inteiro
  // e mataria as outras onze notas boas junto. Quem aplica a faixa é o
  // `validarNotas`, por item. Veja o comentário do NotasSchema.
  test('nota fora de 0-100 passa pelo schema — quem filtra é o validarNotas', () => {
    expect(() =>
      NotasSchema.parse({ notas: [{ ref: 0, nota: 150, motivo: 'x' }] }),
    ).not.toThrow()
  })

  test('a descrição da nota diz a faixa ao modelo, já que o schema não a impõe', () => {
    const { schema } = zodOutputFormat(NotasSchema)
    expect(schema.properties.notas.items.properties.nota.description).toMatch(
      /0 a 100/,
    )
  })

  // `integer` é suportado pela saída estruturada e imposto na geração, então
  // continua no schema — diferente de minimum/maximum, que não são.
  test('nota fracionária é rejeitada: o tipo integer permanece', () => {
    expect(() =>
      NotasSchema.parse({ notas: [{ ref: 0, nota: 80.5, motivo: 'x' }] }),
    ).toThrow()
  })

  test('item sem motivo é rejeitado', () => {
    expect(() => NotasSchema.parse({ notas: [{ ref: 0, nota: 80 }] })).toThrow()
  })
})

// `ranquear` é o ponto de entrada de verdade do módulo — monta a chamada,
// valida a volta e refaz o que faltou. Testar só as peças (resumirVaga,
// validarNotas, aplicarNotas) deixaria passar exatamente o defeito que a
// Task 5 já cometeu uma vez: um export central sem cobertura nenhuma do seu
// próprio comportamento fim a fim. `chamarEstruturado` é mockado (topo do
// arquivo) — zero rede.
function vaga(id) {
  // `empresa` carrega o id porque o id em si não viaja mais para o modelo —
  // é por ela que estes testes identificam quem entrou em cada lote.
  return { ...VAGA, id, empresa: id }
}

/**
 * A composição de um lote, na ordem em que foi enviada. O ref de cada vaga é
 * a sua posição aqui, e é por isso que um mock pode responder sem saber nada
 * além do que recebeu.
 */
function loteDe(params) {
  return [...params.messages[0].content.matchAll(/"empresa": "([^"]+)"/g)].map(
    (m) => m[1],
  )
}

/**
 * O `effort` não estava sendo enviado, e o padrão do `claude-sonnet-5` é
 * `high`. Medido contra a API real, mesmo lote de 10 vagas, três execuções:
 *
 *   high    23,6s · 26,8s · 28,4s   saída 2.000–2.700 tokens
 *   medium  15,1s · 16,4s · 19,2s   saída   430–1.412 tokens
 *   low      5,2s ·  5,4s ·  6,3s   saída       ~440 tokens
 *
 * A resposta útil são ~250 tokens em todos os casos: o resto é pensamento —
 * a própria API confirma em `usage.output_tokens_details.thinking_tokens`.
 *
 * `medium` e não `low` porque a diferença de nota foi medida também, com
 * `high` rodado duas vezes para estabelecer o piso de ruído: duas chamadas
 * idênticas já divergem 6,8 pontos em média. `low` diverge 15,5 — o dobro do
 * ruído — e perdeu as três primeiras posições. `medium` fica no meio, e corta
 * quase metade do tempo e do custo de saída.
 */
describe('effort do ranking', () => {
  test('a janela de pensamento é escolhida, não herdada do padrão da API', () => {
    expect(EFFORT_RANKING).toBe('medium')
  })
})

describe('ranquear', () => {
  test('caminho feliz: uma chamada, TIPOS.RANKING, max_tokens do MAX_TOKENS, output_config com schema, e volta com nota em cada vaga', async () => {
    chamarEstruturado.mockClear()
    chamarEstruturado.mockResolvedValue({
      parsed_output: {
        notas: [
          { ref: 0, nota: 80, motivo: 'ok' },
          { ref: 1, nota: 60, motivo: 'ok' },
        ],
      },
    })

    const vagas = [vaga('a1'), vaga('a2')]
    const resultado = await ranquear({ cargo: 'x' }, 'instrução', vagas)

    expect(chamarEstruturado).toHaveBeenCalledTimes(1)
    const [tipo, params] = chamarEstruturado.mock.calls[0]
    expect(tipo).toBe(TIPOS.RANKING)
    expect(params.max_tokens).toBe(MAX_TOKENS)
    expect(params.output_config.format).toBeTruthy()
    // Sem `effort` explícito o padrão do claude-sonnet-5 é `high`, e foi
    // medido o que isso custa: 2.453 tokens de saída para 250 de resposta —
    // ~90% pensamento, 27s de espera na tela. Ver o teste abaixo.
    expect(params.output_config.effort).toBe(EFFORT_RANKING)
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
        parsed_output: { notas: [{ ref: 0, nota: 80, motivo: 'ok' }] }, // ref 1 não veio
      })
      .mockResolvedValueOnce({
        // Lote novo, refs novos: aqui o ref 0 é a a2, não a a1.
        parsed_output: { notas: [{ ref: 0, nota: 55, motivo: 'segunda' }] },
      })

    const vagas = [vaga('a1'), vaga('a2')]
    const resultado = await ranquear({ cargo: 'x' }, 'instrução', vagas)

    expect(chamarEstruturado).toHaveBeenCalledTimes(2)
    // A segunda chamada só leva o que faltou, não o lote inteiro de novo —
    // é o que mantém a segunda volta barata.
    const conteudoSegunda = chamarEstruturado.mock.calls[1][1].messages[0].content
    expect(conteudoSegunda).toContain('a2')
    expect(conteudoSegunda).not.toContain('"empresa": "a1"')

    expect(resultado.find((v) => v.id === 'a1').rank).toBe(80)
    expect(resultado.find((v) => v.id === 'a2').rank).toBe(55)
  })

  test('a segunda volta também vem incompleta: não lança, o que sobrar fica rank null e a lista inteira volta', async () => {
    chamarEstruturado.mockClear()
    chamarEstruturado
      .mockResolvedValueOnce({
        parsed_output: { notas: [{ ref: 0, nota: 80, motivo: 'ok' }] },
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
      parsed_output: { notas: ids.map((_, ref) => ({ ref, nota: 50, motivo: 'x' })) },
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
  // Escrito em função de TAMANHO_LOTE, não de um número fixo: este teste já
  // quebrou uma vez quando a constante subiu de 12 para 30, prendendo `[7, 6]`
  // que só valia para 13 vagas contra lote de 12. O comportamento sob teste é
  // o *equilíbrio* do corte, e ele não depende do valor da constante.
  test('lista maior que o lote: fatiamento equilibrado — nenhum lote fica com 1 vaga só, sem conjunto de comparação', async () => {
    chamarEstruturado.mockClear()
    const quantas = TAMANHO_LOTE + 1 // força exatamente dois lotes
    const ids = Array.from({ length: quantas }, (_, i) => `v${i}`)
    chamarEstruturado.mockResolvedValue({
      parsed_output: { notas: ids.map((_, ref) => ({ ref, nota: 50, motivo: 'x' })) },
    })

    const vagas = ids.map((id) => vaga(id))
    await ranquear({ cargo: 'x' }, 'instrução', vagas)

    const tamanhosDosLotes = chamarEstruturado.mock.calls.map(
      ([, params]) => loteDe(params).length,
    )
    // O corte ingênuo daria [TAMANHO_LOTE, 1]; o equilibrado divide ao meio.
    expect(tamanhosDosLotes).toEqual([
      Math.ceil(quantas / 2),
      Math.floor(quantas / 2),
    ])
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
      for (const id of loteDe(params)) enviados.add(id)
    }
    expect(enviados).toEqual(new Set(ids))
  })

  test('lote grande com falha persistente numa vaga: o caminho degradado continua íntegro — resto pontuado, a que sobrou fica rank null, sem lançar', async () => {
    chamarEstruturado.mockClear()
    const ids = Array.from({ length: 25 }, (_, i) => `v${i}`)
    chamarEstruturado.mockImplementation(async (_tipo, params) => {
      const lote = loteDe(params)
      // v24 nunca volta pontuada, nem na primeira nem na segunda volta.
      const notas = lote
        .map((id, ref) => ({ id, ref }))
        .filter(({ id }) => id !== 'v24')
        .map(({ ref }) => ({ ref, nota: 70, motivo: 'x' }))
      return { parsed_output: { notas } }
    })

    const vagas = ids.map((id) => vaga(id))
    const resultado = await ranquear({ cargo: 'x' }, 'instrução', vagas)

    expect(resultado).toHaveLength(25)
    expect(resultado.find((v) => v.id === 'v24').rank).toBe(null)
    expect(resultado.filter((v) => v.id !== 'v24').every((v) => v.rank === 70)).toBe(true)
  })

  // Corrigido depois de revisão: `pontuarTodos` não tinha try/catch por
  // lote, então um lote que lançasse (o teto de custo é o gatilho mais
  // provável — o lote 1 empurra o gasto além do limite e o lote 2 lança em
  // `conferirTeto`) derrubava o `ranquear` inteiro, e as notas do lote 1 —
  // já cobradas — morriam sem chegar à tela.
  test('lote que lança no meio não apaga as notas dos lotes já pagos antes dele', async () => {
    chamarEstruturado.mockClear()
    // Também em função da constante, pelo mesmo motivo do teste acima.
    const quantas = TAMANHO_LOTE + 1
    const noPrimeiroLote = Math.ceil(quantas / 2)
    const ids = Array.from({ length: quantas }, (_, i) => `v${i}`)
    // A última vaga cai sempre no segundo lote, seja qual for TAMANHO_LOTE.
    const condenada = `v${quantas - 1}`
    chamarEstruturado.mockImplementation(async (_tipo, params) => {
      const lote = loteDe(params)
      // O lote que contém a vaga condenada sempre lança — simula o teto de
      // custo estourando e continuando estourado numa eventual segunda volta.
      if (lote.includes(condenada)) {
        throw new Error('Teto de custo atingido')
      }
      return {
        parsed_output: {
          notas: lote.map((_, ref) => ({ ref, nota: 90, motivo: 'x' })),
        },
      }
    })

    const vagas = ids.map((id) => vaga(id))
    const resultado = await ranquear({ cargo: 'x' }, 'instrução', vagas)

    // As vagas do primeiro lote já foram cobradas e pontuadas — não podem
    // sumir só porque o segundo lote lançou.
    expect(resultado.filter((v) => v.rank === 90)).toHaveLength(noPrimeiroLote)
    // O lote que lançou fica sem nota — degrada, não derruba a lista inteira.
    expect(resultado).toHaveLength(quantas)
    expect(resultado.find((v) => v.id === condenada).rank).toBe(null)
  })
})

// Estes três testes vieram de um defeito visto na tela, não de raciocínio: com
// a API de verdade o Rank IA saía "—" em toda vaga. O `job_id` da JSearch tem
// **402 caracteres** de base64, e o lote pedia ao modelo que devolvesse esse id
// verbatim para cada uma das 12 vagas — ~1.930 tokens só de id, contra um
// `max_tokens` de 2.000. A resposta era cortada no meio de uma string e o lote
// inteiro morria. Os testes acima nunca pegariam isso: todos usam ids de dois
// caracteres (`a1`, `v10`), e o defeito só existe em função do tamanho do id.
describe('id gigante da JSearch', () => {
  const ID_REAL = 'q'.repeat(402)

  // Sem o helper `vaga()`: ele copia o id para o `empresa` em favor dos testes
  // de lote, e aqui é justamente o id que não pode aparecer no prompt.
  const comId = (id) => ({ ...VAGA, id })

  test('o id da vaga não viaja para o modelo — nem na ida, nem para ser ecoado na volta', async () => {
    chamarEstruturado.mockClear()
    chamarEstruturado.mockResolvedValue({
      parsed_output: { notas: [{ ref: 0, nota: 80, motivo: 'ok' }] },
    })

    await ranquear({ cargo: 'x' }, 'instrução', [comId(ID_REAL)])

    const conteudo = chamarEstruturado.mock.calls[0][1].messages[0].content
    expect(conteudo).not.toContain(ID_REAL)
  })

  test('a nota volta pelo ref curto e pousa na vaga certa', async () => {
    chamarEstruturado.mockClear()
    chamarEstruturado.mockResolvedValue({
      parsed_output: {
        notas: [
          { ref: 0, nota: 80, motivo: 'primeira' },
          { ref: 1, nota: 40, motivo: 'segunda' },
        ],
      },
    })

    const vagas = [comId(`${ID_REAL}A`), comId(`${ID_REAL}B`)]
    const resultado = await ranquear({ cargo: 'x' }, 'instrução', vagas)

    expect(resultado.find((v) => v.id === `${ID_REAL}A`).rank).toBe(80)
    expect(resultado.find((v) => v.id === `${ID_REAL}B`).rank).toBe(40)
  })

  // O ref é posicional *dentro do lote*, e a segunda volta remonta um lote só
  // com quem faltou — o ref 0 da segunda volta é outra vaga que o ref 0 da
  // primeira. Traduzir ref→id dentro do próprio lote é o que impede a nota de
  // pousar na vaga errada aqui.
  test('o ref é relativo ao lote: na segunda volta, ref 0 é a vaga que faltou, não a primeira da lista', async () => {
    chamarEstruturado.mockClear()
    chamarEstruturado
      .mockResolvedValueOnce({
        parsed_output: { notas: [{ ref: 0, nota: 80, motivo: 'ok' }] }, // ref 1 não veio
      })
      .mockResolvedValueOnce({
        parsed_output: { notas: [{ ref: 0, nota: 55, motivo: 'segunda' }] },
      })

    const vagas = [comId(`${ID_REAL}A`), comId(`${ID_REAL}B`)]
    const resultado = await ranquear({ cargo: 'x' }, 'instrução', vagas)

    expect(chamarEstruturado).toHaveBeenCalledTimes(2)
    expect(resultado.find((v) => v.id === `${ID_REAL}A`).rank).toBe(80)
    expect(resultado.find((v) => v.id === `${ID_REAL}B`).rank).toBe(55)
  })
})
