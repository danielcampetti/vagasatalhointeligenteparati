import { beforeEach, describe, expect, test } from 'vitest'
import {
  LIMITE_PADRAO_USD,
  definirTeto,
  dolares,
  dolaresAcumulados,
  excedeuTeto,
  lerCusto,
  registrarChamada,
  zerarCusto,
} from './custo'

beforeEach(() => localStorage.clear())

describe('dolares', () => {
  test('cobra entrada e saída com preços diferentes', () => {
    // 1M de entrada a US$5 + 1M de saída a US$25 = US$30
    const chamadas = [
      { entrada: 1_000_000, saida: 1_000_000, modelo: 'claude-opus-5' },
    ]
    expect(dolares(chamadas)).toBeCloseTo(30, 6)
  })

  test('soma várias chamadas', () => {
    const chamadas = [
      { entrada: 13_300, saida: 270, modelo: 'claude-opus-5' },
      { entrada: 13_300, saida: 270, modelo: 'claude-opus-5' },
    ]
    // (13300*5 + 270*25) / 1e6 = 0.073250 por chamada
    expect(dolares(chamadas)).toBeCloseTo(0.14650, 5)
  })

  test('modelo desconhecido não derruba a conta, conta como zero', () => {
    expect(dolares([{ entrada: 100, saida: 100, modelo: 'inventado' }])).toBe(0)
  })
})

describe('registrarChamada', () => {
  test('guarda tokens, não dólares', () => {
    const custo = registrarChamada(
      'ranking',
      { input_tokens: 13_300, output_tokens: 270 },
      'claude-opus-5',
      new Date('2026-08-26T12:00:00Z'),
    )
    expect(custo.chamadas[0]).toMatchObject({
      tipo: 'ranking',
      entrada: 13_300,
      saida: 270,
      modelo: 'claude-opus-5',
    })
    expect(custo.chamadas[0]).not.toHaveProperty('usd')
  })

  test('a mais recente vem primeiro', () => {
    registrarChamada('perfil', { input_tokens: 1, output_tokens: 1 }, 'claude-opus-5')
    registrarChamada('ranking', { input_tokens: 2, output_tokens: 2 }, 'claude-opus-5')
    expect(lerCusto().chamadas[0].tipo).toBe('ranking')
  })
})

describe('teto', () => {
  test('começa no padrão', () => {
    expect(lerCusto().teto).toBe(LIMITE_PADRAO_USD)
  })

  test('não excede quando está abaixo', () => {
    registrarChamada('ranking', { input_tokens: 1000, output_tokens: 10 }, 'claude-opus-5')
    expect(excedeuTeto(lerCusto())).toBe(false)
  })

  test('excede quando passa do teto', () => {
    definirTeto(0.01)
    registrarChamada(
      'ranking',
      { input_tokens: 1_000_000, output_tokens: 0 },
      'claude-opus-5',
    )
    expect(excedeuTeto(lerCusto())).toBe(true)
  })

  test('definirTeto sobrevive à leitura', () => {
    definirTeto(12)
    expect(lerCusto().teto).toBe(12)
  })

  // Corrigido depois de revisão: `excedeuTeto` lia `dolares(custo.chamadas)`
  // — o anel das 200 mais recentes. Com claude-opus-5 (US$5/25) 200 chamadas
  // já somavam mais que um teto de poucos dólares antes do anel girar; com
  // claude-sonnet-5 (US$2/10) elas não somam mais tanto, o anel gira de
  // verdade, e a partir da 201ª chamada o total do anel pode CAIR a cada
  // chamada nova — o teto deixando de disparar bem quando mais se gastou.
  test('excede mesmo depois de passar de 200 chamadas — o acumulado não gira com o anel', () => {
    definirTeto(0.01)
    // 250 chamadas pequenas: nenhuma sozinha estoura o teto, mas a soma
    // acumulada passa longe dele. O anel de `chamadas` guarda só as 200
    // últimas; se `excedeuTeto` lesse dali, metade do gasto já teria saído
    // do anel e o teto poderia não disparar.
    for (let i = 0; i < 250; i++) {
      registrarChamada(
        'ranking',
        { input_tokens: 1000, output_tokens: 10 },
        'claude-sonnet-5',
      )
    }
    const custo = lerCusto()
    expect(custo.chamadas).toHaveLength(200) // o anel girou
    expect(excedeuTeto(custo)).toBe(true)
  })
})

