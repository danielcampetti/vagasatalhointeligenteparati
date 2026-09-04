# A cota no servidor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar a contagem de requisições da JSearch do `localStorage` e pô-la no SQLite do Railway, contada pelo proxy que já faz toda requisição — para o número parar de ser "este navegador" e passar a ser "a conta".

**Architecture:** Um middleware que observa `res.statusCode` no evento `finish` é montado antes dos dois proxies (o `reproxiar` do `server.js` e o `server.proxy` do vite) e grava contador e histórico na mesma transação. Três rotas novas em `/api/cota` servem o painel; as duas destrutivas ficam atrás de um segredo do ambiente. O cache das consultas continua no navegador.

**Tech Stack:** Node 22.14.0, `node:sqlite` (embutido), express 5, vite 8, vitest 4, React 19. **Nenhuma dependência nova.**

**Spec:** `docs/superpowers/specs/2026-09-04-cota-no-servidor-design.md`

## Global Constraints

- **Zero dependência nova.** `node:sqlite` vem no Node 22.14 e emite um `ExperimentalWarning` no log — é esperado, não é falha.
- **`npm run dev` e o Railway se comportam igual.** Toda rota e todo middleware novo é montado nos dois; o módulo é importado, nunca copiado.
- **Uma réplica só.** Um processo, uma conexão, sem `busy_timeout`. Escalar para 2 réplicas no mesmo volume produz `SQLITE_BUSY` sem retry.
- **Um handle de banco por processo.** Dois `DatabaseSync` no mesmo arquivo são as duas réplicas em miniatura.
- **`fechar()`/`db` no objeto retornado seguram o `DatabaseSync` contra o GC.** Sem referência viva, o `node:sqlite` finaliza os *prepared statements* e toda rota passa a dar 500 até reiniciar. Reproduzido em 03/09/2026.
- **Imports do plugin do vite são dinâmicos.** Um `import` estático de `node:sqlite` entra no grafo de `src/api/claude.test.js` (que roda em jsdom e importa o `vite.config.js` de verdade) e derruba a suíte do cliente com "Cannot bundle Node.js built-in `node:sqlite`".
- **O banco abre no primeiro pedido, não ao montar o plugin.** O vitest sobe um dev server interno com os plugins do config; abrir ao montar faz `npm test` criar `acervo.db` no repositório.
- **Nomes e docstrings em português**, explicando *por quê*, no estilo dos módulos vizinhos.
- **TDD com defeito reintroduzido.** Um teste que nunca foi visto falhar não é um teste: reintroduza o defeito, veja falhar, só então desfaça.
- **Nada de `DELETE`** nas rotas novas, pela mesma razão do acervo.

---

### Task 1: As tabelas e o `criarCota`

**Files:**
- Modify: `src/servidor/banco.js` (o `abrirBanco`, ~linha 133; acrescenta `criarCota` no fim)
- Test: `src/servidor/banco.test.js` (acrescenta um `describe` no fim)

**Interfaces:**
- Consumes: `agora()` de `../vaga.js` (já importado no arquivo).
- Produces:
  - `export const TETO_USOS = 50`
  - `export function criarCota(db, { teto = TETO_USOS } = {})` → `{ db, ler, registrar, zerar, ajustar }`
  - `ler()` → `{ desde: string, rede: number, usos: Array<{ quando, consulta, janela, remotas, continuacao, status }> }`
  - `registrar(dados = {}, quando = agora())` → o mesmo objeto de `ler()`
  - `zerar(quando = agora())` → o mesmo objeto de `ler()`
  - `ajustar(gastas)` → o mesmo objeto de `ler()`

- [ ] **Step 1: Escreva o teste que falha**

Acrescente no fim de `src/servidor/banco.test.js`:

```js
describe('criarCota', () => {
  let cota

  beforeEach(() => {
    cota = criarCota(abrirBanco(':memory:'))
  })

  test('banco novo começa em zero, e com um ciclo aberto', () => {
    const lida = cota.ler()
    expect(lida.rede).toBe(0)
    expect(lida.usos).toEqual([])
    expect(typeof lida.desde).toBe('string')
  })

  test('registrar incrementa o contador e guarda a linha', () => {
    const lida = cota.registrar({
      consulta: 'Técnico de TI em Caxias do Sul',
      janela: 'month',
      remotas: false,
      continuacao: false,
      status: 200,
    })

    expect(lida.rede).toBe(1)
    expect(lida.usos).toHaveLength(1)
    expect(lida.usos[0].consulta).toBe('Técnico de TI em Caxias do Sul')
    expect(lida.usos[0].status).toBe(200)
  })
})
```

E acrescente `criarCota` ao import do topo do arquivo:

```js
import { CAMPOS_PATCH, abrirBanco, criarAcervo, criarCota } from './banco'
```

- [ ] **Step 2: Rode para ver falhar**

Run: `npx vitest run src/servidor/banco.test.js`
Expected: FAIL — `criarCota is not a function`.

- [ ] **Step 3: Acrescente as tabelas ao `abrirBanco`**

Em `src/servidor/banco.js`, dentro do `db.exec(...)` do `abrirBanco`, depois do índice de `vagas`:

```js
    CREATE TABLE IF NOT EXISTS cota (
      id    INTEGER PRIMARY KEY CHECK (id = 1),
      desde TEXT    NOT NULL,
      rede  INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS usos (
      quando TEXT NOT NULL,
      dados  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS usos_quando ON usos(quando DESC);
```

- [ ] **Step 4: Escreva o `criarCota`**

No fim de `src/servidor/banco.js`:

