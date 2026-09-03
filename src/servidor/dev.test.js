/**
 * @vitest-environment node
 */

/**
 * O `npm run dev` e o Railway têm que se comportar igual.
 *
 * É promessa do README, e é ela que faz defeito de produção aparecer antes de
 * publicar. O acervo nasceu quebrando-a: o `vite.config.js` proxiava
 * `/api/jsearch` e `/api/claude`, e mais nada servia `/api/acervo` — nenhum
 * processo rodava o `server.js` ao lado do vite. Passou despercebido porque
 * toda verificação foi feita com `node server.js` contra um `dist/` pronto.
 *
 * As duas caras do defeito, medidas em 03/09/2026:
 *   - com a `base` padrão, `/api/acervo` dava **404 `text/plain`** e a aba
 *     mostrava falha permanente;
 *   - com `BASE_PATH=/`, o fallback de HTML do vite respondia **200 com o
 *     `index.html`**, que o cliente lia como acervo vazio.
 *
 * O teste sobe o dev server de verdade, a partir do `vite.config.js` de
 * verdade, e conversa com ele por HTTP. Um teste que só conferisse a lista de
 * plugins não veria a ordem dos middlewares, que é a metade que quebra.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

let dev
let base
let caminhoAntes

beforeAll(async () => {
  // `:memory:` para o dev server do teste não criar arquivo nenhum no repo.
  caminhoAntes = process.env.BANCO_CAMINHO
  process.env.BANCO_CAMINHO = ':memory:'

  const { createServer } = await import('vite')
  dev = await createServer({ logLevel: 'silent', server: { port: 0 } })
  await dev.listen()
  // `localhost` e não `127.0.0.1`: o vite escuta no que o SO resolver para
  // localhost, que no Windows é ::1 antes de IPv4.
  base = `http://localhost:${dev.httpServer.address().port}`
}, 60000)

afterAll(async () => {
  await dev?.close()
  if (caminhoAntes === undefined) delete process.env.BANCO_CAMINHO
  else process.env.BANCO_CAMINHO = caminhoAntes
})

describe('o acervo existe no npm run dev', () => {
  test('GET /api/acervo responde JSON, não 404 nem index.html', async () => {
    const res = await fetch(`${base}/api/acervo`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    expect(await res.json()).toEqual({ vagas: [] })
  })

  test('POST e GET falam com o mesmo acervo, como em produção', async () => {
    const res = await fetch(`${base}/api/acervo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ vagas: [{ id: 'dev1', cargo: 'Cargo dev1' }] }),
    })
    expect(res.status).toBe(200)

    const { vagas } = await (await fetch(`${base}/api/acervo`)).json()
    expect(vagas.map((v) => v.id)).toContain('dev1')
  })

  test('GET /api/acervo/:id devolve a vaga, e id ausente é 404 com mensagem', async () => {
    await fetch(`${base}/api/acervo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        vagas: [{ id: 'dev2', cargo: 'Cargo dev2', descricao: 'inteira' }],
      }),
    })

    const achou = await fetch(`${base}/api/acervo/dev2`)
    expect((await achou.json()).descricao).toBe('inteira')

    const fantasma = await fetch(`${base}/api/acervo/fantasma`)
    expect(fantasma.status).toBe(404)
    expect((await fantasma.json()).message).toMatch(/não/i)
  })
})