describe('acumulado', () => {
  test('soma tokens por modelo, sem limite de tamanho', () => {
    registrarChamada('perfil', { input_tokens: 100, output_tokens: 10 }, 'claude-sonnet-5')
    registrarChamada('ranking', { input_tokens: 200, output_tokens: 20 }, 'claude-sonnet-5')
    const { acumulado } = lerCusto()
    expect(acumulado['claude-sonnet-5']).toEqual({ entrada: 300, saida: 30 })
  })

  test('modelos diferentes acumulam em chaves separadas', () => {
    registrarChamada('perfil', { input_tokens: 100, output_tokens: 10 }, 'claude-opus-5')
    registrarChamada('ranking', { input_tokens: 200, output_tokens: 20 }, 'claude-sonnet-5')
    const { acumulado } = lerCusto()
    expect(acumulado['claude-opus-5']).toEqual({ entrada: 100, saida: 10 })
    expect(acumulado['claude-sonnet-5']).toEqual({ entrada: 200, saida: 20 })
  })

  test('dolaresAcumulados converte o acumulado pelo preço atual do modelo', () => {
    // 1M de entrada a US$2 + 1M de saída a US$10 = US$12 (preço do sonnet)
    expect(
      dolaresAcumulados({
        'claude-sonnet-5': { entrada: 1_000_000, saida: 1_000_000 },
      }),
    ).toBeCloseTo(12, 6)
  })

  test('acumulado ausente ou vazio não lança', () => {
    expect(dolaresAcumulados(undefined)).toBe(0)
    expect(dolaresAcumulados({})).toBe(0)
  })
})

describe('leitura defensiva', () => {
  test('storage vazio devolve o estado zerado', () => {
    expect(lerCusto()).toEqual({
      desde: null,
      chamadas: [],
      teto: LIMITE_PADRAO_USD,
      acumulado: {},
    })
  })

  test('valor corrompido não lança', () => {
    localStorage.setItem('vagas:custo', 'isto não é json')
    expect(() => lerCusto()).not.toThrow()
    expect(lerCusto().chamadas).toEqual([])
  })

  test('formato antigo com campos errados vira o estado zerado', () => {
    localStorage.setItem('vagas:custo', JSON.stringify({ chamadas: 'nope' }))
    expect(lerCusto().chamadas).toEqual([])
  })

  // localStorage de antes desta correção não tem `acumulado` — precisa virar
  // `{}`, não lançar nem sumir com o resto do registro.
  test('sem acumulado no storage (formato de antes desta correção) vira objeto vazio', () => {
    localStorage.setItem(
      'vagas:custo',
      JSON.stringify({ desde: null, chamadas: [], teto: 5 }),
    )
    expect(lerCusto().acumulado).toEqual({})
  })

  test('acumulado corrompido não lança e vira objeto vazio', () => {
    localStorage.setItem(
      'vagas:custo',
      JSON.stringify({ desde: null, chamadas: [], teto: 5, acumulado: 'nope' }),
    )
    expect(lerCusto().acumulado).toEqual({})
  })
})

describe('zerarCusto', () => {
  test('esvazia as chamadas e o acumulado, e mantém o teto', () => {
    definirTeto(9)
    registrarChamada('perfil', { input_tokens: 10, output_tokens: 10 }, 'claude-opus-5')
    const custo = zerarCusto(new Date('2026-09-01T00:00:00Z'))
    expect(custo.chamadas).toEqual([])
    expect(custo.acumulado).toEqual({})
    expect(custo.teto).toBe(9)
    expect(custo.desde).toBe('2026-09-01T00:00:00.000Z')
  })

  // Se `acumulado` sobrevivesse a `zerarCusto`, "zerar a contagem" (o botão
  // que a mensagem do teto sugere) não zeraria o teto de verdade — o aluno
  // clicaria em zerar e continuaria travado.
  test('depois de zerar, o teto volta a não estar excedido', () => {
    definirTeto(0.01)
    registrarChamada(
      'ranking',
      { input_tokens: 1_000_000, output_tokens: 0 },
      'claude-sonnet-5',
    )
    expect(excedeuTeto(lerCusto())).toBe(true)
    zerarCusto()
    expect(excedeuTeto(lerCusto())).toBe(false)
  })
})
