/**
 * @vitest-environment node
 */

import express from 'express'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { abrirBanco, criarCota } from './banco.js'
import { contarJSearch } from './contagem.js'

/**
 * A regra do que consome cota, exercitada por HTTP de verdade.
 *
 * Ela veio do `tocouApi` do `jsearch.js` e não mudou de significado, só de
 * lugar: consome tudo que a API respondeu, exceto 401; não consome o que nunca
 * saiu da máquina. O que muda é quem decide — antes o cliente, agora o proxy,
 * que é o único que sabe se a requisição de fato saiu.
 *
 * O teste sobe um express real com o middleware e um handler que finge ser o
 * proxy: é o `res` de verdade que chega ao `finish`, não um objeto inventado.
 */

let cota
let servidor
let base

/** Um "proxy" que responde o que o teste pedir, com os marcadores reais. */
function subir(resposta) {
  const app = express()
  app.use('/api/jsearch', contarJSearch(cota), (_req, res) => {
    if (resposta.marcador) res.setHeader('x-jsearch-proxy', resposta.marcador)
    res.status(resposta.status).json({ ok: true })
  })
  return app
}

beforeEach(() => {
  cota = criarCota(abrirBanco(':memory:'))
})

afterEach(() => new Promise((ok) => (servidor ? servidor.close(ok) : ok())))

async function pedir(resposta, caminho = '/api/jsearch/search-v2?query=TI') {
  servidor = subir(resposta).listen(0)
  await new Promise((ok) => servidor.once('listening', ok))
  base = `http://127.0.0.1:${servidor.address().port}`
  await fetch(`${base}${caminho}`)
  // O `finish` é síncrono no fim da resposta, mas o `fetch` do cliente pode
  // voltar antes de o servidor rodar o listener. Um tick basta.
  await new Promise((ok) => setImmediate(ok))
}

describe('contarJSearch: o que consome cota', () => {
  test('200 conta', async () => {
    await pedir({ status: 200 })
    expect(cota.ler().rede).toBe(1)
  })

  test('401 não conta — a API recusa antes de debitar', async () => {
    await pedir({ status: 401 })
    expect(cota.ler().rede).toBe(0)
  })

  test('429 conta — o limite foi atingido gastando a requisição', async () => {
    await pedir({ status: 429 })
    expect(cota.ler().rede).toBe(1)
  })

  test('400 conta — parâmetro inválido debita igual', async () => {
    await pedir({ status: 400 })
    expect(cota.ler().rede).toBe(1)
  })

  test('chave ausente não conta — a requisição não saiu', async () => {
    await pedir({ status: 500, marcador: 'sem-chave' })
    expect(cota.ler().rede).toBe(0)
  })

  test('upstream inalcançável não conta', async () => {
    await pedir({ status: 502, marcador: 'sem-resposta' })
    expect(cota.ler().rede).toBe(0)
  })
})

describe('contarJSearch: o que a linha guarda', () => {
  test('tira consulta, janela e modalidade da URL do proxy', async () => {
    await pedir(
      { status: 200 },
      '/api/jsearch/search-v2?query=Analista+em+Caxias&date_posted=month&work_from_home=true',
    )

    const [uso] = cota.ler().usos
    expect(uso.consulta).toBe('Analista em Caxias')
    expect(uso.janela).toBe('month')
    expect(uso.remotas).toBe(true)
    expect(uso.continuacao).toBe(false)
    expect(uso.status).toBe(200)
  })

  test('cursor na URL marca a linha como continuação', async () => {
    await pedir({ status: 200 }, '/api/jsearch/search-v2?query=TI&cursor=abc123')
    expect(cota.ler().usos[0].continuacao).toBe(true)
  })
})

describe('contarJSearch: nunca derruba a busca', () => {
  /**
   * O contador é acessório; a busca custou uma das 200 e já está na tela.
   * Como o listener roda no `finish`, ele nem tem como afetar a resposta — este
   * teste trava essa propriedade contra um refactor que mova a chamada para
   * antes do `next()`.
   */
  test('banco quebrado não muda a resposta da busca', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    cota = {
      registrar() {
        throw new Error('banco fora do ar')
      },
      ler: () => ({ desde: null, rede: 0, usos: [] }),
    }

    servidor = subir({ status: 200 }).listen(0)
    await new Promise((ok) => servidor.once('listening', ok))
    const res = await fetch(
      `http://127.0.0.1:${servidor.address().port}/api/jsearch/search-v2?query=TI`,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    await new Promise((ok) => setImmediate(ok))
    expect(erro).toHaveBeenCalled()
  })
})
