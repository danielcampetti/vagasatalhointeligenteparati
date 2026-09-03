/**
 * @vitest-environment node
 */

import { createServer } from 'node:http'
import { connect } from 'node:net'
import { describe, expect, test } from 'vitest'

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
    const app = criarApp()
    expect(typeof app.listen).toBe('function')
  })
})