```js
/**
 * Quantas buscas o histórico guarda.
 *
 * É teto de **exibição**, o mesmo 50 que o `cota.js` usava. Ele pode cortar à
 * vontade porque a contagem não sai daqui: mora na coluna `rede` da tabela
 * `cota`. Era exatamente a contagem derivada de uma lista com teto que fazia o
 * painel mostrar 3/200 com 50 gastas — cada repetição empurrava uma requisição
 * paga para fora do corte, e o número encolhia sozinho.
 */
export const TETO_USOS = 50

/**
 * A cota da conta, no mesmo banco do acervo.
 *
 * Quem escreve aqui é o proxy, e ninguém mais: o `contagem.js` chama
 * `registrar` depois de cada requisição que de fato saiu. O navegador só lê —
 * fora `zerar` e `ajustar`, que são operação do dono e passam pelo segredo.
 *
 * ## Uma linha, garantida pelo schema
 *
 * `CHECK (id = 1)` é o que faz a tabela `cota` ser um singleton. Sem ele, um
 * `INSERT` distraído criaria um segundo contador e nada avisaria qual dos dois
 * o painel lê.
 */
export function criarCota(db, { teto = TETO_USOS } = {}) {
  const abrirCiclo = db.prepare(
    'INSERT INTO cota (id, desde, rede) VALUES (1, ?, 0) ON CONFLICT(id) DO NOTHING',
  )
  const lerLinha = db.prepare('SELECT desde, rede FROM cota WHERE id = 1')
  const incrementar = db.prepare('UPDATE cota SET rede = rede + 1 WHERE id = 1')
  const porNumero = db.prepare('UPDATE cota SET rede = ? WHERE id = 1')
  const reiniciar = db.prepare('UPDATE cota SET desde = ?, rede = 0 WHERE id = 1')
  const gravarUso = db.prepare('INSERT INTO usos (quando, dados) VALUES (?, ?)')
  const listarUsos = db.prepare('SELECT quando, dados FROM usos ORDER BY quando DESC')
  const limparUsos = db.prepare('DELETE FROM usos')
  // `LIMIT -1 OFFSET ?` é o idioma do SQLite para "tudo depois dos N
  // primeiros" — o mesmo do `aparar` do acervo. Com a ordem `quando DESC`, o
  // que sobra do offset são as linhas mais antigas.
  const apararUsos = db.prepare(
    `DELETE FROM usos WHERE rowid IN (
       SELECT rowid FROM usos ORDER BY quando DESC LIMIT -1 OFFSET ?
     )`,
  )

  function ler() {
    abrirCiclo.run(agora())
    const linha = lerLinha.get()
    return {
      desde: linha.desde,
      rede: Number(linha.rede),
      usos: listarUsos.all().map((l) => ({ quando: l.quando, ...JSON.parse(l.dados) })),
    }
  }

  /**
   * Uma requisição que saiu: o número sobe e a linha entra.
   *
   * As duas na **mesma transação**. Separadas, existiria a janela em que a
   * requisição foi contada e não aparece na lista — e uma lista que não
   * explica o número é o defeito de 03/09 voltando por outra porta.
   */
  function registrar(dados = {}, quando = agora()) {
    db.exec('BEGIN')
    try {
      abrirCiclo.run(quando)
      incrementar.run()
      gravarUso.run(quando, JSON.stringify(dados))
      apararUsos.run(teto)
      db.exec('COMMIT')
    } catch (err) {
      // O erro do ROLLBACK não pode substituir o erro de verdade — mesma
      // razão do `guardar` do acervo.
      try {
        db.exec('ROLLBACK')
      } catch {
        // Desfazer já falhou; quem manda é o original.
      }
      throw err
    }
    return ler()
  }

  /**
   * Ciclo novo: zera o número, a data e o histórico.
   *
   * À mão, e não por calendário: o provedor conta pela data da assinatura, não
   * pelo dia 1º, e adivinhar isso daria um número errado.
   */
  function zerar(quando = agora()) {
    db.exec('BEGIN')
    try {
      abrirCiclo.run(quando)
      reiniciar.run(quando)
      limparUsos.run()
      db.exec('COMMIT')
    } catch (err) {
      try {
        db.exec('ROLLBACK')
      } catch {
        // idem
      }
      throw err
    }
    return ler()
  }

  /**
   * Põe o contador no número que o provedor mostra.
   *
   * **O histórico não é tocado.** As linhas que estão lá aconteceram mesmo, e
   * apagá-las para casar com um número maior seria trocar dado verdadeiro por
   * aparência de coerência.
   *
   * Valor que não é contagem é ignorado em silêncio: o campo da tela é um
   * `number`, e um `NaN` vindo dele não pode virar o teto do painel.
   */
  function ajustar(gastas) {
    const alvo = Math.round(Number(gastas))
    if (!Number.isInteger(alvo) || alvo < 0) return ler()
    abrirCiclo.run(agora())
    porNumero.run(alvo)
    return ler()
  }

  // `db` sai no objeto pela razão que o `criarAcervo` documenta: sem uma
  // referência viva ao `DatabaseSync`, o GC o coleta, o `node:sqlite` finaliza
  // os statements, e toda rota passa a dar 500 até o processo reiniciar.
  return { db, ler, registrar, zerar, ajustar }
}
```

- [ ] **Step 5: Rode para ver passar**

Run: `npx vitest run src/servidor/banco.test.js`
Expected: PASS.

- [ ] **Step 6: Escreva os testes do teto, do zerar e do ajustar**

```js
  test('o histórico para no teto, e o contador não', () => {
    const pequena = criarCota(abrirBanco(':memory:'), { teto: 3 })
    for (let i = 0; i < 5; i++) {
      pequena.registrar({ consulta: `busca ${i}`, status: 200 }, `2026-09-04T00:0${i}:00.000Z`)
    }

    const lida = pequena.ler()
    expect(lida.usos).toHaveLength(3)
    // O ponto inteiro da separação: o corte da lista não pode encolher o número.
    expect(lida.rede).toBe(5)
  })

  test('zerar reinicia número, data e histórico', () => {
    cota.registrar({ consulta: 'algo', status: 200 })
    const lida = cota.zerar('2026-10-01T00:00:00.000Z')

    expect(lida.rede).toBe(0)
    expect(lida.usos).toEqual([])
    expect(lida.desde).toBe('2026-10-01T00:00:00.000Z')
  })

  test('ajustar muda o número e não toca o histórico', () => {
    cota.registrar({ consulta: 'algo', status: 200 })
    const lida = cota.ajustar(180)

    expect(lida.rede).toBe(180)
    expect(lida.usos).toHaveLength(1)
  })

  test('ajustar ignora o que não é contagem', () => {
    cota.registrar({ consulta: 'algo', status: 200 })
    expect(cota.ajustar('abacaxi').rede).toBe(1)
    expect(cota.ajustar(-3).rede).toBe(1)
  })

  /**
   * Sem uma referência viva ao DatabaseSync o GC o coleta, o node:sqlite
   * finaliza os statements, e toda operação passa a lançar. O `db` no objeto é
   * a trava — apagá-lo por parecer sem uso derruba a produção.
   */
  test('o db sai no objeto, e é ele que segura o banco vivo', () => {
    expect(cota.db).toBeDefined()
  })
```

- [ ] **Step 7: Rode e veja passar**

Run: `npx vitest run src/servidor/banco.test.js`
Expected: PASS, todos.

- [ ] **Step 8: Prove que o teste do teto é honesto**

Troque, temporariamente, `apararUsos.run(teto)` por `apararUsos.run(9999)` (o defeito: sem teto efetivo). Rode. O teste `'o histórico para no teto'` **tem** que falhar com `expected 5 to have length 3`. Desfaça.

- [ ] **Step 9: Commit**

```bash
git add src/servidor/banco.js src/servidor/banco.test.js
git commit -m "banco.js: a cota da conta, ao lado do acervo"
```

---

### Task 2: O middleware que observa a resposta

**Files:**
- Create: `src/servidor/contagem.js`
- Test: `src/servidor/contagem.test.js`

**Interfaces:**
- Consumes: `criarCota` de `./banco.js` (Task 1) — só nos testes; o middleware recebe a cota por parâmetro.
- Produces:
  - `export function consomeCota(res)` → `boolean`
  - `export function contarJSearch(cota)` → middleware `(req, res, next)`

- [ ] **Step 1: Escreva o teste que falha**

Crie `src/servidor/contagem.test.js`:

