/**
 * @vitest-environment node
 */

import { createServer } from 'node:http'
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
   * a porta fica livre, porque o módulo não a escutou.
   */
  test('importar o servidor não abre porta', async () => {
    const porta = await portaLivre()
    process.env.PORT = String(porta)

    // Importar o módulo. A guarda impede o listen porque `process.argv[1]`
    // é o runner do vitest, não o arquivo do servidor.
    await import('../../server.js')

    // Se o módulo tivesse um listen() no topo sem guarda, ele teria escutado
    // nesta porta. Bind bem-sucedido prova que ele não escutou.
    const nosso = createServer()
    let bindSucedeu = false
    await new Promise((ok, falhou) => {
      nosso.once('error', falhou)
      nosso.listen(porta, '127.0.0.1', () => {
        bindSucedeu = true
        ok()
      })
    })
    expect(bindSucedeu).toBe(true)
    await new Promise((ok) => nosso.close(ok))
  })

  test('devolve um app do express, montado', async () => {
    const { criarApp } = await import('../../server.js')
    const app = criarApp()
    expect(typeof app.listen).toBe('function')
  })
})
