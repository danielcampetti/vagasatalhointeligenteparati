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

  /**
   * As três rotas devolvem a mesma coisa, e `protegido` faz parte dela.
   *
   * Ele só existia no GET, e a tela pagou por isso: o painel guarda a resposta
   * inteira em estado, então um "Zerar" bem-sucedido substituía o objeto por
   * um sem `protegido` — e o campo da senha, mais o texto que o explica,
   * sumiam do painel no meio da sessão. Quem tivesse digitado a senha errada
   * ficava sem UI para corrigir, sem F5.
   *
   * A correção é aqui e não no cliente de propósito: com uma resposta só, o
   * cliente deixa de precisar saber quais campos vêm de qual verbo — que é
   * exatamente o conhecimento que se perdeu.
   */
  test('as três rotas devolvem `protegido`, e não só o GET', async () => {
    process.env.CONTROLE_SEGREDO = 'abre-te-sesamo'
    const comSenha = { 'x-controle-segredo': 'abre-te-sesamo' }

    const lida = await fetch(`${base}/api/cota`).then((r) => r.json())
    const zerada = await fetch(`${base}/api/cota/zerar`, {
      method: 'POST',
      headers: comSenha,
    }).then((r) => r.json())
    const ajustada = await fetch(`${base}/api/cota/ajustar`, {
      method: 'POST',
      headers: { ...comSenha, 'content-type': 'application/json' },
      body: JSON.stringify({ gastas: 7 }),
    }).then((r) => r.json())

    expect(lida.protegido).toBe(true)
    expect(zerada.protegido).toBe(true)
    expect(ajustada.protegido).toBe(true)
  })

  // E o mesmo com o servidor aberto: `false` nas três, nunca ausente — o
  // painel distingue "não pede senha" de "não sei", e `undefined` é o segundo.
  test('servidor aberto responde protegido: false nas três, e não undefined', async () => {
    const lida = await fetch(`${base}/api/cota`).then((r) => r.json())
    const zerada = await fetch(`${base}/api/cota/zerar`, {
      method: 'POST',
    }).then((r) => r.json())
    const ajustada = await fetch(`${base}/api/cota/ajustar`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ gastas: 7 }),
    }).then((r) => r.json())

    expect(lida.protegido).toBe(false)
    expect(zerada.protegido).toBe(false)
    expect(ajustada.protegido).toBe(false)
  })
})