```js
/**
 * @vitest-environment node
 */

import express from 'express'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { abrirBanco, criarCota } from './banco.js'
import { contarJSearch } from './contagem.js'

/**
 * A regra do que consome cota, exercitada por HTTP de verdade.
 *
 * Ela veio do `tocouApi` do `jsearch.js` e não mudou de significado, só de
 * lugar: consome tudo que a API respondeu, exceto 401; não consome o que nunca
 * saiu da máquina. O que muda é quem decide — antes o cliente, agora o proxy,
 * que é o único que sabe se a requisição de fato saiu.
 *
 * O teste sobe um express real com o middleware e um handler que finge ser o
 * proxy: é o `res` de verdade que chega ao `finish`, não um objeto inventado.
 */

let cota
let servidor
let base

/** Um "proxy" que responde o que o teste pedir, com os marcadores reais. */
function subir(resposta) {
  const app = express()
  app.use('/api/jsearch', contarJSearch(cota), (_req, res) => {
    if (resposta.marcador) res.setHeader('x-jsearch-proxy', resposta.marcador)
    res.status(resposta.status).json({ ok: true })
  })
  return app
}

beforeEach(() => {
  cota = criarCota(abrirBanco(':memory:'))
})

afterEach(() => new Promise((ok) => (servidor ? servidor.close(ok) : ok())))

async function pedir(resposta, caminho = '/api/jsearch/search-v2?query=TI') {
  servidor = subir(resposta).listen(0)
  await new Promise((ok) => servidor.once('listening', ok))
  base = `http://127.0.0.1:${servidor.address().port}`
  await fetch(`${base}${caminho}`)
  // O `finish` é síncrono no fim da resposta, mas o `fetch` do cliente pode
  // voltar antes de o servidor rodar o listener. Um tick basta.
  await new Promise((ok) => setImmediate(ok))
}

describe('contarJSearch: o que consome cota', () => {
  test('200 conta', async () => {
    await pedir({ status: 200 })
    expect(cota.ler().rede).toBe(1)
  })

  test('401 não conta — a API recusa antes de debitar', async () => {
    await pedir({ status: 401 })
    expect(cota.ler().rede).toBe(0)
  })
})
```

- [ ] **Step 2: Rode para ver falhar**

Run: `npx vitest run src/servidor/contagem.test.js`
Expected: FAIL — não resolve `./contagem.js`.

- [ ] **Step 3: Escreva o middleware**

Crie `src/servidor/contagem.js`:

```js
/**
 * A contagem da cota, presa ao HTTP e não a um proxy.
 *
 * ## Por que observar, e não chamar de dentro
 *
 * Há dois proxies para a JSearch: o `reproxiar` do `server.js`, que faz um
 * `fetch` e devolve um buffer, e o `server.proxy` do vite, que faz pipe. Eles
 * não têm nada em comum por dentro — mas produzem a mesma resposta HTTP.
 * Enganchar no `res` é enganchar no que é igual nos dois; enganchar no interior
 * de cada um seriam duas implementações, e duas chances de divergirem. É a
 * mesma razão que tirou as rotas do acervo de dentro do `server.js`.
 *
 * ## A regra veio do cliente, e não mudou de significado
 *
 * Estava no `tocouApi` do `ErroJSearch`: `!guardaLocal && res.status !== 401`.
 * Consome cota tudo que a API respondeu, exceto 401; não consome o que nunca
 * saiu da máquina. Aqui ela é decidida pelo status e por dois marcadores.
 *
 * ## O middleware não atrasa nem altera a resposta
 *
 * Ele registra um listener e chama `next()` na mesma linha. O trabalho acontece
 * no `finish`, quando a resposta já foi enviada — por construção, **a busca
 * não pode falhar por causa do contador**. Um erro de banco aqui vira uma
 * linha no log e nada mais.
 */

const MARCADOR = 'x-jsearch-proxy'

/**
 * Esta resposta debitou uma das 200?
 *
 * `sem-chave` é o ambiente sem `JSEARCH_API_KEY`: a requisição não saiu.
 * `sem-resposta` é o upstream inalcançável — sem ele, o 502 que o `reproxiar`
 * inventa seria indistinguível de um 502 vindo da própria JSearch, e um dos
 * dois não gastou nada.
 */
export function consomeCota(res) {
  const marcador = res.getHeaders?.()[MARCADOR]
  if (marcador === 'sem-chave' || marcador === 'sem-resposta') return false
  return res.statusCode !== 401
}

/**
 * O que a linha do histórico guarda, tirado da própria requisição.
 *
 * Nada é inferido e nada vem do cliente por outro caminho: é a URL que o proxy
 * acabou de usar. `continuacao` distingue "Carregar mais" de busca nova, que é
 * a diferença entre duas linhas que pareceriam iguais na tela.
 */
function daRequisicao(req, res) {
  const url = req.originalUrl ?? req.url ?? ''
  const params = new URLSearchParams(url.slice(url.indexOf('?') + 1))
  return {
    consulta: params.get('query') ?? '',
    janela: params.get('date_posted') ?? '',
    remotas: params.get('work_from_home') === 'true',
    continuacao: params.has('cursor'),
    status: res.statusCode,
  }
}

export function contarJSearch(cota) {
  return (req, res, next) => {
    res.on('finish', () => {
      try {
        if (!consomeCota(res)) return
        cota.registrar(daRequisicao(req, res))
      } catch (err) {
        console.error('[cota] não consegui registrar a requisição:', err.message)
      }
    })
    next()
  }
}
```

- [ ] **Step 4: Rode para ver passar**

Run: `npx vitest run src/servidor/contagem.test.js`
Expected: PASS (2 testes).

- [ ] **Step 5: Escreva o resto da tabela da regra**

```js
  test('429 conta — o limite foi atingido gastando a requisição', async () => {
    await pedir({ status: 429 })
    expect(cota.ler().rede).toBe(1)
  })

  test('400 conta — parâmetro inválido debita igual', async () => {
    await pedir({ status: 400 })
    expect(cota.ler().rede).toBe(1)
  })

  test('chave ausente não conta — a requisição não saiu', async () => {
    await pedir({ status: 500, marcador: 'sem-chave' })
    expect(cota.ler().rede).toBe(0)
  })

  test('upstream inalcançável não conta', async () => {
    await pedir({ status: 502, marcador: 'sem-resposta' })
    expect(cota.ler().rede).toBe(0)
  })
})

describe('contarJSearch: o que a linha guarda', () => {
  test('tira consulta, janela e modalidade da URL do proxy', async () => {
    await pedir(
      { status: 200 },
      '/api/jsearch/search-v2?query=Analista+em+Caxias&date_posted=month&work_from_home=true',
    )

    const [uso] = cota.ler().usos
    expect(uso.consulta).toBe('Analista em Caxias')
    expect(uso.janela).toBe('month')
    expect(uso.remotas).toBe(true)
    expect(uso.continuacao).toBe(false)
    expect(uso.status).toBe(200)
  })

  test('cursor na URL marca a linha como continuação', async () => {
    await pedir({ status: 200 }, '/api/jsearch/search-v2?query=TI&cursor=abc123')
    expect(cota.ler().usos[0].continuacao).toBe(true)
  })
})

