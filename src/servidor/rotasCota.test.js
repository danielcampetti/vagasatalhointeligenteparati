/**
 * @vitest-environment node
 */

import express from 'express'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { abrirBanco, criarCota } from './banco.js'
import { criarRotasCota } from './rotasCota.js'

let cota
let servidor
let base

beforeEach(async () => {
  delete process.env.CONTROLE_SEGREDO
  cota = criarCota(abrirBanco(':memory:'))
  const app = express()
  app.use('/api/cota', criarRotasCota(cota))
  servidor = app.listen(0)
  await new Promise((ok) => servidor.once('listening', ok))
  base = `http://127.0.0.1:${servidor.address().port}`
})

afterEach(() => {
  delete process.env.CONTROLE_SEGREDO
  return new Promise((ok) => servidor.close(ok))
})

describe('GET /api/cota', () => {
  test('banco vazio devolve zero, e não 404', async () => {
    const res = await fetch(`${base}/api/cota`)
    expect(res.status).toBe(200)

    const corpo = await res.json()
    expect(corpo.rede).toBe(0)
    expect(corpo.usos).toEqual([])
    expect(corpo.protegido).toBe(false)
  })
})

describe('POST /api/cota/zerar', () => {
  test('reinicia o ciclo', async () => {
    cota.registrar({ consulta: 'algo', status: 200 })

    const res = await fetch(`${base}/api/cota/zerar`, { method: 'POST' })
    expect(res.status).toBe(200)

    const corpo = await res.json()
    expect(corpo.rede).toBe(0)
    expect(corpo.usos).toEqual([])
  })
})

describe('POST /api/cota/ajustar', () => {
  test('põe o número do provedor e preserva o histórico', async () => {
    cota.registrar({ consulta: 'algo', status: 200 })

    const res = await fetch(`${base}/api/cota/ajustar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gastas: 180 }),
    })

    const corpo = await res.json()
    expect(corpo.rede).toBe(180)
    // As linhas aconteceram mesmo; apagá-las para casar com um número maior
    // seria trocar dado verdadeiro por aparência de coerência.
    expect(corpo.usos).toHaveLength(1)
  })
})

describe('o segredo do controle', () => {
  test('sem a variável, as rotas de escrita ficam abertas', async () => {
    const res = await fetch(`${base}/api/cota/zerar`, { method: 'POST' })
    expect(res.status).toBe(200)
  })

  test('com a variável e sem o header, 403', async () => {
    process.env.CONTROLE_SEGREDO = 'abre-te-sesamo'

    const res = await fetch(`${base}/api/cota/zerar`, { method: 'POST' })
    expect(res.status).toBe(403)
    expect((await res.json()).message).toContain('Senha do controle')
  })

  test('com a variável e o header certo, passa', async () => {
    process.env.CONTROLE_SEGREDO = 'abre-te-sesamo'

    const res = await fetch(`${base}/api/cota/zerar`, {
      method: 'POST',
      headers: { 'x-controle-segredo': 'abre-te-sesamo' },
    })
    expect(res.status).toBe(200)
  })

  test('ler nunca pede senha, e o GET anuncia que há uma', async () => {
    process.env.CONTROLE_SEGREDO = 'abre-te-sesamo'

    const res = await fetch(`${base}/api/cota`)
    expect(res.status).toBe(200)
    expect((await res.json()).protegido).toBe(true)
  })
})
