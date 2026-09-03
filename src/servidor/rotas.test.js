/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { criarApp } from '../../server.js'
import { abrirBanco, criarAcervo } from './banco'
import { criarRotasAcervo } from './rotas.js'

const vaga = (id, extra = {}) => ({
  id,
  cargo: `Cargo ${id}`,
  modalidade: 'Presencial',
  rank: null,
  fav: false,
  seen: false,
  descricao: `descricao de ${id}`,
  ...extra,
})

let servidor
let base
let acervo

// Porta 0 = o SO escolhe uma livre. Sem número fixo não há teste que falhe
// porque outra coisa da máquina ocupou a porta.
beforeEach(async () => {
  acervo = criarAcervo(abrirBanco(':memory:'))
  servidor = criarApp({ acervo }).listen(0)
  await new Promise((ok) => servidor.once('listening', ok))
  base = `http://127.0.0.1:${servidor.address().port}`
})

afterEach(() => new Promise((ok) => servidor.close(ok)))

describe('GET /api/acervo', () => {
  test('acervo vazio devolve lista vazia, não 404', async () => {
    const res = await fetch(`${base}/api/acervo`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ vagas: [] })
  })

  test('devolve o que foi guardado, sem descricao', async () => {
    acervo.guardar([vaga('a')])
    const { vagas } = await (await fetch(`${base}/api/acervo`)).json()
    expect(vagas).toHaveLength(1)
    expect(vagas[0].cargo).toBe('Cargo a')
    expect(vagas[0]).not.toHaveProperty('descricao')
  })
})

describe('GET /api/acervo/:id', () => {
  test('devolve a vaga inteira, com descricao', async () => {
    acervo.guardar([vaga('a')])
    const res = await fetch(`${base}/api/acervo/a`)
    expect(res.status).toBe(200)
    expect((await res.json()).descricao).toBe('descricao de a')
  })

  test('id inexistente é 404 com mensagem, não corpo vazio', async () => {
    const res = await fetch(`${base}/api/acervo/fantasma`)
    expect(res.status).toBe(404)
    expect((await res.json()).message).toMatch(/não/i)
  })
})

describe('POST /api/acervo', () => {
  test('grava e devolve a lista atualizada, sem descricao', async () => {
    const res = await fetch(`${base}/api/acervo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vagas: [vaga('a'), vaga('b')] }),
    })
    expect(res.status).toBe(200)
    const { vagas } = await res.json()
    expect(vagas).toHaveLength(2)
    // A resposta do POST é a mesma lista do GET, e a interface é a lista sem
    // descrição. Sem esta linha, o POST podia voltar a devolvê-la — 66% do peso
    // — e a única prova estaria no teste do GET.
    expect(vagas[0]).not.toHaveProperty('descricao')
    expect(vagas[1]).not.toHaveProperty('descricao')
  })

  /**
   * O limite de 10 MB veio do proxy da Claude, onde ele existe por causa dos
   * currículos. Aqui ele é o teto do estrago: o corpo é desserializado e
   * reserializado de forma síncrona, num processo só, e o que entra fica no
   * volume — sem `DELETE` para desfazer. Uma busca real não passa de alguns
   * KB.
   */
  test('corpo grande demais é recusado, não engolido', async () => {
    const res = await fetch(`${base}/api/acervo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        vagas: [vaga('gorda', { descricao: 'x'.repeat(3 * 1024 * 1024) })],
      }),
    })
    expect(res.status).toBe(413)
    expect(acervo.listar()).toHaveLength(0)
  })

  test('corpo sem vagas não quebra: devolve o acervo como está', async () => {
    acervo.guardar([vaga('a')])
    const res = await fetch(`${base}/api/acervo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).vagas).toHaveLength(1)
  })
})

describe('PATCH /api/acervo/:id', () => {
  test('liga uma marca e devolve a vaga final', async () => {
    acervo.guardar([vaga('a')])
    const res = await fetch(`${base}/api/acervo/a`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fav: true }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).fav).toBe(true)
  })

  test('id inexistente é 404', async () => {
    const res = await fetch(`${base}/api/acervo/fantasma`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fav: true }),
    })
    expect(res.status).toBe(404)
  })
})

/**
 * A decisão do dono do projeto: nada é destruído no servidor. Ela é satisfeita
 * por ausência de código, e este bloco é o que impede alguém de adicionar a
 * rota "por completude" numa manutenção futura.
 */
describe('não existe DELETE', () => {
  test('DELETE numa vaga não apaga nada', async () => {
    acervo.guardar([vaga('a')])
    await fetch(`${base}/api/acervo/a`, { method: 'DELETE' })
    expect(acervo.listar()).toHaveLength(1)
  })

  /**
   * O teste acima prova o **efeito**, não o contrato: um `delete` que
   * respondesse 200 sem apagar nada passaria por ele, e a rota estaria lá para
   * o próximo commit ligar de verdade. O que a decisão diz é que a rota não
   * existe, então é a tabela de rotas que precisa ser olhada.
   *
   * O `toContain('get')` está aí para a introspecção não passar vazia: se o
   * express mudar a forma interna da pilha, este teste falha em vez de virar
   * uma afirmação sobre um array de zero itens.
   */
  test('nenhuma rota DELETE registrada — o contrato, não só o efeito', () => {
    const metodos = criarRotasAcervo(acervo)
      .router.stack.flatMap((camada) =>
        camada.route ? Object.keys(camada.route.methods) : [],
      )

    expect(metodos).toContain('get')
    expect(metodos).toContain('post')
    expect(metodos).toContain('patch')
    expect(metodos).not.toContain('delete')
  })
})