describe('contarJSearch: nunca derruba a busca', () => {
  /**
   * O contador é acessório; a busca custou uma das 200 e já está na tela.
   * Como o listener roda no `finish`, ele nem tem como afetar a resposta — este
   * teste trava essa propriedade contra um refactor que mova a chamada para
   * antes do `next()`.
   */
  test('banco quebrado não muda a resposta da busca', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {})
    cota = {
      registrar() {
        throw new Error('banco fora do ar')
      },
      ler: () => ({ desde: null, rede: 0, usos: [] }),
    }

    servidor = subir({ status: 200 }).listen(0)
    await new Promise((ok) => servidor.once('listening', ok))
    const res = await fetch(
      `http://127.0.0.1:${servidor.address().port}/api/jsearch/search-v2?query=TI`,
    )

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    await new Promise((ok) => setImmediate(ok))
    expect(erro).toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: Rode e veja passar**

Run: `npx vitest run src/servidor/contagem.test.js`
Expected: PASS, todos.

- [ ] **Step 7: Prove que os testes são honestos**

Troque `return res.statusCode !== 401` por `return true` (o defeito: 401 passa a contar). O teste `'401 não conta'` **tem** que falhar. Desfaça.

Depois apague a linha do `sem-chave`/`sem-resposta`; os dois testes de marcador **têm** que falhar. Desfaça.

- [ ] **Step 8: Commit**

```bash
git add src/servidor/contagem.js src/servidor/contagem.test.js
git commit -m "contagem.js: quem conta a cota é quem faz a requisição"
```

---

### Task 3: O marcador `sem-resposta` nos dois proxies

**Files:**
- Modify: `server.js` (o `catch` do `reproxiar`, ~linha 148)
- Modify: `vite.config.js` (o `proxy.on('error')` do jsearch, ~linha 119)
- Test: `src/servidor/app.test.js` (acrescenta um `describe`)

**Interfaces:**
- Consumes: nada.
- Produces: o header `x-jsearch-proxy: sem-resposta` nas duas respostas de upstream inalcançável — que o `consomeCota` da Task 2 já sabe ler.

- [ ] **Step 1: Escreva o teste que falha**

Acrescente em `src/servidor/app.test.js`:

```js
describe('reproxiar: upstream inalcançável', () => {
  /**
   * O 502 que o `server.js` inventa quando o `fetch` não sai é byte a byte
   * igual a um 502 vindo da JSearch — e um deles não gastou cota nenhuma. O
   * marcador é o que torna a regra da contagem decidível.
   */
  test('marca a resposta como sem-resposta, para não contar cota', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('getaddrinfo ENOTFOUND'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    process.env.JSEARCH_API_KEY = 'chave-de-teste'

    const res = await fetch(`${base}/api/jsearch/search-v2?query=TI`)

    expect(res.status).toBe(502)
    expect(res.headers.get('x-jsearch-proxy')).toBe('sem-resposta')
  })
})
```

> Ajuste o `beforeEach`/`base` ao que o arquivo já usa. Se `app.test.js` ainda não tem `vi` no import do vitest, acrescente.

- [ ] **Step 2: Rode para ver falhar**

Run: `npx vitest run src/servidor/app.test.js`
Expected: FAIL — `expected null to be 'sem-resposta'`.

- [ ] **Step 3: Marque no `server.js`**

Em `server.js`, no `catch` do `reproxiar`:

```js
    } catch (err) {
      console.error(`[${destino.nome}] erro de proxy:`, err.message)
      // O upstream não respondeu: nenhuma cota foi debitada. Sem este
      // marcador, este 502 é indistinguível de um 502 vindo da própria API, e
      // a contagem creditaria uma requisição que nunca aconteceu.
      res.setHeader(`x-${destino.nome}-proxy`, 'sem-resposta')
      // 502 e não 500: o servidor está de pé, quem não respondeu foi o
      // upstream. A distinção importa para quem lê o log depois.
      res.status(502).json({
        message: `Falha ao falar com a ${destino.nome}: ${err.message}`,
      })
    }
```

- [ ] **Step 4: Rode para ver passar**

Run: `npx vitest run src/servidor/app.test.js`
Expected: PASS.

- [ ] **Step 5: Escreva o teste do lado do vite**

Acrescente em `src/servidor/contagem.test.js`:

```js
describe('vite: o proxy do dev marca o mesmo', () => {
  /**
   * O `npm run dev` usa outro proxy, e o README promete que ele se comporta
   * igual. Sem o marcador dos dois lados, contar em produção e contar no dev
   * dariam números diferentes pela mesma falha de rede.
   */
  test('proxy.on("error") põe sem-resposta na resposta', async () => {
    const { default: configVite } = await import('../../vite.config.js')
    const config = await configVite({ mode: 'development' })
    const alvo = config.server.proxy['/api/jsearch']

    const ouvintes = {}
    alvo.configure({ on: (evento, fn) => (ouvintes[evento] = fn) })

    const postos = {}
    const res = { headersSent: false, setHeader: (k, v) => (postos[k] = v) }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    ouvintes.error(new Error('ECONNREFUSED'), {}, res)

    expect(postos['x-jsearch-proxy']).toBe('sem-resposta')
  })
})
```

- [ ] **Step 6: Rode para ver falhar**

Run: `npx vitest run src/servidor/contagem.test.js`
Expected: FAIL — `expected undefined to be 'sem-resposta'`.

- [ ] **Step 7: Marque no `vite.config.js`**

No `proxy.on('error')` do bloco `[PREFIXO]`:

```js
            proxy.on('error', (err, _req, res) => {
              console.error('[jsearch] erro de proxy:', err.message)
              // O mesmo marcador do `server.js`: upstream inalcançável não
              // debitou cota. Sem ele, dev e produção contariam diferente
              // pela mesma falha de rede.
              if (res?.setHeader && !res.headersSent) {
                res.setHeader('x-jsearch-proxy', 'sem-resposta')
              }
            })
```

> `res?.setHeader` e não `res.setHeader`: no caminho de websocket o terceiro argumento é um socket, que não tem o método.

- [ ] **Step 8: Rode para ver passar**

Run: `npx vitest run src/servidor/contagem.test.js src/servidor/app.test.js`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add server.js vite.config.js src/servidor/app.test.js src/servidor/contagem.test.js
git commit -m "Proxies: separar 'não consegui perguntar' de 'perguntaram e deu erro'"
```

---

### Task 4: As rotas da cota, e o segredo

**Files:**
- Create: `src/servidor/rotasCota.js`
- Test: `src/servidor/rotasCota.test.js`

**Interfaces:**
- Consumes: `criarCota` de `./banco.js` (Task 1).
- Produces: `export function criarRotasCota(cota)` → um app do express montável em `/api/cota`.

- [ ] **Step 1: Escreva o teste que falha**

Crie `src/servidor/rotasCota.test.js`:

```js
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
```

- [ ] **Step 2: Rode para ver falhar**

Run: `npx vitest run src/servidor/rotasCota.test.js`
Expected: FAIL — não resolve `./rotasCota.js`.

- [ ] **Step 3: Escreva as rotas**

Crie `src/servidor/rotasCota.js`:

```js
/**
 * As rotas da cota.
 *
 * Moram aqui, e não no `server.js`, pela razão que o `rotas.js` do acervo já
 * documenta: há dois servidores — o `server.js` no Railway e o dev server do
 * vite —, e duas cópias das mesmas rotas seriam duas chances de divergirem.
 *
 * ## Um sub-app do express, e não um `Router`
 *
 * Do lado do vite isto é montado numa pilha connect, onde o `res` é um
 * `http.ServerResponse` cru, sem `json` nem `status`. Quem instala esses
 * métodos é o middleware `init` que todo app do express roda — um `Router`
 * sozinho não o traz, e as rotas quebrariam em `res.json is not a function`.
 *
 * ## Não há DELETE
 *
 * Mesma decisão do acervo, satisfeita por ausência de código: o que não existe
 * não pode ser chamado por engano.
 */

import express from 'express'

/**
 * O segredo que tranca as duas rotas destrutivas.
 *
 * Lido do ambiente a cada pedido, e não uma vez no import: o teste troca a
 * variável entre casos, e um valor capturado na carga do módulo tornaria isso
 * impossível de exercitar.
 *
 * **Variável ausente significa aberto.** É deliberado: o `npm run dev` não
 * pode passar a exigir senha, e quem já roda local não pode quebrar por causa
 * de uma variável que só existe no Railway.
 */
function segredoDoAmbiente() {
  return process.env.CONTROLE_SEGREDO?.trim() || null
}

/**
 * Deixa passar quando não há segredo, ou quando o header bate.
 *
 * 403 e não 401: 401 pede autenticação por um esquema que não existe aqui, e o
 * cliente ficaria esperando um `WWW-Authenticate` que ninguém manda.
 */
function comSegredo(req, res, next) {
  const esperado = segredoDoAmbiente()
  if (!esperado) return next()
  if (req.get('x-controle-segredo') === esperado) return next()
  res.status(403).json({
    message: 'Senha do controle ausente ou errada. Zerar e ajustar são do dono da conta.',
  })
}

export function criarRotasCota(cota) {
  const rotas = express()
  const json = express.json({ limit: '4kb' })

  /**
   * A leitura nunca pede senha.
   *
   * Ler o número não estraga nada, e trancar a leitura esconderia a informação
   * de quem o painel existe para informar. `protegido` é um booleano — diz à
   * tela se deve pedir a senha, e não revela nada sobre ela.
   */
  rotas.get('/', (_req, res) => {
    res.json({ ...cota.ler(), protegido: Boolean(segredoDoAmbiente()) })
  })

  rotas.post('/zerar', comSegredo, (_req, res) => {
    res.json(cota.zerar())
  })

  rotas.post('/ajustar', comSegredo, json, (req, res) => {
    res.json(cota.ajustar(req.body?.gastas))
  })

  return rotas
}
```

- [ ] **Step 4: Rode para ver passar**

Run: `npx vitest run src/servidor/rotasCota.test.js`
Expected: PASS.

- [ ] **Step 5: Escreva os testes das rotas de escrita e do segredo**

```js
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
```

- [ ] **Step 6: Rode e veja passar**

Run: `npx vitest run src/servidor/rotasCota.test.js`
Expected: PASS, todos.

- [ ] **Step 7: Prove que o teste do segredo é honesto**

Troque o corpo de `comSegredo` por `return next()` (o defeito: a porta aberta). O teste `'com a variável e sem o header, 403'` **tem** que falhar. Desfaça.

- [ ] **Step 8: Commit**

```bash
git add src/servidor/rotasCota.js src/servidor/rotasCota.test.js
git commit -m "rotasCota.js: ler é de todos, zerar e ajustar são do dono"
```

---

### Task 5: Montar nos dois stacks, com um handle de banco só

**Files:**
- Modify: `server.js` (o `criarApp`)
- Rename: `src/servidor/pluginAcervo.js` → `src/servidor/pluginServidor.js`
- Modify: `vite.config.js` (o import e a chamada do plugin)
- Modify: `src/servidor/rotas.test.js` e `src/servidor/app.test.js` (o `criarApp` passa a receber `banco`)
- Test: `src/servidor/app.test.js`, `src/servidor/dev.test.js`

**Interfaces:**
- Consumes: `criarCota` (Task 1), `contarJSearch` (Task 2), `criarRotasCota` (Task 4).
- Produces: `criarApp({ banco, acervo, cota })`; `pluginServidor({ acervo, cota })`.

- [ ] **Step 1: Escreva o teste que falha**

Em `src/servidor/app.test.js`:

```js
describe('a cota está montada no app de produção', () => {
  test('GET /api/cota responde JSON, e não o index.html do catch-all', async () => {
    const res = await fetch(`${base}/api/cota`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')
    expect((await res.json()).rede).toBe(0)
  })
})
```

- [ ] **Step 2: Rode para ver falhar**

Run: `npx vitest run src/servidor/app.test.js`
Expected: FAIL — o catch-all da SPA responde `index.html`, então o `content-type` é `text/html` (ou o `res.json()` lança).

- [ ] **Step 3: Mude o `criarApp`**

Em `server.js`, troque a assinatura e a montagem:

```js
import { abrirBanco, caminhoDoBanco, criarAcervo, criarCota } from './src/servidor/banco.js'
import { contarJSearch } from './src/servidor/contagem.js'
import { criarRotasAcervo } from './src/servidor/rotas.js'
import { criarRotasCota } from './src/servidor/rotasCota.js'
```

```js
/**
 * Monta o servidor sem escutar.
 *
 * ## Um banco, um handle
 *
 * `acervo` e `cota` moram no mesmo arquivo SQLite e precisam do **mesmo**
 * `DatabaseSync`. Dois handles no mesmo arquivo são as duas réplicas que o
 * README proíbe, dentro de um processo só.
 *
 * A abertura é preguiçosa: um teste que injeta os dois nunca toca o disco. Um
 * default de parâmetro seria avaliado mesmo com `acervo` e `cota` dados, e
 * `npm test` voltaria a criar um `acervo.db` no repositório.
 */
export function criarApp({ banco = null, acervo = null, cota = null } = {}) {
  let db = banco
  const oBanco = () => (db ??= abrirBanco(caminhoDoBanco()))
  const oAcervo = acervo ?? criarAcervo(oBanco())
  const aCota = cota ?? criarCota(oBanco())

  const app = express()

  for (const destino of DESTINOS) {
    app.use(
      destino.de,
      // Só a JSearch tem cota de 200/mês. A Claude é cobrada por token e tem
      // o próprio medidor, no `custo.js`.
      ...(destino.nome === 'jsearch' ? [contarJSearch(aCota)] : []),
      express.raw({ type: () => true, limit: '10mb' }),
      reproxiar(destino),
    )
  }

  app.use('/api/acervo', criarRotasAcervo(oAcervo))
  app.use('/api/cota', criarRotasCota(aCota))

  app.use(express.static(DIST))
  app.use((_req, res) => res.sendFile(path.join(DIST, 'index.html')))

  return app
}
```

> O `contarJSearch` vem **antes** do `express.raw`: ele só registra um listener e chama `next()`, e assim vale mesmo que o corpo falhe de ler.

- [ ] **Step 4: Conserte os testes que passavam `acervo` sozinho**

Em `src/servidor/rotas.test.js` e `src/servidor/app.test.js`, troque:

```js
  acervo = criarAcervo(abrirBanco(':memory:'))
  servidor = criarApp({ acervo }).listen(0)
```

por:

```js
  // Um banco em memória para os dois: passar só o acervo faria o `criarApp`
  // abrir o arquivo de verdade para a cota, e `npm test` criaria um acervo.db
  // no repositório.
  const banco = abrirBanco(':memory:')
  acervo = criarAcervo(banco)
  servidor = criarApp({ banco, acervo, cota: criarCota(banco) }).listen(0)
```

Acrescente `criarCota` aos imports desses arquivos.

- [ ] **Step 5: Rode para ver passar**

Run: `npx vitest run src/servidor/`
Expected: PASS. E confirme que **nenhum `acervo.db` apareceu**: `git status --short` limpo, e `ls acervo.db` não encontra nada.

- [ ] **Step 6: Renomeie o plugin e monte a cota nele**

```bash
git mv src/servidor/pluginAcervo.js src/servidor/pluginServidor.js
```

Troque, dentro do arquivo, o nome exportado e o corpo:

```js
export function pluginServidor({ acervo, cota } = {}) {
  return {
    name: 'servidor-no-dev',
    async configureServer(server) {
      // Dinâmicos de propósito — ver o docstring acima. Um import estático põe
      // `node:sqlite` no grafo do `src/api/claude.test.js`, que roda em jsdom.
      const { abrirBanco, caminhoDoBanco, criarAcervo, criarCota } = await import('./banco.js')
      const { criarRotasAcervo } = await import('./rotas.js')
      const { criarRotasCota } = await import('./rotasCota.js')
      const { contarJSearch } = await import('./contagem.js')

      // O banco abre no primeiro pedido, não ao montar: o vitest sobe um dev
      // server interno só para transformar módulos, e abrir aqui faria
      // `npm test` criar um acervo.db no repositório.
      let db = null
      const oBanco = () => (db ??= abrirBanco(caminhoDoBanco()))
      let rotasAcervo = null
      let rotasCota = null
      let aCota = null
      const cotaDaVez = () => (aCota ??= cota ?? criarCota(oBanco()))

      server.middlewares.use('/api/acervo', (req, res, next) => {
        rotasAcervo ??= criarRotasAcervo(acervo ?? criarAcervo(oBanco()))
        rotasAcervo(req, res, next)
      })

      server.middlewares.use('/api/cota', (req, res, next) => {
        rotasCota ??= criarRotasCota(cotaDaVez())
        rotasCota(req, res, next)
      })

      // A contagem vem antes do proxy do vite na pilha, e é o mesmo middleware
      // que o `server.js` monta. Ele só registra um listener e segue.
      server.middlewares.use('/api/jsearch', (req, res, next) => {
        contarJSearch(cotaDaVez())(req, res, next)
      })
    },
  }
}
```

E atualize o docstring do topo do arquivo: ele hoje fala só do acervo, e passa a montar três coisas.

- [ ] **Step 7: Troque o import no `vite.config.js`**

```js
import { pluginServidor } from './src/servidor/pluginServidor.js'
```

e, na lista de plugins, `pluginAcervo()` vira `pluginServidor()`.

- [ ] **Step 8: Rode a suíte inteira**

Run: `npm test`
Expected: PASS, tudo. `grep -rn "pluginAcervo" src vite.config.js` não pode achar nada.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "Montagem: a cota nos dois stacks, com um handle de banco só"
```

---

### Task 6: O cliente da cota

**Files:**
- Create: `src/cotaRemota.js`
- Test: `src/cotaRemota.test.js`

**Interfaces:**
- Consumes: as rotas da Task 4.
- Produces:
  - `export class ErroCota extends Error` com `{ status, causa }`
  - `export async function lerCotaRemota()` → `{ desde, rede, usos, protegido }`
  - `export async function zerarRemoto(segredo)` / `export async function ajustarRemoto(gastas, segredo)`

- [ ] **Step 1: Escreva o teste que falha**

Crie `src/cotaRemota.test.js`:

```js
import { afterEach, describe, expect, test, vi } from 'vitest'
import { ErroCota, lerCotaRemota } from './cotaRemota'

afterEach(() => vi.restoreAllMocks())

function respondendo(corpo, { status = 200, tipo = 'application/json' } = {}) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), {
      status,
      headers: { 'content-type': tipo },
    }),
  )
}

describe('lerCotaRemota', () => {
  test('devolve o que o servidor mandou', async () => {
    respondendo({ desde: '2026-09-01T00:00:00.000Z', rede: 42, usos: [], protegido: false })

    const cota = await lerCotaRemota()
    expect(cota.rede).toBe(42)
  })

  /**
   * A regra que este módulo existe para garantir, na mesma forma do
   * `acervoRemoto.js`: falha **nunca** vira zero. Um `0 / 200` por queda de
   * rede diria "você tem as 200 inteiras" para quem já gastou 180 — e o
   * conselho implícito custa dinheiro.
   */
  test('200 com corpo que não é JSON lança, não devolve zero', async () => {
    respondendo('<!doctype html><html>...', { tipo: 'text/html' })

    await expect(lerCotaRemota()).rejects.toBeInstanceOf(ErroCota)
  })
})
```

- [ ] **Step 2: Rode para ver falhar**

Run: `npx vitest run src/cotaRemota.test.js`
Expected: FAIL — não resolve `./cotaRemota`.

- [ ] **Step 3: Escreva o módulo**

Crie `src/cotaRemota.js`:

```js
/**
 * A cota, do outro lado da rede.
 *
 * Irmão do `acervoRemoto.js`, e pelas mesmas razões — inclusive a que dá nome
 * ao arquivo dele: **falha nunca vira zero**.
 *
 * Aqui isso é mais grave que no acervo. Um acervo vazio por queda de rede
 * aconselha "faça uma busca"; um contador zerado por queda de rede diz "você
 * tem as 200 inteiras" para quem já gastou 180, e quem acreditar gasta
 * dinheiro. Por isso erro lança, e quem chama decide o que a tela mostra.
 */

const BASE = '/api/cota'

export class ErroCota extends Error {
  constructor(mensagem, { status = 0, causa = '' } = {}) {
    super(mensagem)
    this.name = 'ErroCota'
    this.status = status
    // O texto cru de quem falhou, para o console — nunca para a tela. A
    // mensagem do `fetch` é fixada em inglês pelos browsers.
    this.causa = causa
  }
}

async function ida(caminho, opcoes) {
  let res
  try {
    res = await fetch(`${BASE}${caminho}`, opcoes)
  } catch (err) {
    throw new ErroCota(
      'Não foi possível falar com o servidor da cota. Ele pode estar fora do ar.',
      { causa: err.message },
    )
  }

  let corpo = null
  try {
    corpo = await res.json()
  } catch {
    // Tratado abaixo conforme o status.
  }

  if (!res.ok) {
    throw new ErroCota(corpo?.message || `O servidor respondeu ${res.status}.`, {
      status: res.status,
    })
  }

  // 200 com corpo que não é JSON é falha, não cota zerada. O catch-all da SPA
  // responde `index.html` para qualquer rota desconhecida: renomear
  // `/api/cota` numa manutenção futura transformaria o painel em 0/200.
  if (corpo === null) {
    throw new ErroCota(
      'O servidor respondeu algo que não é a cota. Ele pode estar em atualização.',
      { status: res.status },
    )
  }

  return corpo
}

/** O que o painel desenha. Lança quando não dá para saber. */
export async function lerCotaRemota() {
  return ida('')
}

const COMO_JSON = { 'content-type': 'application/json' }

/** O header do segredo, omitido quando não há — servidor aberto o aceita assim. */
function comSegredo(segredo) {
  return segredo ? { 'x-controle-segredo': segredo } : {}
}

export async function zerarRemoto(segredo = '') {
  return ida('/zerar', { method: 'POST', headers: comSegredo(segredo) })
}

export async function ajustarRemoto(gastas, segredo = '') {
  return ida('/ajustar', {
    method: 'POST',
    headers: { ...COMO_JSON, ...comSegredo(segredo) },
    body: JSON.stringify({ gastas }),
  })
}
```

- [ ] **Step 4: Rode para ver passar**

Run: `npx vitest run src/cotaRemota.test.js`
Expected: PASS.

- [ ] **Step 5: Escreva os testes dos erros e das escritas**

```js
describe('lerCotaRemota: os erros', () => {
  test('fetch que não sai vira mensagem em português, com a causa no objeto', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Failed to fetch'))

    const erro = await lerCotaRemota().catch((e) => e)
    expect(erro).toBeInstanceOf(ErroCota)
    // A mensagem do browser é fixada em inglês; ela fica na causa, para o
    // console, e nunca na tela.
    expect(erro.message).not.toContain('Failed to fetch')
    expect(erro.causa).toBe('Failed to fetch')
  })

  test('403 chega com o status, para a tela desabilitar os botões', async () => {
    respondendo({ message: 'Senha do controle ausente ou errada.' }, { status: 403 })

    const erro = await zerarRemoto('errada').catch((e) => e)
    expect(erro.status).toBe(403)
    expect(erro.message).toContain('Senha do controle')
  })
})

describe('ajustarRemoto', () => {
  test('manda o número no corpo e o segredo no header', async () => {
    const espiao = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(JSON.stringify({ rede: 180, usos: [], desde: null }), {
          headers: { 'content-type': 'application/json' },
        }),
      )

    await ajustarRemoto(180, 'senha')

    const [, opcoes] = espiao.mock.calls[0]
    expect(JSON.parse(opcoes.body)).toEqual({ gastas: 180 })
    expect(opcoes.headers['x-controle-segredo']).toBe('senha')
  })
})
```

Acrescente `ajustarRemoto` e `zerarRemoto` ao import do topo.

- [ ] **Step 6: Rode e veja passar**

Run: `npx vitest run src/cotaRemota.test.js`
Expected: PASS, todos.

- [ ] **Step 7: Commit**

```bash
git add src/cotaRemota.js src/cotaRemota.test.js
git commit -m "cotaRemota.js: a cota do outro lado da rede, e falha nunca vira zero"
```

---

### Task 7: O painel Controle, e o `cota.js` encolhendo

**Files:**
- Modify: `src/App.jsx` (imports ~4-15; o estado ~3271; os 10 `registrarUso`; `PainelControle` ~2728; a montagem ~4531)
- Modify: `src/cota.js` (remove contador, `desde`, `usos`)
- Modify: `src/cota.test.js` (remove os testes do que saiu)
- Test: `src/App.test.jsx` (acrescenta um `describe` para o painel)

**Interfaces:**
- Consumes: `lerCotaRemota`, `zerarRemoto`, `ajustarRemoto`, `ErroCota` (Task 6).
- Produces: `PainelControle` passa a receber `cota` (do servidor), `estado`, `erro`, `onTentarDeNovo`, `segredo`, `onSegredo`.

- [ ] **Step 1: Escreva o teste que falha**

Em `src/App.test.jsx`:

```js
import { PainelControle } from './App'

describe('PainelControle: falha nunca vira zero', () => {
  /**
   * Um `0 / 200` por queda de rede diz "você tem as 200 inteiras" para quem já
   * gastou 180 — e o conselho implícito custa dinheiro. É a mesma classe de
   * falha silenciosa que o `acervoRemoto.js` inteiro existe para impedir.
   */
  test('estado falhou mostra o erro, e não o número zero', () => {
    const container = montar(
      <PainelControle
        cota={{ desde: null, rede: 0, usos: [], protegido: false }}
        estado="falhou"
        erro="O servidor respondeu 500."
        doCache={0}
        onTentarDeNovo={() => {}}
        onZerar={() => {}}
        onAjustar={() => {}}
        onLimparCache={() => {}}
        custo={{ chamadas: [], teto: 5 }}
        onZerarCusto={() => {}}
      />,
    )

    expect(container.textContent).toContain('O servidor respondeu 500.')
    expect(container.textContent).not.toContain('0 / 200')
  })
})
```

- [ ] **Step 2: Rode para ver falhar**

Run: `npx vitest run src/App.test.jsx`
Expected: FAIL — `PainelControle` não é exportado.

- [ ] **Step 3: Exporte o painel e dê-lhe os três estados**

Em `src/App.jsx`, `function PainelControle` vira `export function PainelControle`, com os parâmetros novos:

```js
export function PainelControle({
  cota,
  estado,
  erro,
  onTentarDeNovo,
  doCache,
  onZerar,
  onAjustar,
  onLimparCache,
  custo,
  onZerarCusto,
  segredo,
  onSegredo,
}) {
  const gastas = cota.rede
  const restantes = Math.max(0, LIMITE_MENSAL - gastas)
  const fracao = gastas / LIMITE_MENSAL
```

E, logo no início do `return`, antes do cartão do número:

```js
  // Falha de rede não pode virar 0/200 — ver o docstring do `cotaRemota.js`.
  if (estado !== 'pronto') {
    return (
      <div style={{ padding: '64px 20px', textAlign: 'center' }}>
        <div style={{ fontSize: 15, fontWeight: 600 }}>
          {estado === 'carregando' ? 'Lendo a cota…' : 'Não consegui ler a cota'}
        </div>
        {estado === 'falhou' && (
          <div style={{ fontSize: 13, color: '#8A94A6', marginTop: 10 }}>
            A contagem vive no servidor, e ele não respondeu. {erro}
            <div style={{ marginTop: 12 }}>
              <button
                onClick={onTentarDeNovo}
                className="bg-[#0E1729] text-[#C8D1E0] hover:bg-[#152039]"
                style={{
                  padding: '8px 14px',
                  borderRadius: 9,
                  border: '1px solid rgba(255,255,255,0.12)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Tentar de novo
              </button>
            </div>
          </div>
        )}
      </div>
    )
  }
```

- [ ] **Step 4: Rode para ver passar**

Run: `npx vitest run src/App.test.jsx`
Expected: PASS.

- [ ] **Step 5: Ligue o painel ao servidor**

Em `src/App.jsx`, o estado de hoje é **um só** (`const [cota, setCota] = useState(lerCota)`) e vira **dois**, porque agora são duas coisas com donos diferentes: o número é da conta, o cache é deste navegador.

```js
  // O que é da conta, e vem do servidor.
  const [cota, setCota] = useState({ desde: null, rede: 0, usos: [], protegido: false })
  const [cotaEstado, setCotaEstado] = useState('carregando')
  const [cotaErro, setCotaErro] = useState('')
  const [tentativaCota, setTentativaCota] = useState(0)
  // O segredo do controle é do dono e mora só no navegador dele.
  const [segredo, setSegredo] = useState(() => {
    try {
      return localStorage.getItem('vagas:controle') ?? ''
    } catch {
      return ''
    }
  })

  useEffect(() => {
    let vivo = true
    setCotaEstado('carregando')
    lerCotaRemota()
      .then((lida) => {
        if (!vivo) return
        setCota(lida)
        setCotaEstado('pronto')
      })
      .catch((err) => {
        if (!vivo) return
        console.warn('[cota] falha ao carregar:', err.causa || err.message)
        setCotaErro(err.message)
        setCotaEstado('falhou')
      })
    return () => {
      vivo = false
    }
  }, [tentativaCota])
```

E o que continua sendo deste navegador — o cache e a contagem de repetições:

```js
  // O que é do navegador. `lerCota` encolheu junto (Step 6) e devolve só
  // `{ cache, totais: { cache } }`.
  const [cacheLocal, setCacheLocal] = useState(lerCota)

  /** Uma falha de escrita da cota vira aviso, e não derruba o painel. */
  function aviso(err) {
    console.warn('[cota]', err.causa || err.message)
    setCotaErro(err.message)
  }
```

**Os 10 `setCota(registrarUso(...))` do `App.jsx` viram `setCacheLocal(registrarUso(...))`.** A assinatura do `registrarUso` não muda — só o estado que recebe o retorno. Estão nas linhas ~3624, ~3665, ~3692, ~3715, ~3763, ~3814, ~3834, ~4004, ~4026 e ~4046; confirme com `grep -n "setCota(" src/App.jsx` antes e depois, e o resultado depois tem que ser **zero** ocorrências de `setCota(registrarUso`.

E a montagem (~linha 4531):

```js
            <PainelControle
              cota={cota}
              estado={cotaEstado}
              erro={cotaErro}
              onTentarDeNovo={() => setTentativaCota((n) => n + 1)}
              doCache={servidasDoCache(cacheLocal)}
              onZerar={() => zerarRemoto(segredo).then(setCota).catch(aviso)}
              onAjustar={(gastas) => ajustarRemoto(gastas, segredo).then(setCota).catch(aviso)}
              onLimparCache={() => setCacheLocal(limparCache())}
              segredo={segredo}
              onSegredo={(valor) => {
                setSegredo(valor)
                try {
                  localStorage.setItem('vagas:controle', valor)
                } catch {
                  // Storage bloqueado: a senha vale só nesta sessão.
                }
              }}
              custo={custo}
              onZerarCusto={() => setCusto(zerarCusto())}
            />
```

E o import do topo do `App.jsx` (~linhas 4-15) perde `ajustarContagem`, `usadas` e `zerarContagem`, e ganha:

```js
import { ajustarRemoto, lerCotaRemota, zerarRemoto } from './cotaRemota'
```

- [ ] **Step 6: Encolha o `cota.js`**

Remova de `src/cota.js`: `registrarUso` deixa de incrementar `totais.rede` e de acrescentar a `usos`; saem `zerarContagem`, `ajustarContagem`, `usadas`, `TETO_HISTORICO` e o campo `desde`. Ficam `chaveDaConsulta`, `consultarCache`, `paginasDoCache`, `proximaPagina`, `limparCache`, `TETO_CACHE`, `servidasDoCache` e `lerCota` (que passa a devolver só `{ cache, totais: { cache } }`).

Atualize o docstring do topo: o parágrafo "E o total ainda é do navegador, não da conta" descreve um defeito que deixou de existir, e passa a explicar por que o **cache** continua local.

> **Atenção — armadilha registrada.** `registrarUso` tem **10 chamadores** no `App.jsx`. Renomear ou mudar assinatura sem procurá-los já quebrou uma aba inteira aqui (`registrarBusca` → `registrarUso`), e o lint não avisou. Mantenha a assinatura e rode `grep -n "registrarUso\|lerCota\|usadas\|zerarContagem\|ajustarContagem" src/` antes de dar por encerrado.

- [ ] **Step 7: Rode a suíte inteira**

Run: `npm test && npm run lint`
Expected: PASS. Remova de `src/cota.test.js` os testes das funções que saíram; os do cache continuam.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "Controle: o número vem do servidor; o cache continua seu"
```

---

### Task 8: Verificação nos dois modos, e deploy

**Files:**
- Modify: `README.md` (a seção "Railway — a versão que funciona": a terceira variável)
- Modify: `ONDE-PARAMOS.md` (entrada do dia)

- [ ] **Step 1: Verifique no `npm run dev`**

```bash
npm run dev
```

Abra `http://localhost:5173/vagasatalhointeligenteparati/`, faça **uma** busca real, e confira na aba Controle que o número subiu de 1 e a linha apareceu em "Últimas buscas". Confira também `curl -s localhost:5173/api/cota`.

> "Verificar num modo não verifica no outro" já custou um dia aqui, e este trabalho mexe justamente no que difere entre os dois.

- [ ] **Step 2: Verifique em produção local**

```bash
MSYS_NO_PATHCONV=1 BASE_PATH=/ npm run build
PORT=3010 BANCO_CAMINHO=/tmp/cota-verificacao.db node server.js
```

Abra `http://localhost:3010/`, repita a busca (deve vir do cache e **não** subir o número) e faça uma busca nova (deve subir). Confira o 403: com `CONTROLE_SEGREDO=x` no ambiente, "Zerar" tem que recusar sem a senha.

- [ ] **Step 3: Configure o Railway**

```bash
railway variables --set CONTROLE_SEGREDO=<escolha uma senha>
```

E documente no README, ao lado das duas variáveis que já estão lá: `CONTROLE_SEGREDO` é opcional; ausente, "Zerar" e "Ajustar" ficam abertos.

- [ ] **Step 4: Commit e deploy**

```bash
git add README.md ONDE-PARAMOS.md
git commit -m "ONDE-PARAMOS: a cota passou a contar a conta"
git push origin main
```

- [ ] **Step 5: Confirme o deploy e ajuste o número**

Espere o Railway servir o bundle novo, abra a aba Controle e use **"Ajustar"** uma vez com o número que o painel da OpenWeb Ninja mostra. É a migração inteira: o contador local de cada navegador é um palpite, e o número certo já tem dono.

---

## Notas de auto-revisão

Conferido contra a spec, seção por seção:

- §5 (tabelas) → Task 1. §6 (regra do que conta) → Tasks 2 e 3. §7 (rotas e segredo) → Task 4. §4 (módulos e montagem) → Task 5. §8 (tela) → Tasks 6 e 7. §9 (migração) → Task 8, Step 5. §10 (erros) → testes nas Tasks 2, 6 e 7. §12 (testes) → distribuídos. §13 (ordem) → a ordem das tasks.
- `criarCota`, `contarJSearch`, `criarRotasCota`, `lerCotaRemota`, `zerarRemoto`, `ajustarRemoto` têm o mesmo nome e a mesma assinatura em todas as tasks onde aparecem.
- A única mudança de assinatura em código existente é o `criarApp`, e a Task 5 Step 4 conserta os chamadores.
