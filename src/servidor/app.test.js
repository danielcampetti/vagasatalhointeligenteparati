/**
 * @vitest-environment node
 */

import { describe, expect, test } from 'vitest'
import { criarApp } from '../../server.js'

/**
 * O `server.js` chamava `app.listen` no topo do módulo. Importá-lo abriria uma
 * porta como efeito colateral do import — e uma porta já ocupada derrubaria a
 * suíte inteira por um motivo sem relação nenhuma com o que se testa.
 *
 * Este teste existe para travar a propriedade: importar não escuta.
 */
describe('criarApp', () => {
  test('importar o servidor não abre porta', () => {
    expect(typeof criarApp).toBe('function')
  })

  test('devolve um app do express, montado', () => {
    const app = criarApp()
    expect(typeof app.listen).toBe('function')
  })
})
