/**
 * @vitest-environment node
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { criarApp } from '../../server.js'
import { abrirBanco, criarAcervo } from './banco'

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
  test('grava e devolve a lista atualizada', async () => {
    const res = await fetch(`${base}/api/acervo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vagas: [vaga('a'), vaga('b')] }),
    })
    expect(res.status).toBe(200)
    expect((await res.json()).vagas).toHaveLength(2)
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
 * por ausência de código, e este teste é o que impede alguém de adicionar a
 * rota "por completude" numa manutenção futura.
 */
describe('não existe DELETE', () => {
  test('DELETE numa vaga não apaga nada', async () => {
    acervo.guardar([vaga('a')])
    await fetch(`${base}/api/acervo/a`, { method: 'DELETE' })
    expect(acervo.listar()).toHaveLength(1)
  })
})
