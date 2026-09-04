import { afterEach, describe, expect, test, vi } from 'vitest'
import { ErroCota, lerCotaRemota, zerarRemoto, ajustarRemoto } from './cotaRemota'

afterEach(() => vi.restoreAllMocks())

function respondendo(corpo, { status = 200, tipo = 'application/json' } = {}) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), {
      status,
      headers: { 'content-type': tipo },
    }),
  )
}

describe('lerCotaRemota', () => {
  test('devolve o que o servidor mandou', async () => {
    respondendo({ desde: '2026-09-01T00:00:00.000Z', rede: 42, usos: [], protegido: false })

    const cota = await lerCotaRemota()
    expect(cota.rede).toBe(42)
  })

  /**
   * A regra que este módulo existe para garantir, na mesma forma do
   * `acervoRemoto.js`: falha **nunca** vira zero. Um `0 / 200` por queda de
   * rede diria "você tem as 200 inteiras" para quem já gastou 180 — e o
   * conselho implícito custa dinheiro.
   */
  test('200 com corpo que não é JSON lança, não devolve zero', async () => {
    respondendo('<!doctype html><html>...', { tipo: 'text/html' })

    await expect(lerCotaRemota()).rejects.toBeInstanceOf(ErroCota)
  })

  /**
   * O mesmo defeito do teste acima, um passo adiante: aqui o corpo *é* JSON,
   * só que `rede` não é a cota. `App.jsx` faz `const gastas = cota.rede` sem
   * guarda nenhuma — e `Math.max(0, 200 - null)` desenha "200 requisições
   * restantes" com a barra verde: a mentira das 200 inteiras, só que em
   * branco em vez de zero. Um rename de campo no servidor produziria isto
   * hoje sem quebrar nenhum teste existente.
   */
  test('200 com rede que não é número lança, não devolve zero', async () => {
    respondendo({ desde: '2026-09-01T00:00:00.000Z', rede: null, usos: [], protegido: false })

    await expect(lerCotaRemota()).rejects.toBeInstanceOf(ErroCota)
  })
})

describe('lerCotaRemota: os erros', () => {
  test('fetch que não sai vira mensagem em português, com a causa no objeto', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Failed to fetch'))

    const erro = await lerCotaRemota().catch((e) => e)
    expect(erro).toBeInstanceOf(ErroCota)
    // A mensagem do browser é fixada em inglês; ela fica na causa, para o
    // console, e nunca na tela.
    expect(erro.message).not.toContain('Failed to fetch')
    expect(erro.causa).toBe('Failed to fetch')
  })

  test('403 chega com o status, para a tela desabilitar os botões', async () => {
    respondendo({ message: 'Senha do controle ausente ou errada.' }, { status: 403 })

    const erro = await zerarRemoto('errada').catch((e) => e)
    expect(erro.status).toBe(403)
    expect(erro.message).toContain('Senha do controle')
  })
})

describe('ajustarRemoto', () => {
  test('manda o número no corpo e o segredo no header', async () => {
    const espiao = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ rede: 180, usos: [], desde: null }), {
          headers: { 'content-type': 'application/json' },
        }),
      )

    await ajustarRemoto(180, 'senha')

    const [, opcoes] = espiao.mock.calls[0]
    expect(JSON.parse(opcoes.body)).toEqual({ gastas: 180 })
    expect(opcoes.headers['x-controle-segredo']).toBe('senha')
  })
})
