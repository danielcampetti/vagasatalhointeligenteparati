import Anthropic from '@anthropic-ai/sdk'
import { beforeEach, describe, expect, test } from 'vitest'
import { definirTeto, lerCusto, registrarChamada } from '../custo'
import {
  ErroClaude,
  MODELO,
  conferirResposta,
  conferirTeto,
  contabilizar,
  mensagemDoErro,
} from './claude'

beforeEach(() => localStorage.clear())

describe('conferirTeto', () => {
  test('passa quando está abaixo', () => {
    expect(() => conferirTeto()).not.toThrow()
  })

  test('lança tipo "teto" quando estourou', () => {
    definirTeto(0.001)
    registrarChamada(
      'ranking',
      { input_tokens: 1_000_000, output_tokens: 0 },
      MODELO,
    )
    expect(() => conferirTeto()).toThrow(ErroClaude)
    try {
      conferirTeto()
    } catch (err) {
      expect(err.tipo).toBe('teto')
      expect(err.message).toMatch(/teto/i)
    }
  })
})

describe('conferirResposta', () => {
  test('passa numa resposta normal', () => {
    expect(() =>
      conferirResposta({ stop_reason: 'end_turn', content: [] }),
    ).not.toThrow()
  })

  test('lança tipo "recusa" em refusal', () => {
    try {
      conferirResposta({
        stop_reason: 'refusal',
        stop_details: { category: 'cyber', explanation: 'x' },
      })
      throw new Error('devia ter lançado')
    } catch (err) {
      expect(err.tipo).toBe('recusa')
    }
  })

  test('lança quando a saída foi cortada pelo max_tokens', () => {
    try {
      conferirResposta({ stop_reason: 'max_tokens', content: [] })
      throw new Error('devia ter lançado')
    } catch (err) {
      expect(err.tipo).toBe('vazio')
    }
  })
})

describe('contabilizar', () => {
  test('registra o uso no custo.js', () => {
    contabilizar('perfil', {
      usage: { input_tokens: 100, output_tokens: 50 },
    })
    const chamada = lerCusto().chamadas[0]
    expect(chamada).toMatchObject({ tipo: 'perfil', entrada: 100, saida: 50 })
    expect(chamada.modelo).toBe(MODELO)
  })

  test('resposta sem usage não derruba, e não registra nada', () => {
    expect(() => contabilizar('perfil', {})).not.toThrow()
    // Sem isto, uma resposta sem `usage` (ex.: depois de um erro) registraria
    // uma chamada fantasma de custo zero — o medidor mentiria por omissão.
    expect(lerCusto().chamadas).toEqual([])
  })
})

describe('mensagemDoErro', () => {
  test('429 vira mensagem sobre limite', () => {
    // O construtor de APIError (de quem RateLimitError herda) chama
    // `headers?.get(...)` — um objeto literal `{}` não tem `.get` e o
    // construtor lança. `undefined` é o que o SDK realmente passa quando
    // não há headers (ver APIError.generate em core/error.ts), e é o que
    // funciona aqui. Verificado direto contra o pacote instalado
    // (node_modules/@anthropic-ai/sdk@0.121.0) antes de escrever este teste.
    //
    // A mensagem passada aqui é em inglês e de propósito não contém
    // "limite": se o `err.message` bruto tivesse essa palavra, o teste
    // passaria mesmo com o ramo `instanceof RateLimitError` apagado, porque
    // o ramo genérico de `Anthropic.APIError` também ecoa `err.message`.
    const err = new Anthropic.RateLimitError(429, undefined, 'too many requests', undefined)
    expect(mensagemDoErro(err)).toMatch(/limite/i)
  })

  test('401 vira mensagem sobre autorização', () => {
    const err = new Anthropic.AuthenticationError(401, undefined, 'unauthorized', undefined)
    expect(mensagemDoErro(err)).toMatch(/autoriza/i)
  })

  test('400 vira mensagem que inclui o motivo original', () => {
    // As duas asserções importam: a genérica de APIError (mais abaixo) *também*
    // ecoa `err.message`, então só checar a presença do motivo não provaria
    // que este `if` — e não o catch-all — respondeu. "recusou os parâmetros"
    // só existe neste ramo.
    const err = new Anthropic.BadRequestError(400, undefined, 'parâmetro inválido', undefined)
    const msg = mensagemDoErro(err)
    expect(msg).toMatch(/recusou os parâmetros/)
    expect(msg).toMatch(/parâmetro inválido/)
  })

  test('erro de conexão vira mensagem sobre o npm run dev', () => {
    const err = new Anthropic.APIConnectionError({ message: 'econnrefused' })
    expect(mensagemDoErro(err)).toMatch(/npm run dev/)
  })

  test('status sem tratamento específico cai no genérico da API', () => {
    // 500 não tem `if` próprio em mensagemDoErro — só bate no catch-all
    // `instanceof Anthropic.APIError`. O catch-all final ("Erro inesperado:
    // ...") também ecoaria status e mensagem, então a asserção precisa do
    // prefixo "A Claude respondeu", que só o ramo `APIError` produz — sem
    // ele não dá para distinguir "o ramo certo respondeu" de "caiu no
    // catch-all errado".
    const err = new Anthropic.InternalServerError(500, undefined, 'server exploded', undefined)
    expect(mensagemDoErro(err)).toMatch(/^A Claude respondeu 500: .*server exploded/)
  })

  test('ErroClaude devolve a própria mensagem', () => {
    const err = new ErroClaude('mensagem específica', { tipo: 'teto' })
    expect(mensagemDoErro(err)).toBe('mensagem específica')
  })

  test('erro desconhecido não devolve undefined', () => {
    expect(mensagemDoErro(new Error('qualquer coisa'))).toBeTruthy()
  })
})
