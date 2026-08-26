import { beforeEach, describe, expect, test } from 'vitest'
import {
  LIMITE_PADRAO_USD,
  definirTeto,
  dolares,
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
})

describe('leitura defensiva', () => {
  test('storage vazio devolve o estado zerado', () => {
    expect(lerCusto()).toEqual({
      desde: null,
      chamadas: [],
      teto: LIMITE_PADRAO_USD,
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
})

describe('zerarCusto', () => {
  test('esvazia as chamadas e mantém o teto', () => {
    definirTeto(9)
    registrarChamada('perfil', { input_tokens: 10, output_tokens: 10 }, 'claude-opus-5')
    const custo = zerarCusto(new Date('2026-09-01T00:00:00Z'))
    expect(custo.chamadas).toEqual([])
    expect(custo.teto).toBe(9)
    expect(custo.desde).toBe('2026-09-01T00:00:00.000Z')
  })
})
