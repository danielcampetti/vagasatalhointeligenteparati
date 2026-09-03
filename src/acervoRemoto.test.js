import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  ErroAcervo,
  atualizarVagaRemota,
  buscarVagaRemota,
  guardarVagasRemoto,
  lerAcervoRemoto,
} from './acervoRemoto'

const responde = (corpo, { status = 200 } = {}) =>
  vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  })

afterEach(() => vi.unstubAllGlobals())

describe('lerAcervoRemoto', () => {
  test('devolve as vagas do corpo', async () => {
    vi.stubGlobal('fetch', responde({ vagas: [{ id: 'a' }] }))
    expect(await lerAcervoRemoto()).toEqual([{ id: 'a' }])
  })

  test('corpo sem vagas não vira undefined na tela', async () => {
    vi.stubGlobal('fetch', responde({}))
    expect(await lerAcervoRemoto()).toEqual([])
  })

  /**
   * A regra que este bloco existe para travar: **falha não pode virar lista
   * vazia**. Acervo vazio por queda de rede é visualmente idêntico a acervo
   * vazio de verdade, e a tela de vazio diz "faça uma busca" — conselho errado
   * para quem está vendo um erro de rede.
   */
  test('rede caída lança ErroAcervo, não devolve lista vazia', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sem rede')))
    await expect(lerAcervoRemoto()).rejects.toBeInstanceOf(ErroAcervo)
  })

  /**
   * A mensagem do `fetch` é fixada em inglês pelos browsers ("Failed to
   * fetch" no Chromium), não importa o idioma de quem usa. Ela não pode
   * chegar à tela de falha — só ao `causa`, para quem lê o console.
   */
  test('a mensagem do fetch fica em causa, não vaza para a tela', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Failed to fetch')))
    const erro = await lerAcervoRemoto().catch((e) => e)
    expect(erro.message).not.toMatch(/Failed to fetch/)
    expect(erro.causa).toBe('Failed to fetch')
  })

  test('status de erro lança ErroAcervo com o status', async () => {
    vi.stubGlobal('fetch', responde({ message: 'quebrou' }, { status: 500 }))
    await expect(lerAcervoRemoto()).rejects.toMatchObject({ status: 500 })
  })

  test('a mensagem do servidor chega ao chamador', async () => {
    vi.stubGlobal('fetch', responde({ message: 'banco fora do ar' }, { status: 500 }))
    await expect(lerAcervoRemoto()).rejects.toThrow(/banco fora do ar/)
  })
})

describe('guardarVagasRemoto', () => {
  test('manda as vagas e devolve a lista atualizada', async () => {
    const espiao = responde({ vagas: [{ id: 'a' }] })
    vi.stubGlobal('fetch', espiao)

    expect(await guardarVagasRemoto([{ id: 'a' }])).toEqual([{ id: 'a' }])
    const [, opcoes] = espiao.mock.calls[0]
    expect(opcoes.method).toBe('POST')
    expect(JSON.parse(opcoes.body)).toEqual({ vagas: [{ id: 'a' }] })
  })

  // Lista vazia não vale uma ida à rede: a busca sem resultado chamaria isto,
  // e o servidor devolveria o acervo inteiro para nada.
  test('lista vazia não chama a rede', async () => {
    const espiao = responde({ vagas: [] })
    vi.stubGlobal('fetch', espiao)

    expect(await guardarVagasRemoto([])).toEqual([])
    expect(espiao).not.toHaveBeenCalled()
  })
})

describe('buscarVagaRemota', () => {
  test('devolve a vaga', async () => {
    vi.stubGlobal('fetch', responde({ id: 'a', descricao: 'inteira' }))
    expect((await buscarVagaRemota('a')).descricao).toBe('inteira')
  })

  // 404 aqui é resposta, não falha: a vaga saiu do acervo pelo teto.
  test('404 devolve null em vez de lançar', async () => {
    vi.stubGlobal('fetch', responde({ message: 'não achei' }, { status: 404 }))
    expect(await buscarVagaRemota('sumida')).toBe(null)
  })
})

describe('atualizarVagaRemota', () => {
  test('manda PATCH com os campos', async () => {
    const espiao = responde({ id: 'a', fav: true })
    vi.stubGlobal('fetch', espiao)

    expect((await atualizarVagaRemota('a', { fav: true })).fav).toBe(true)
    const [, opcoes] = espiao.mock.calls[0]
    expect(opcoes.method).toBe('PATCH')
    expect(JSON.parse(opcoes.body)).toEqual({ fav: true })
  })

  test('404 devolve null', async () => {
    vi.stubGlobal('fetch', responde({ message: 'não achei' }, { status: 404 }))
    expect(await atualizarVagaRemota('sumida', { fav: true })).toBe(null)
  })
})
