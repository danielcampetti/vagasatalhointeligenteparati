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
import { abrirBanco, criarCota } from './banco.js'
import { pluginServidor } from './pluginServidor.js'

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

describe('a cota existe no npm run dev', () => {
  /**
   * O gate contra o `Router`.
   *
   * `rotasCota.js` documenta que `criarRotasCota` precisa devolver um app do
   * express, e não um `Router`: a pilha connect do vite entrega um
   * `http.ServerResponse` cru, sem `res.json` nem `res.status` — só o
   * `init` que todo app do express roda instala esses métodos. Um `Router`
   * aqui continua verde em `rotasCota.test.js` e em `app.test.js`, porque os
   * dois montam a rota dentro de um `express()` de verdade; só a pilha
   * connect do vite expõe a diferença, e só este arquivo passa por ela.
   */
  test('GET /api/cota responde JSON pelo dev server, não index.html nem 404', async () => {
    const res = await fetch(`${base}/api/cota`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/application\/json/)
    expect((await res.json()).rede).toBe(0)
  })
})

describe('a contagem roda no npm run dev', () => {
  let devIsolado
  let baseIsolado
  let cota

  /**
   * Um dev server à parte do `dev` de cima, de propósito.
   *
   * O `dev` de cima nasce do `vite.config.js` de verdade, onde o
   * `guardaDeChave` da JSearch está montado *antes* do `pluginServidor` na
   * lista de plugins. Sem `JSEARCH_API_KEY` (o caso normal de rodar teste)
   * ele intercepta `/api/jsearch` e responde sem chamar `next()` — o
   * `contarJSearch` do `pluginServidor` nunca chega a rodar, contando
   * corretamente ou não, e um teste que meça a cota ali não distingue as
   * duas situações. Com uma chave de mentira a requisição atravessaria o
   * guarda e cairia no proxy de verdade do vite, que sai para a internet —
   * exatamente o que este teste não pode fazer.
   *
   * Um servidor só com o `pluginServidor`, sem `guardaDeChave` nem proxy
   * configurado, deixa a requisição passar pelo middleware de contagem e
   * cair no fallback interno do vite (o `index.html` da SPA, sem sair da
   * máquina) — o bastante para provar que o middleware roda e conta, sem
   * depender de nenhuma chave nem de rede.
   *
   * A cota é injetada (`pluginServidor` já aceita `{ acervo, cota }`) para o
   * teste poder ler o mesmo objeto que o middleware usa, em vez de ter que
   * adivinhar onde o plugin abriu o banco preguiçoso dele.
   */
  beforeAll(async () => {
    cota = criarCota(abrirBanco(':memory:'))
    const { createServer } = await import('vite')
    devIsolado = await createServer({
      configFile: false,
      logLevel: 'silent',
      server: { port: 0 },
      plugins: [pluginServidor({ cota })],
    })
    await devIsolado.listen()
    baseIsolado = `http://localhost:${devIsolado.httpServer.address().port}`
  }, 60000)

  afterAll(() => devIsolado?.close())

  test('uma requisição a /api/jsearch soma na cota', async () => {
    expect(cota.ler().rede).toBe(0)

    await fetch(`${baseIsolado}/api/jsearch/search-v2?query=TI`)

    // A contagem acontece no listener de 'finish' da resposta, que já
    // aconteceu quando o fetch acima resolveu — sem precisar de espera extra.
    expect(cota.ler().rede).toBe(1)
  })
})
