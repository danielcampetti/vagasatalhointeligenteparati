/**
 * @vitest-environment node
 */

import { createServer } from 'node:http'
import { connect } from 'node:net'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { criarApp } from '../../server.js'
import { abrirBanco, criarAcervo } from './banco'

/**
 * Uma porta livre agora — o teste precisa falar de uma porta que ele controla.
 */
async function portaLivre() {
  const sonda = createServer()
  await new Promise((ok) => sonda.listen(0, '127.0.0.1', ok))
  const { port } = sonda.address()
  await new Promise((ok) => sonda.close(ok))
  return port
}

/**
 * Resolve com o código do erro, ou 'conectou' se alguém atendeu.
 * Destrói o socket em ambos os casos para não deixar aberto.
 */
function sondarPorta(porta) {
  return new Promise((ok) => {
    const soquete = connect({ port: porta, host: '127.0.0.1' })
    soquete.once('connect', () => {
      soquete.destroy()
      ok('conectou')
    })
    soquete.once('error', (err) => {
      soquete.destroy()
      ok(err.code)
    })
  })
}

describe('criarApp', () => {
  /**
   * O `server.js` chamava `app.listen` no topo do módulo, e importá-lo abria
   * uma porta como efeito colateral do import — uma porta já ocupada
   * derrubaria a suíte inteira por um motivo sem relação com o que se testa.
   *
   * A prova tem que ser sobre a porta, não sobre o export: `listen` não
   * bloqueia nem lança, então um teste que só confere a existência de
   * `criarApp` continuaria verde com o defeito de volta.
   *
   * O `server.js` tem um guard: só chama `listen` se `process.argv[1]` for
   * este arquivo. No vitest, `argv[1]` é o runner, não o server, então a
   * guarda falha e nenhuma porta se abre. Este teste verifica: após importar,
   * ninguém atende nesta porta, porque o módulo não a escutou.
   *
   * A prova é por conexão, não por bind: o Windows deixa dar bind específico
   * por cima de um wildcard, então o teste anterior passava com o defeito
   * presente. Uma conexão detecta em qualquer OS.
   */
  test('importar o servidor não abre porta', async () => {
    const porta = await portaLivre()
    process.env.PORT = String(porta)

    // Importar o módulo. A guarda impede o listen porque `process.argv[1]`
    // é o runner do vitest, não o arquivo do servidor.
    await import('../../server.js')

    // Ninguém pode atender nesta porta. Um `listen` no topo do módulo teria
    // escutado nela — e é por conexão, não por bind, que isso se detecta.
    const resultado = await sondarPorta(porta)
    expect(resultado).toBe('ECONNREFUSED')
  })

  test('devolve um app do express, montado', async () => {
    const { criarApp } = await import('../../server.js')
    const app = criarApp({ acervo: criarAcervo(abrirBanco(':memory:')) })
    expect(typeof app.listen).toBe('function')
  })
})

describe('reproxiar: upstream inalcançável', () => {
  let servidor
  let base
  let chaveOriginal

  // Porta 0 = o SO escolhe uma livre, como em rotas.test.js — sem número fixo
  // não há teste que falhe porque outra coisa da máquina ocupou a porta.
  beforeEach(async () => {
    servidor = criarApp({ acervo: criarAcervo(abrirBanco(':memory:')) }).listen(0)
    await new Promise((ok) => servidor.once('listening', ok))
    base = `http://127.0.0.1:${servidor.address().port}`
    // Guardado para o afterEach devolver o ambiente como estava — sem isto, a
    // 'chave-de-teste' setada abaixo vazaria para os testes que rodam depois
    // deste, neste ou em outros arquivos da mesma suíte.
    chaveOriginal = process.env.JSEARCH_API_KEY
  })

  afterEach(() => {
    process.env.JSEARCH_API_KEY = chaveOriginal
    return new Promise((ok) => servidor.close(ok))
  })

  /**
   * O 502 que o `server.js` inventa quando o `fetch` não sai é byte a byte
   * igual a um 502 vindo da JSearch — e um deles não gastou cota nenhuma. O
   * marcador é o que torna a regra da contagem decidível.
   */
  test('marca a resposta como sem-resposta, para não contar cota', async () => {
    // `fetch` é global, e a chamada do próprio teste ao servidor local usa o
    // mesmo símbolo que o `reproxiar` usa para falar com o upstream — um
    // `mockRejectedValue` sem condição derrubaria as duas. Só a que mira o
    // upstream falha; a que mira `base` (o servidor deste teste) segue real,
    // senão nunca saberíamos o que o servidor respondeu.
    const fetchReal = globalThis.fetch
    vi.spyOn(globalThis, 'fetch').mockImplementation((entrada, init) => {
      const url = typeof entrada === 'string' ? entrada : entrada.url
      if (url.startsWith(base)) return fetchReal(entrada, init)
      return Promise.reject(new Error('getaddrinfo ENOTFOUND'))
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.JSEARCH_API_KEY = 'chave-de-teste'

    const res = await fetch(`${base}/api/jsearch/search-v2?query=TI`)

    expect(res.status).toBe(502)
    expect(res.headers.get('x-jsearch-proxy')).toBe('sem-resposta')
  })
})
