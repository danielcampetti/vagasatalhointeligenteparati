# Acervo compartilhado — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tirar as vagas do `localStorage` e pô-las num SQLite no Railway, para que toda busca — de quem quer que seja — alimente o mesmo acervo.

**Architecture:** O `server.js` deixa de ser só proxy e passa a ser dono das vagas, guardando-as num SQLite (`node:sqlite`) num volume do Railway. A regra de merge que hoje vive no `acervo.js` sai para um módulo neutro (`src/vaga.js`) e roda nos dois lados, sem ser reescrita em SQL. O navegador troca o store local por quatro `fetch`.

**Tech Stack:** Node 22.14 · `node:sqlite` (embutido, sem dependência nova) · Express 5 · React 19 · Vitest 4 · oxlint

**Spec:** `docs/superpowers/specs/2026-09-03-acervo-compartilhado-design.md`

## Global Constraints

- **Zero dependência nova.** `node:sqlite` é embutido no Node 22.14; `fetch` é global. Nada entra no `package.json`.
- **Node 22.14.0** local e no Railway. `node:sqlite` funciona sem flag, mas emite `ExperimentalWarning` — é esperado, não é falha.
- **Português em todo comentário, docstring, nome de teste e mensagem de tela.** É a língua do repositório inteiro.
- **Nomes de identificador em português** (`mesclar`, `guardar`, `listar`), seguindo `acervo.js` e `cota.js`.
- **Não existe rota `DELETE`.** Decisão do dono do projeto: nada é destruído no servidor. Não adicione uma "por completude".
- **`npm run dev` e o Railway têm que se comportar igual.** O servidor não pode passar a exigir volume para rodar local.
- **Teto do acervo: 2000 vagas.** Descarte pelo `entrouEm` mais antigo.
- **`GET /api/acervo` não devolve `descricao`.** Ela é 66% do peso; só a página de detalhe precisa, e busca por id.
- **Rodar `npm test` e `npm run lint` antes de cada commit.** O lint tem um aviso pré-existente em `src/api/perfil.test.js:48` — ele não conta como regressão.

---

### Task 1: `src/vaga.js` — a regra que os dois lados compartilham

Extrai `mesclar`, `temId` e `agora` do `acervo.js` para um módulo que roda tanto no navegador quanto no servidor. Nada muda de comportamento: é só mudança de endereço.

**Files:**
- Create: `src/vaga.js`
- Create: `src/vaga.test.js`
- Modify: `src/acervo.js` (remove `mesclar`/`agora` locais, passa a importar; a validação de id inline vira `temId`)

**Interfaces:**
- Consumes: nada
- Produces:
  - `mesclar(velha: Vaga, nova: Vaga) → Vaga`
  - `temId(vaga: unknown) → boolean`
  - `agora() → string` (ISO 8601)

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/vaga.test.js`:

```js
import { describe, expect, test } from 'vitest'
import { agora, mesclar, temId } from './vaga'

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

/**
 * Estas quatro regras custaram bug para serem descobertas, e são a razão de
 * `mesclar` não virar um `ON CONFLICT DO UPDATE` em SQL: traduzi-las para
 * outra linguagem seria redescobri-las.
 */
describe('mesclar: o que é de quem usa fica, o que é da API atualiza', () => {
  test('favorito e lida, uma vez ligados, não desligam numa busca nova', () => {
    const r = mesclar(vaga('a', { fav: true, seen: true }), vaga('a'))
    expect(r.fav).toBe(true)
    expect(r.seen).toBe(true)
  })

  test('a nota da IA sobrevive: ela custou uma chamada à Claude', () => {
    expect(mesclar(vaga('a', { rank: 87 }), vaga('a', { rank: null })).rank).toBe(87)
  })

  test('mas nota nova vence a antiga — reranquear tem que valer alguma coisa', () => {
    expect(mesclar(vaga('a', { rank: 40 }), vaga('a', { rank: 90 })).rank).toBe(90)
  })

  test('descrição vazia na nova não apaga a que já existia', () => {
    const r = mesclar(vaga('a', { descricao: 'a inteira' }), vaga('a', { descricao: '' }))
    expect(r.descricao).toBe('a inteira')
  })

  test('dados da API vêm da versão nova', () => {
    const r = mesclar(vaga('a', { max: 3, link: 'https://velho' }), vaga('a', { max: 5, link: 'https://novo' }))
    expect(r.max).toBe(5)
    expect(r.link).toBe('https://novo')
  })

  // `entrouEm` é o critério de descarte do teto. Se ele andasse a cada busca,
  // uma vaga vista com frequência nunca sairia e o teto viraria loteria.
  test('entrouEm é quando entrou, não quando foi vista de novo', () => {
    const r = mesclar(vaga('a', { entrouEm: '2026-01-01T00:00:00.000Z' }), vaga('a', { entrouEm: '2026-09-09T00:00:00.000Z' }))
    expect(r.entrouEm).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('temId', () => {
  test('aceita id não-vazio', () => {
    expect(temId({ id: 'a1' })).toBe(true)
  })

  // Vaga sem id não teria como ser desduplicada nem atualizada depois —
  // entraria no acervo como lixo que nenhuma operação alcança.
  test.each([[undefined], [null], ['']])('recusa id %p', (id) => {
    expect(temId({ id })).toBe(false)
  })

  test('recusa vaga ausente sem lançar', () => {
    expect(temId(null)).toBe(false)
    expect(temId(undefined)).toBe(false)
  })
})

describe('agora', () => {
  test('devolve ISO 8601', () => {
    expect(agora()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/vaga.test.js`
Expected: FAIL — `Failed to resolve import "./vaga"`

- [ ] **Step 3: Criar `src/vaga.js`**

```js
/**
 * O que uma vaga é para quem a guarda.
 *
 * Este módulo existe porque a mesma regra passou a valer nos dois lados: o
 * navegador mescla ao exibir, e o servidor mescla ao gravar. São as quatro
 * regras abaixo, e elas foram aprendidas com defeito — favorito que sumia,
 * nota paga que se perdia, descrição que zerava, teto que virava loteria.
 *
 * Deliberadamente **não** é um `ON CONFLICT DO UPDATE` em SQL. Traduzir estas
 * regras para outra linguagem seria redescobri-las uma a uma, e elas já têm
 * teste aqui.
 *
 * Não importa nada: é o que permite rodar no `node` do servidor e no bundle do
 * navegador sem condicional nenhuma.
 */

/**
 * Vaga sem `id` é recusada em vez de virar lixo.
 *
 * Sem id ela não pode ser desduplicada nem atualizada depois — entraria no
 * acervo como uma linha que nenhuma operação alcança.
 */
export function temId(vaga) {
  return Boolean(vaga) && vaga.id !== undefined && vaga.id !== null && vaga.id !== ''
}

/** Isolado para os testes poderem falar sobre o formato sem espionar `Date`. */
export function agora() {
  return new Date().toISOString()
}

/**
 * A versão velha encontrando a nova.
 *
 * Espalhado, o `...nova` sozinho sobrescreveria tudo — e é isso que as quatro
 * linhas abaixo impedem, cada uma por um motivo diferente.
 */
export function mesclar(velha, nova) {
  return {
    ...velha,
    ...nova,
    // Marcas de quem usa: uma vez ligadas, uma busca nova não as desliga.
    fav: velha.fav || nova.fav || false,
    seen: velha.seen || nova.seen || false,
    // A nota nova vence quando existe — é o que faz reranquear valer alguma
    // coisa. Quando não existe, a antiga fica: ela custou uma chamada paga.
    rank: nova.rank ?? velha.rank ?? null,
    // Resposta sem descrição não zera a que já estava guardada: sem ela, a
    // página de detalhe fica vazia e o reranking não tem o que comparar.
    descricao: nova.descricao || velha.descricao || '',
    // Quando entrou, não quando foi vista de novo. É o critério de descarte do
    // teto, e precisa ser estável.
    entrouEm: velha.entrouEm ?? nova.entrouEm ?? agora(),
  }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/vaga.test.js`
Expected: PASS — 11 testes

- [ ] **Step 5: Fazer o `acervo.js` delegar**

Em `src/acervo.js`, adicione o import no topo (depois do docstring do módulo, antes de `export const TETO`):

```js
import { agora, mesclar, temId } from './vaga'
```

Apague as definições locais de `mesclar` (a função `function mesclar(velha, nova) { ... }`) e de `agora` (`function agora() { ... }`).

Em `guardarVagas`, troque a guarda inline:

```js
    if (!nova || nova.id === undefined || nova.id === null || nova.id === '') {
      continue
    }
```

por:

```js
    if (!temId(nova)) continue
```

- [ ] **Step 6: Rodar a suíte inteira**

Run: `npm test -- --run`
Expected: PASS — os testes do `acervo.test.js` continuam passando sem edição nenhuma. É o que prova que a mudança foi de endereço, não de comportamento.

Os testes de mescla ficam duplicados entre `acervo.test.js` e `vaga.test.js` de propósito, até a Task 6 encolher o `acervo.js`. Rede de segurança durante a migração custa barato.

- [ ] **Step 7: Lint e commit**

```bash
npm run lint
git add src/vaga.js src/vaga.test.js src/acervo.js
git commit -m "vaga.js: a regra de mescla sai do acervo para rodar nos dois lados

O servidor vai precisar mesclar ao gravar, e o navegador continua
mesclando ao exibir. Um módulo sem imports roda nos dois.

Mudança de endereço, não de comportamento: o acervo.test.js passa sem
uma linha editada."
```

---

### Task 2: `src/servidor/banco.js` — o store, sem HTTP no meio

O SQLite e as quatro operações. Sem Express, sem rede: testável inteiro com `:memory:`.

**Files:**
- Create: `src/servidor/banco.js`
- Create: `src/servidor/banco.test.js`

**Interfaces:**
- Consumes: `mesclar`, `temId`, `agora` de `src/vaga.js` (Task 1)
- Produces:
  - `TETO: number` (2000)
  - `CAMPOS_PATCH: string[]` (`['fav', 'seen', 'rank']`)
  - `abrirBanco(caminho?: string) → DatabaseSync` — cria schema; padrão `':memory:'`
  - `criarAcervo(db, { teto?: number }) → { listar, buscarPorId, guardar, atualizar }`
  - `listar() → Vaga[]` — **sem `descricao`**, mais recente primeiro
  - `buscarPorId(id: string) → Vaga | null` — **com `descricao`**
  - `guardar(novas: Vaga[]) → Vaga[]` — upsert + apara o teto; devolve o que `listar` devolveria
  - `atualizar(id: string, campos: object) → Vaga | null` — só `CAMPOS_PATCH`; `null` se o id não existe

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/servidor/banco.test.js`:

```js
import { beforeEach, describe, expect, test } from 'vitest'
import { CAMPOS_PATCH, abrirBanco, criarAcervo } from './banco'

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

let acervo

beforeEach(() => {
  // `:memory:` dá um banco por teste, sem arquivo e sem limpeza.
  acervo = criarAcervo(abrirBanco(':memory:'))
})

describe('guardar', () => {
  test('a primeira busca entra inteira', () => {
    acervo.guardar([vaga('a'), vaga('b')])
    expect(acervo.listar()).toHaveLength(2)
  })

  test('a segunda busca acumula, não substitui', () => {
    acervo.guardar([vaga('a')])
    acervo.guardar([vaga('b')])
    expect(acervo.listar().map((v) => v.id).sort()).toEqual(['a', 'b'])
  })

  test('a mesma vaga em duas buscas não duplica', () => {
    acervo.guardar([vaga('a')])
    acervo.guardar([vaga('a')])
    expect(acervo.listar()).toHaveLength(1)
  })

  test('vaga sem id é recusada em vez de virar linha inalcançável', () => {
    acervo.guardar([vaga('a'), { cargo: 'sem id' }, { id: '', cargo: 'vazio' }])
    expect(acervo.listar()).toHaveLength(1)
  })

  test('lista vazia não quebra nem apaga o que já existe', () => {
    acervo.guardar([vaga('a')])
    acervo.guardar([])
    expect(acervo.listar()).toHaveLength(1)
  })

  test('devolve a lista atualizada, para o chamador não reconsultar', () => {
    expect(acervo.guardar([vaga('a')]).map((v) => v.id)).toEqual(['a'])
  })
})

// As mesmas regras do `vaga.test.js`, agora atravessando o SQLite. O que se
// testa aqui não é `mesclar` — é que o JSON gravado e relido não perde nada.
describe('mescla sobrevive à ida e volta do banco', () => {
  test('favorito e lida não desligam numa busca nova', () => {
    acervo.guardar([vaga('a', { fav: true, seen: true })])
    acervo.guardar([vaga('a', { fav: false, seen: false })])
    const [v] = acervo.listar()
    expect(v.fav).toBe(true)
    expect(v.seen).toBe(true)
  })

  test('a nota paga não se perde', () => {
    acervo.guardar([vaga('a', { rank: 87 })])
    acervo.guardar([vaga('a', { rank: null })])
    expect(acervo.listar()[0].rank).toBe(87)
  })

  test('descrição vazia não apaga a guardada', () => {
    acervo.guardar([vaga('a', { descricao: 'a inteira' })])
    acervo.guardar([vaga('a', { descricao: '' })])
    expect(acervo.buscarPorId('a').descricao).toBe('a inteira')
  })
})

describe('listar e buscarPorId', () => {
  // 66% do peso da vaga é a descrição, e a tabela da tela não a mostra.
  test('listar não devolve descricao', () => {
    acervo.guardar([vaga('a')])
    expect(acervo.listar()[0]).not.toHaveProperty('descricao')
    expect(acervo.listar()[0].cargo).toBe('Cargo a')
  })

  test('buscarPorId devolve a vaga inteira, com descricao', () => {
    acervo.guardar([vaga('a')])
    expect(acervo.buscarPorId('a').descricao).toBe('descricao de a')
  })

  test('id que não existe devolve null, não lança', () => {
    expect(acervo.buscarPorId('fantasma')).toBe(null)
  })

  test('a mais recente vem primeiro', () => {
    acervo.guardar([vaga('velha', { entrouEm: '2026-01-01T00:00:00.000Z' })])
    acervo.guardar([vaga('nova', { entrouEm: '2026-09-01T00:00:00.000Z' })])
    expect(acervo.listar().map((v) => v.id)).toEqual(['nova', 'velha'])
  })
})

describe('atualizar', () => {
  test('favoritar grava e persiste', () => {
    acervo.guardar([vaga('a')])
    acervo.atualizar('a', { fav: true })
    expect(acervo.listar()[0].fav).toBe(true)
  })

  test('devolve a vaga final', () => {
    acervo.guardar([vaga('a')])
    expect(acervo.atualizar('a', { seen: true }).seen).toBe(true)
  })

  test('id que não existe não inventa vaga', () => {
    expect(acervo.atualizar('fantasma', { fav: true })).toBe(null)
    expect(acervo.listar()).toHaveLength(0)
  })

  /**
   * Sem login, o PATCH é uma porta aberta. Ela aceita as três marcas e mais
   * nada: deixar passar `descricao` ou `link` daria a qualquer visitante o
   * poder de reescrever a vaga que outra pessoa pagou para trazer.
   */
  test('campo fora da lista é ignorado, não gravado', () => {
    acervo.guardar([vaga('a')])
    acervo.atualizar('a', { fav: true, cargo: 'INVADIDO', link: 'https://mau' })
    const v = acervo.buscarPorId('a')
    expect(v.fav).toBe(true)
    expect(v.cargo).toBe('Cargo a')
    expect(v.link).toBeUndefined()
  })

  test('a lista dos campos aceitos é a combinada', () => {
    expect(CAMPOS_PATCH).toEqual(['fav', 'seen', 'rank'])
  })

  test('id e entrouEm não podem ser reescritos pelo patch', () => {
    acervo.guardar([vaga('a', { entrouEm: '2026-01-01T00:00:00.000Z' })])
    acervo.atualizar('a', { id: 'outro', entrouEm: '2030-01-01T00:00:00.000Z' })
    const v = acervo.buscarPorId('a')
    expect(v.id).toBe('a')
    expect(v.entrouEm).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('teto', () => {
  const cheio = (n, base = 0) =>
    Array.from({ length: n }, (_, i) =>
      vaga(`v${base + i}`, {
        entrouEm: new Date(Date.UTC(2026, 0, 1) + (base + i) * 86400000).toISOString(),
      }),
    )

  test('para no teto', () => {
    const pequeno = criarAcervo(abrirBanco(':memory:'), { teto: 5 })
    pequeno.guardar(cheio(8))
    expect(pequeno.listar()).toHaveLength(5)
  })

  test('quem sai é a mais antiga por entrouEm', () => {
    const pequeno = criarAcervo(abrirBanco(':memory:'), { teto: 3 })
    pequeno.guardar(cheio(5))
    expect(pequeno.listar().map((v) => v.id)).toEqual(['v4', 'v3', 'v2'])
  })

  test('uma leva maior que o teto entra cortada, sem estourar', () => {
    const pequeno = criarAcervo(abrirBanco(':memory:'), { teto: 2 })
    expect(pequeno.guardar(cheio(10))).toHaveLength(2)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/servidor/banco.test.js`
Expected: FAIL — `Failed to resolve import "./banco"`

- [ ] **Step 3: Implementar `src/servidor/banco.js`**

```js
/**
 * O acervo compartilhado, em SQLite.
 *
 * Primeiro estado do app que não mora num navegador. Até aqui tudo era
 * `localStorage`, e a consequência foi o defeito que motivou este trabalho: o
 * que o `npm run dev` juntava não estava no Railway, e vice-versa.
 *
 * ## Três colunas, não vinte
 *
 * `id` e `entrouEm` saem para fora porque são os dois que o **banco** usa:
 * dedupe e ordenação/teto. A vaga inteira vai em `dados`, JSON.
 *
 * O motivo está registrado no ONDE-PARAMOS: "nomes de campo da API: confira,
 * não deduza" — `job_is_remote` não existe, o certo é `work_arrangement`, e o
 * chute custou duas colunas vazias. O `mapear.js` já mudou de forma e vai
 * mudar de novo; com colunas enumeradas, cada campo novo viraria migração de
 * schema. O preço é não filtrar em SQL, e ele é zero hoje: o
 * `filtroAcervo.js` recorta a lista inteira no navegador.
 *
 * ## Por que não conhece HTTP
 *
 * Para ser testável com `:memory:`, sem subir servidor e sem porta. As rotas
 * ficam finas o bastante para o teste delas ser sobre transporte.
 *
 * ## node:sqlite
 *
 * Embutido no Node 22.14 — zero dependência nova, que era o requisito. Emite
 * um `ExperimentalWarning` no log; é esperado, não é falha.
 */

import { DatabaseSync } from 'node:sqlite'
import { agora, mesclar, temId } from '../vaga.js'

/**
 * O teto do acervo compartilhado.
 *
 * Os 500 do `acervo.js` vinham dos ~5 MB do `localStorage`, restrição que some
 * no volume. O que limita agora é a resposta do `GET`: a ~0,9 KB por vaga sem
 * descrição, 2000 dão ~1,8 MB numa aba que carrega uma vez.
 *
 * Subir daqui exige paginar, e paginar mexe no `filtroAcervo.js` e nos
 * dropdowns, que hoje leem o acervo inteiro.
 */
export const TETO = 2000

/**
 * Os únicos campos que um PATCH pode mudar.
 *
 * Sem login, esta rota é uma porta aberta. Aceitar a vaga inteira daria a
 * qualquer visitante o poder de reescrever `cargo`, `link` ou `descricao` de
 * uma vaga que outra pessoa pagou para trazer. As três marcas são o que a
 * tela de fato altera.
 */
export const CAMPOS_PATCH = ['fav', 'seen', 'rank']

/** Abre (ou cria) o banco e garante o schema. `:memory:` para teste. */
export function abrirBanco(caminho = ':memory:') {
  const db = new DatabaseSync(caminho)
  db.exec(`
    CREATE TABLE IF NOT EXISTS vagas (
      id       TEXT PRIMARY KEY,
      entrouEm TEXT NOT NULL,
      dados    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS vagas_entrouem ON vagas(entrouEm DESC);
  `)
  return db
}

/** A lista da tela não carrega descrição — ver o docstring de `listar`. */
function semDescricao(vaga) {
  const { descricao: _descricao, ...resto } = vaga
  return resto
}

export function criarAcervo(db, { teto = TETO } = {}) {
  const lerUma = db.prepare('SELECT dados FROM vagas WHERE id = ?')
  const gravarUma = db.prepare(
    `INSERT INTO vagas (id, entrouEm, dados) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET dados = excluded.dados`,
  )
  const listarTodas = db.prepare('SELECT dados FROM vagas ORDER BY entrouEm DESC')
  // `LIMIT -1 OFFSET ?` é o idioma do SQLite para "tudo depois dos N
  // primeiros". Como a ordem é `entrouEm DESC`, o que sobra do offset são
  // exatamente as mais antigas.
  const aparar = db.prepare(
    `DELETE FROM vagas WHERE id IN (
       SELECT id FROM vagas ORDER BY entrouEm DESC LIMIT -1 OFFSET ?
     )`,
  )

  function bruta(id) {
    const linha = lerUma.get(String(id))
    return linha ? JSON.parse(linha.dados) : null
  }

  /**
   * A lista da tela: tudo menos `descricao`.
   *
   * Medido em 03/09/2026 sobre 88 vagas reais: 2,7 KB por vaga, e 66% disso é
   * a descrição. A tabela não a mostra — quem precisa dela é a página de
   * detalhe, e ela busca por id. Mandar tudo seria triplicar a resposta para
   * um campo que ninguém lê nesta tela.
   */
  function listar() {
    return listarTodas.all().map((l) => semDescricao(JSON.parse(l.dados)))
  }

  /** A vaga inteira, com descrição. `null` quando não existe. */
  function buscarPorId(id) {
    return bruta(id)
  }

  /**
   * Acrescenta as vagas de uma busca. Acrescenta, nunca substitui.
   *
   * O merge é o `mesclar` de `vaga.js`, em JS, lendo o JSON antigo — e não um
   * `ON CONFLICT DO UPDATE` que reescrevesse as regras em SQL. O `ON CONFLICT`
   * daqui só troca `dados`; `entrouEm` fica de fora do `SET` de propósito,
   * porque ele é o critério de descarte do teto e precisa ser estável.
   */
  function guardar(novas) {
    const lista = Array.isArray(novas) ? novas : []
    const quando = agora()

    for (const nova of lista) {
      if (!temId(nova)) continue
      const velha = bruta(nova.id)
      const final = velha
        ? mesclar(velha, nova)
        : { ...nova, entrouEm: nova.entrouEm ?? quando }
      gravarUma.run(String(final.id), final.entrouEm, JSON.stringify(final))
    }

    aparar.run(teto)
    return listar()
  }

  /**
   * Liga uma das três marcas. `null` quando o id não existe.
   *
   * Não inventa vaga: o acervo guarda o que a busca trouxe, não o que se pediu
   * para atualizar. E `id`/`entrouEm` são reafirmados depois do espalhamento
   * para um patch não conseguir movê-los nem por engano.
   */
  function atualizar(id, campos = {}) {
    const atual = bruta(id)
    if (!atual) return null

    const aceitos = {}
    for (const campo of CAMPOS_PATCH) {
      if (campo in campos) aceitos[campo] = campos[campo]
    }

    const final = { ...atual, ...aceitos, id: atual.id, entrouEm: atual.entrouEm }
    gravarUma.run(String(final.id), final.entrouEm, JSON.stringify(final))
    return final
  }

  return { listar, buscarPorId, guardar, atualizar }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/servidor/banco.test.js`
Expected: PASS — 22 testes. Um `ExperimentalWarning` do SQLite aparece na saída; é esperado.

- [ ] **Step 5: Suíte inteira, lint e commit**

```bash
npm test -- --run
npm run lint
git add src/servidor/banco.js src/servidor/banco.test.js
git commit -m "banco.js: o acervo em SQLite, sem HTTP no meio

Três colunas — id, entrouEm e a vaga inteira em JSON. Enumerar colunas
faria cada campo novo do mapear.js virar migração de schema, e o mapear
já mudou de forma antes.

O merge é o mesclar de vaga.js, em JS: as quatro regras sutis não são
reescritas em SQL. O ON CONFLICT só troca dados, deixando entrouEm de
fora, porque ele é o critério de descarte do teto.

PATCH aceita fav, seen e rank e mais nada: sem login, aceitar a vaga
inteira deixaria qualquer visitante reescrever o que outro pagou."
```

---

### Task 3: `criarApp()` — tornar o `server.js` importável

Pré-requisito do teste de integração, e nada além disso. Nenhuma rota nova.

**Files:**
- Modify: `server.js` (o bloco final: `const app = express()` até o `app.listen`)
- Create: `src/servidor/app.test.js`

**Interfaces:**
- Consumes: nada
- Produces: `criarApp({ acervo? }) → express.Application` — exportado de `server.js`. `acervo` é o objeto da Task 2; omitido, a Task 4 abre o banco do ambiente.

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/servidor/app.test.js`:

```js
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/servidor/app.test.js`
Expected: FAIL — o import executa o `app.listen`, e o teste ou trava ou acusa `criarApp is not a function`.

- [ ] **Step 3: Refatorar o final do `server.js`**

Substitua o bloco que começa em `const app = express()` e termina no `app.listen(...)` por:

```js
/**
 * Monta o servidor sem escutar.
 *
 * A separação existe para o teste poder importar este arquivo. Enquanto o
 * `listen` acontecia no topo do módulo, importar abria uma porta como efeito
 * colateral — e uma porta ocupada derrubava a suíte por um motivo que não
 * tinha nada a ver com o que estava sendo testado.
 */
export function criarApp() {
  const app = express()

  for (const destino of DESTINOS) {
    app.use(
      destino.de,
      // Sem interpretar: o corpo é repassado byte a byte. Um `express.json()`
      // aqui reserializaria o pedido da Claude e mudaria o que o upstream vê.
      express.raw({ type: () => true, limit: '10mb' }),
      reproxiar(destino),
    )
  }

  app.use(express.static(DIST))

  /**
   * Qualquer outra rota devolve o `index.html`.
   *
   * O app é uma página só, e a navegação dele é estado em memória — mas um F5
   * ou um link colado precisa cair no HTML em vez de 404. Vem depois do
   * estático, senão engoliria os pedidos de `/assets/*`.
   */
  app.use((_req, res) => res.sendFile(path.join(DIST, 'index.html')))

  return app
}

/**
 * Só escuta quando este arquivo é o ponto de entrada (`npm start`).
 *
 * Importado por um teste, `process.argv[1]` é o runner do vitest, a comparação
 * falha, e nenhuma porta é aberta.
 */
const ehPontoDeEntrada =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (ehPontoDeEntrada) {
  criarApp().listen(PORTA, () => {
    console.log(`[servidor] no ar na porta ${PORTA}`)
    for (const d of DESTINOS) {
      const tem = Boolean(process.env[d.variavel]?.trim())
      console.log(`[${d.nome}] ${tem ? 'chave presente' : `SEM ${d.variavel}`}`)
    }
  })
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/servidor/app.test.js`
Expected: PASS — 2 testes, e o comando **termina** (não fica pendurado numa porta aberta).

- [ ] **Step 5: Confirmar que `npm start` continua subindo**

```bash
PORT=3111 node server.js
```

Expected: `[servidor] no ar na porta 3111`. Encerre com Ctrl-C.

Este passo não é cerimônia: o `if` do ponto de entrada é exatamente o tipo de mudança que passa no teste e quebra a produção.

- [ ] **Step 6: Suíte, lint e commit**

```bash
npm test -- --run
npm run lint
git add server.js src/servidor/app.test.js
git commit -m "server.js: exporta criarApp, e só escuta quando é a entrada

Pré-requisito do teste de integração das rotas do acervo. Enquanto o
listen acontecia no topo do módulo, importar o arquivo abria uma porta —
e uma porta ocupada derrubaria a suíte por um motivo alheio ao teste.

Nenhuma rota muda. npm start continua subindo igual."
```

---

### Task 4: As rotas do acervo

**Files:**
- Modify: `server.js` (imports no topo; rotas dentro de `criarApp`)
- Create: `src/servidor/rotas.test.js`

**Interfaces:**
- Consumes: `criarApp` (Task 3), `abrirBanco`/`criarAcervo` (Task 2)
- Produces: `criarApp({ acervo })` passa a aceitar um acervo injetado. Rotas:
  - `GET /api/acervo` → `{ vagas: Vaga[] }` sem `descricao`
  - `GET /api/acervo/:id` → a vaga inteira, ou 404 `{ message }`
  - `POST /api/acervo` body `{ vagas: Vaga[] }` → `{ vagas: Vaga[] }` sem `descricao`
  - `PATCH /api/acervo/:id` body `{ fav?, seen?, rank? }` → a vaga final, ou 404

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/servidor/rotas.test.js`:

```js
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/servidor/rotas.test.js`
Expected: FAIL — `criarApp({ acervo })` ignora o argumento e as rotas caem no catch-all do `index.html`, então o `res.json()` estoura.

- [ ] **Step 3: Implementar as rotas**

Em `server.js`, adicione ao topo, junto dos outros imports:

```js
import { abrirBanco, criarAcervo } from './src/servidor/banco.js'
```

E logo abaixo das constantes existentes:

```js
/**
 * Onde o acervo mora.
 *
 * No Railway é um volume — o disco comum de lá é efêmero, e sem volume o banco
 * morreria a cada deploy, que é exatamente o defeito que ele veio corrigir.
 *
 * Local, o padrão é um arquivo ao lado do código. O README promete que o
 * `npm run dev` e o Railway se comportam igual, e exigir volume para rodar na
 * máquina de quem desenvolve quebraria essa promessa.
 */
const BANCO_CAMINHO = process.env.BANCO_CAMINHO ?? path.join(AQUI, 'acervo.db')
```

Troque a assinatura de `criarApp` e monte as rotas **antes** do `express.static`:

```js
export function criarApp({ acervo = criarAcervo(abrirBanco(BANCO_CAMINHO)) } = {}) {
  const app = express()

  for (const destino of DESTINOS) {
    app.use(
      destino.de,
      express.raw({ type: () => true, limit: '10mb' }),
      reproxiar(destino),
    )
  }

  /**
   * O acervo compartilhado.
   *
   * Vem antes do estático porque `express.static` responderia 404 a
   * `/api/acervo` antes de qualquer rota registrada depois dele. Não há
   * `DELETE` — decisão do dono do projeto: nada é destruído no servidor.
   */
  const json = express.json({ limit: '10mb' })

  app.get('/api/acervo', (_req, res) => {
    res.json({ vagas: acervo.listar() })
  })

  app.get('/api/acervo/:id', (req, res) => {
    const vaga = acervo.buscarPorId(req.params.id)
    if (!vaga) return res.status(404).json({ message: 'Vaga não encontrada no acervo.' })
    res.json(vaga)
  })

  app.post('/api/acervo', json, (req, res) => {
    // Corpo sem `vagas` não é erro: um POST de lista vazia é o que a busca sem
    // resultado manda, e recusá-lo com 400 viraria um aviso na tela por um
    // não-evento.
    const vagas = Array.isArray(req.body?.vagas) ? req.body.vagas : []
    res.json({ vagas: acervo.guardar(vagas) })
  })

  app.patch('/api/acervo/:id', json, (req, res) => {
    const vaga = acervo.atualizar(req.params.id, req.body ?? {})
    if (!vaga) return res.status(404).json({ message: 'Vaga não encontrada no acervo.' })
    res.json(vaga)
  })

  app.use(express.static(DIST))

  app.use((_req, res) => res.sendFile(path.join(DIST, 'index.html')))

  return app
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/servidor/rotas.test.js`
Expected: PASS — 9 testes

- [ ] **Step 5: Tirar o efeito colateral do teste da Task 3**

`src/servidor/app.test.js` chama `criarApp()` sem argumento. Com o padrão que
o Step 3 acabou de dar ao parâmetro, essa chamada passaria a **abrir o banco
real** — criando um `acervo.db` no repositório como efeito colateral de rodar
a suíte.

Troque as duas chamadas do arquivo por uma com acervo em memória:

```js
import { describe, expect, test } from 'vitest'
import { criarApp } from '../../server.js'
import { abrirBanco, criarAcervo } from './banco'

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

  // Com acervo em memória de propósito: o padrão do parâmetro abre o banco do
  // ambiente, e um teste não pode criar arquivo no repositório.
  test('devolve um app do express, montado', () => {
    const app = criarApp({ acervo: criarAcervo(abrirBanco(':memory:')) })
    expect(typeof app.listen).toBe('function')
  })
})
```

Confirme que nenhum arquivo nasceu: `git status --short` não pode listar
`acervo.db` depois de rodar a suíte.

- [ ] **Step 6: Ignorar o banco local no git**

Adicione ao `.gitignore`:

```
acervo.db
acervo.db-journal
```

- [ ] **Step 7: Suíte, lint e commit**

```bash
npm test -- --run
npm run lint
git add server.js .gitignore src/servidor/rotas.test.js src/servidor/app.test.js
git commit -m "Rotas do acervo: GET, GET/:id, POST e PATCH — e nenhum DELETE

Quatro rotas finas sobre o banco.js. O GET corta a descrição, que é 66%
do peso e só a página de detalhe lê; ela busca por id.

Não há DELETE, e há um teste que confirma isso — a decisão de não
destruir nada no servidor é satisfeita por ausência de código, e sem o
teste alguém a adicionaria 'por completude' numa manutenção futura.

As rotas vêm antes do express.static, senão ele responderia 404 antes."
```

---

### Task 5: `src/acervoRemoto.js` — o cliente

**Files:**
- Create: `src/acervoRemoto.js`
- Create: `src/acervoRemoto.test.js`

**Interfaces:**
- Consumes: as rotas da Task 4
- Produces:
  - `class ErroAcervo extends Error { status: number }`
  - `lerAcervoRemoto() → Promise<Vaga[]>`
  - `guardarVagasRemoto(vagas: Vaga[]) → Promise<Vaga[]>`
  - `buscarVagaRemota(id: string) → Promise<Vaga | null>` — `null` no 404
  - `atualizarVagaRemota(id: string, campos: object) → Promise<Vaga | null>`

- [ ] **Step 1: Escrever o teste que falha**

Crie `src/acervoRemoto.test.js`:

```js
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  ErroAcervo,
  atualizarVagaRemota,
  buscarVagaRemota,
  guardarVagasRemoto,
  lerAcervoRemoto,
} from './acervoRemoto'

const responde = (corpo, { status = 200 } = {}) =>
  vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => corpo,
  })

afterEach(() => vi.unstubAllGlobals())

describe('lerAcervoRemoto', () => {
  test('devolve as vagas do corpo', async () => {
    vi.stubGlobal('fetch', responde({ vagas: [{ id: 'a' }] }))
    expect(await lerAcervoRemoto()).toEqual([{ id: 'a' }])
  })

  test('corpo sem vagas não vira undefined na tela', async () => {
    vi.stubGlobal('fetch', responde({}))
    expect(await lerAcervoRemoto()).toEqual([])
  })

  /**
   * A regra que este bloco existe para travar: **falha não pode virar lista
   * vazia**. Acervo vazio por queda de rede é visualmente idêntico a acervo
   * vazio de verdade, e a tela de vazio diz "faça uma busca" — conselho errado
   * para quem está vendo um erro de rede.
   */
  test('rede caída lança ErroAcervo, não devolve lista vazia', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('sem rede')))
    await expect(lerAcervoRemoto()).rejects.toBeInstanceOf(ErroAcervo)
  })

  test('status de erro lança ErroAcervo com o status', async () => {
    vi.stubGlobal('fetch', responde({ message: 'quebrou' }, { status: 500 }))
    await expect(lerAcervoRemoto()).rejects.toMatchObject({ status: 500 })
  })

  test('a mensagem do servidor chega ao chamador', async () => {
    vi.stubGlobal('fetch', responde({ message: 'banco fora do ar' }, { status: 500 }))
    await expect(lerAcervoRemoto()).rejects.toThrow(/banco fora do ar/)
  })
})

describe('guardarVagasRemoto', () => {
  test('manda as vagas e devolve a lista atualizada', async () => {
    const espiao = responde({ vagas: [{ id: 'a' }] })
    vi.stubGlobal('fetch', espiao)

    expect(await guardarVagasRemoto([{ id: 'a' }])).toEqual([{ id: 'a' }])
    const [, opcoes] = espiao.mock.calls[0]
    expect(opcoes.method).toBe('POST')
    expect(JSON.parse(opcoes.body)).toEqual({ vagas: [{ id: 'a' }] })
  })

  // Lista vazia não vale uma ida à rede: a busca sem resultado chamaria isto,
  // e o servidor devolveria o acervo inteiro para nada.
  test('lista vazia não chama a rede', async () => {
    const espiao = responde({ vagas: [] })
    vi.stubGlobal('fetch', espiao)

    expect(await guardarVagasRemoto([])).toEqual([])
    expect(espiao).not.toHaveBeenCalled()
  })
})

describe('buscarVagaRemota', () => {
  test('devolve a vaga', async () => {
    vi.stubGlobal('fetch', responde({ id: 'a', descricao: 'inteira' }))
    expect((await buscarVagaRemota('a')).descricao).toBe('inteira')
  })

  // 404 aqui é resposta, não falha: a vaga saiu do acervo pelo teto.
  test('404 devolve null em vez de lançar', async () => {
    vi.stubGlobal('fetch', responde({ message: 'não achei' }, { status: 404 }))
    expect(await buscarVagaRemota('sumida')).toBe(null)
  })
})

describe('atualizarVagaRemota', () => {
  test('manda PATCH com os campos', async () => {
    const espiao = responde({ id: 'a', fav: true })
    vi.stubGlobal('fetch', espiao)

    expect((await atualizarVagaRemota('a', { fav: true })).fav).toBe(true)
    const [, opcoes] = espiao.mock.calls[0]
    expect(opcoes.method).toBe('PATCH')
    expect(JSON.parse(opcoes.body)).toEqual({ fav: true })
  })

  test('404 devolve null', async () => {
    vi.stubGlobal('fetch', responde({ message: 'não achei' }, { status: 404 }))
    expect(await atualizarVagaRemota('sumida', { fav: true })).toBe(null)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/acervoRemoto.test.js`
Expected: FAIL — `Failed to resolve import "./acervoRemoto"`

- [ ] **Step 3: Implementar `src/acervoRemoto.js`**

```js
/**
 * O acervo, agora do outro lado da rede.
 *
 * Substitui o `acervo.js` como fonte das vagas. A diferença que atravessa a
 * tela inteira é que estas funções são **assíncronas e podem falhar** — o
 * `localStorage` não fazia nem uma coisa nem outra.
 *
 * ## Falha nunca vira lista vazia
 *
 * É a regra que este módulo existe para garantir. Acervo vazio por queda de
 * rede é visualmente idêntico a acervo vazio de verdade, e a tela de vazio
 * aconselha "faça uma busca" — conselho errado, e o tipo de falha silenciosa
 * que o ONDE-PARAMOS já registra três vezes como a pior. Por isso erro lança
 * `ErroAcervo`, e quem chama decide o que mostrar.
 *
 * A exceção é o 404 de uma vaga: ele é **resposta**, não falha — a vaga saiu
 * do acervo pelo teto. Aí devolve `null`.
 */

const BASE = '/api/acervo'

export class ErroAcervo extends Error {
  constructor(mensagem, { status = 0 } = {}) {
    super(mensagem)
    this.name = 'ErroAcervo'
    this.status = status
  }
}

/**
 * Uma ida ao servidor, com as duas falhas separadas.
 *
 * `fetch` só rejeita quando a requisição não sai; status de erro chega como
 * resposta normal e precisa ser conferido à mão. Confundir os dois é como um
 * 500 vira "tudo certo, acervo vazio".
 */
async function ida(caminho, opcoes) {
  let res
  try {
    res = await fetch(`${BASE}${caminho}`, opcoes)
  } catch (err) {
    throw new ErroAcervo(
      `Não foi possível falar com o servidor do acervo: ${err.message}`,
    )
  }

  let corpo = null
  try {
    corpo = await res.json()
  } catch {
    // Deixa nulo: tratado abaixo conforme o status.
  }

  if (!res.ok) {
    throw new ErroAcervo(
      corpo?.message || `O servidor respondeu ${res.status}.`,
      { status: res.status },
    )
  }

  return corpo
}

const COMO_JSON = { 'content-type': 'application/json' }

/** Todas as vagas do acervo, sem descrição. Lança quando não dá para saber. */
export async function lerAcervoRemoto() {
  const corpo = await ida('')
  return Array.isArray(corpo?.vagas) ? corpo.vagas : []
}

/**
 * Arquiva o que uma busca trouxe e devolve o acervo atualizado.
 *
 * Lista vazia não vai à rede: a busca sem resultado chamaria isto, e o
 * servidor devolveria o acervo inteiro para nada.
 */
export async function guardarVagasRemoto(vagas) {
  const lista = Array.isArray(vagas) ? vagas : []
  if (lista.length === 0) return []

  const corpo = await ida('', {
    method: 'POST',
    headers: COMO_JSON,
    body: JSON.stringify({ vagas: lista }),
  })
  return Array.isArray(corpo?.vagas) ? corpo.vagas : []
}

/** 404 vira `null`: a vaga saiu pelo teto, e isso é resposta, não falha. */
function nuloNoQuatroCentoQuatro(err) {
  if (err instanceof ErroAcervo && err.status === 404) return null
  throw err
}

/** A vaga inteira, com descrição — para a página de detalhe. */
export async function buscarVagaRemota(id) {
  return ida(`/${encodeURIComponent(id)}`).catch(nuloNoQuatroCentoQuatro)
}

/** Liga `fav`, `seen` ou `rank`. Outros campos o servidor ignora. */
export async function atualizarVagaRemota(id, campos) {
  return ida(`/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: COMO_JSON,
    body: JSON.stringify(campos),
  }).catch(nuloNoQuatroCentoQuatro)
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/acervoRemoto.test.js`
Expected: PASS — 12 testes

- [ ] **Step 5: Suíte, lint e commit**

```bash
npm test -- --run
npm run lint
git add src/acervoRemoto.js src/acervoRemoto.test.js
git commit -m "acervoRemoto.js: o acervo do outro lado da rede

Quatro fetch com uma regra: falha nunca vira lista vazia. Acervo vazio
por queda de rede é idêntico a acervo vazio de verdade, e a tela de vazio
aconselha 'faça uma busca' — conselho errado para quem viu um erro.

A exceção é o 404 de uma vaga, que é resposta e não falha: ela saiu do
acervo pelo teto, e isso devolve null."
```

---

### Task 6: `App.jsx` — três estados, migração e o rótulo da nota

O único passo que toca a tela.

**Files:**
- Modify: `src/App.jsx` (imports linha 51; estado linha ~3047; `arquivar` ~3063; ranking ~3762; `alterarVaga` ~3968; vazio da aba Banco ~1275)
- Modify: `src/acervo.js` (reduz à fonte da migração)
- Modify: `src/acervo.test.js` (o que sobra)

**Interfaces:**
- Consumes: tudo de `src/acervoRemoto.js` (Task 5)
- Produces: nenhuma interface nova para tarefas seguintes

- [ ] **Step 1: Escrever o teste que falha (a migração)**

Adicione ao fim de `src/acervo.test.js`:

```js
import { lerParaMigrar, marcarMigrado } from './acervo'

/**
 * A migração sobe o acervo que já está no `localStorage` para o servidor, uma
 * vez só.
 *
 * A marca é a parte que importa, e o precedente é o próprio `semeado`: sem
 * ela, o local voltaria a subir a cada carga, e qualquer coisa que o servidor
 * fizesse com aquelas vagas seria desfeita na sessão seguinte.
 */
describe('migração para o servidor', () => {
  test('a primeira leitura entrega o que estava guardado', () => {
    guardarVagas([vaga('a'), vaga('b')])
    expect(lerParaMigrar()).toHaveLength(2)
  })

  test('depois de marcada, não entrega mais nada', () => {
    guardarVagas([vaga('a')])
    marcarMigrado()
    expect(lerParaMigrar()).toEqual([])
  })

  test('a marca sobrevive ao recarregar', () => {
    guardarVagas([vaga('a')])
    marcarMigrado()
    expect(lerAcervo().migrado).toBe(true)
  })

  // Sem acervo local não há o que migrar, mas a marca tem que ser posta assim
  // mesmo — senão a migração fica armada para disparar mais tarde, despejando
  // um acervo velho dentro de um servidor que já tem vida própria.
  test('acervo vazio marca assim mesmo', () => {
    expect(lerParaMigrar()).toEqual([])
    marcarMigrado()
    expect(lerAcervo().migrado).toBe(true)
  })

  /**
   * O local não é apagado, só marcado. Se a migração der errado do outro lado,
   * o dado ainda está aqui para ser reenviado à mão.
   */
  test('marcar não apaga o acervo local', () => {
    guardarVagas([vaga('a')])
    marcarMigrado()
    expect(lerAcervo().vagas).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx vitest run src/acervo.test.js`
Expected: FAIL — `lerParaMigrar is not a function`

- [ ] **Step 3: Adicionar a migração ao `acervo.js`**

Em `src/acervo.js`, troque `const VAZIO = { vagas: [], semeado: false }` por:

```js
const VAZIO = { vagas: [], semeado: false, migrado: false }
```

Em `lerAcervo`, acrescente o campo ao objeto devolvido (as duas ocorrências do `return`):

```js
      migrado: dados?.migrado === true,
```

E acrescente ao fim do arquivo:

```js
/**
 * O que ainda não subiu para o servidor.
 *
 * Depois de `marcarMigrado`, devolve vazio para sempre — sem isso o acervo
 * local voltaria a subir a cada carga, e qualquer coisa que o servidor fizesse
 * com aquelas vagas seria desfeita na sessão seguinte. É o mesmo mecanismo do
 * `semeado`, pelo mesmo motivo.
 */
export function lerParaMigrar() {
  const acervo = lerAcervo()
  return acervo.migrado ? [] : acervo.vagas
}

/**
 * Fecha a migração.
 *
 * **Não apaga o acervo local**, só o marca. Se a subida der errado do outro
 * lado, o dado ainda está aqui para ser reenviado à mão — e apagá-lo seria
 * trocar um backup de graça por nada.
 *
 * Acervo vazio marca assim mesmo, senão a migração ficaria armada para
 * disparar mais tarde, despejando um acervo velho dentro de um servidor que já
 * tem vida própria.
 */
export function marcarMigrado() {
  return gravar({ ...lerAcervo(), migrado: true })
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx vitest run src/acervo.test.js`
Expected: PASS

- [ ] **Step 5: Commit da migração**

```bash
npm test -- --run
npm run lint
git add src/acervo.js src/acervo.test.js
git commit -m "acervo.js: a marca de migrado, para o local subir uma vez só

Mesmo mecanismo do semeado, pelo mesmo motivo: sem a marca, o acervo
local voltaria a subir a cada carga e desfaria o que o servidor fizesse.

Marcar não apaga o local — se a subida falhar, o dado ainda está aqui."
```

- [ ] **Step 6: Trocar o estado do acervo no `App.jsx`**

Troque o import da linha 51:

```js
import { lerParaMigrar, marcarMigrado } from './acervo'
import {
  atualizarVagaRemota,
  guardarVagasRemoto,
  lerAcervoRemoto,
} from './acervoRemoto'
```

Substitua o `useState` do acervo (linha ~3047) e o `arquivar` (~3063) por:

```js
  /**
   * O acervo: tudo que a busca já trouxe, de quem quer que tenha buscado.
   *
   * Deixou de ser `localStorage` e passou a ser o SQLite do servidor — ver
   * `docs/superpowers/specs/2026-09-03-acervo-compartilhado-design.md`. A
   * consequência que atravessa esta tela é que ele **não existe no primeiro
   * render**: precisa chegar, e pode não chegar.
   */
  const [acervo, setAcervo] = useState([])

  /** 'carregando' | 'pronto' | 'falhou' — ver `VazioDoAcervo`. */
  const [acervoEstado, setAcervoEstado] = useState('carregando')
  const [acervoErro, setAcervoErro] = useState('')
  // Muda para forçar uma nova tentativa depois de uma falha.
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let vivo = true

    async function carregar() {
      setAcervoEstado('carregando')
      try {
        // A migração vem antes da leitura para o acervo local aparecer já na
        // primeira tela, e não só depois de um F5.
        const local = lerParaMigrar()
        if (local.length) {
          await guardarVagasRemoto(local)
        }
        // Marca depois da subida: falhar aqui tem que deixar a migração
        // armada para a próxima vez, não consumi-la em silêncio.
        marcarMigrado()

        const vagas = await lerAcervoRemoto()
        if (!vivo) return
        setAcervo(vagas)
        setAcervoEstado('pronto')
      } catch (err) {
        if (!vivo) return
        setAcervoErro(err.message)
        setAcervoEstado('falhou')
      }
    }

    carregar()
    return () => {
      vivo = false
    }
  }, [tentativa])

  /**
   * Arquiva o que a busca trouxe e mantém o estado da tela em sincronia.
   *
   * Um ponto só para todos os caminhos que produzem vagas — rede, cache e
   * "Carregar mais" —, porque três chamadas espalhadas seriam três lugares
   * para esquecer de arquivar na próxima mudança.
   *
   * **Falhar aqui não derruba a busca.** As vagas já estão na tela: vieram da
   * API e já custaram cota. Perder o que foi pago por causa do arquivamento
   * seria trocar o problema grande pelo pequeno.
   */
  async function arquivar(vagas) {
    if (!vagas?.length) return
    try {
      setAcervo(await guardarVagasRemoto(vagas))
    } catch (err) {
      console.warn('[acervo] não consegui arquivar:', err.message)
    }
  }
```

- [ ] **Step 7: Ajustar os outros três chamadores**

Linha ~3762, no ranking — `guardarVagas` vira o `arquivar` que já trata falha:

```js
      await arquivar(ranqueadas)
```

Linha ~3968, `alterarVaga` — vira assíncrona e usa o PATCH:

```js
  async function alterarVaga(id, fn) {
    setMenu(null)
    setBanco((lista) => lista.map((x) => (x.id === id ? fn(x) : x)))
    // Otimista: a marca aparece na hora e o servidor confirma depois. Esperar
    // a rede para pintar uma bandeirinha faria o clique parecer engasgado.
    setAcervo((lista) => lista.map((x) => (x.id === id ? fn(x) : x)))

    const alvo = acervo.find((x) => x.id === id)
    if (!alvo) return
    const depois = fn(alvo)
    try {
      await atualizarVagaRemota(id, {
        fav: depois.fav,
        seen: depois.seen,
        rank: depois.rank,
      })
    } catch (err) {
      console.warn('[acervo] não consegui gravar a marca:', err.message)
    }
  }
```

- [ ] **Step 8: Dar à aba um estado de falha**

No bloco de vazio da aba Banco de Dados (linha ~1275), o componente passa a receber `estado` e `erro`. Troque o título e o texto por:

```jsx
      <div style={{ fontSize: 15, fontWeight: 600 }}>
        {estado === 'carregando'
          ? 'Carregando o acervo…'
          : estado === 'falhou'
            ? 'Não consegui carregar o acervo'
            : filtrando
              ? 'Nenhuma vaga com este filtro'
              : 'O acervo ainda está vazio'}
      </div>
```

e o parágrafo:

```jsx
        {estado === 'carregando' ? (
          <>Buscando no servidor o que já foi arquivado.</>
        ) : estado === 'falhou' ? (
          <>
            {/* Dizer que falhou, e não mostrar uma tela de vazio: acervo vazio
                por queda de rede é idêntico a acervo vazio de verdade, e o
                conselho "faça uma busca" mandaria gastar cota à toa. */}
            O acervo vive no servidor, e ele não respondeu. {erro}
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
          </>
        ) : filtrando ? (
          <>
            O acervo tem vagas, mas nenhuma casa com o que você pediu. Afrouxe
            os campos acima — filtrar aqui não gasta requisição, então pode
            tentar à vontade.
          </>
        ) : (
          <>
            Tudo que a aba Vagas trouxer fica guardado aqui, e o acervo é
            compartilhado: a busca de qualquer pessoa alimenta o mesmo banco.
          </>
        )}
```

O componente hoje é `function AcervoVazio({ filtrando, onLimpar })` (linha
~1237). Troque a assinatura por:

```js
function AcervoVazio({ filtrando, onLimpar, estado, erro, onTentarDeNovo }) {
```

E no lugar onde ele é usado, passe os três novos:

```jsx
  estado={acervoEstado}
  erro={acervoErro}
  onTentarDeNovo={() => setTentativa((n) => n + 1)}
```

**Os nomes têm que ser os das props, não os do `App`.** `acervoErro` e
`setTentativa` são estado do `App` e não existem dentro do `AcervoVazio` —
usá-los ali é `ReferenceError` em tempo de render, e o React derruba a aba
inteira.

Ajuste também o docstring do componente, que hoje afirma *"O acervo é local:
um vazio dele nunca é culpa de uma requisição"*. Depois desta mudança a frase
está errada — passou a ser exatamente a causa possível que o estado `falhou`
existe para nomear.

- [ ] **Step 9: O rótulo da nota compartilhada**

Onde a nota aparece na página de detalhe, acrescente abaixo dela:

```jsx
{vaga.rank != null && (
  <div style={{ fontSize: 12, color: '#7C8699', marginTop: 4 }}>
    Nota calculada contra o currículo de quem pediu a avaliação — o acervo
    é compartilhado, então ela pode não medir o seu.
  </div>
)}
```

E na coluna da tabela, um `title` no elemento da nota:

```jsx
title="O acervo é compartilhado: esta nota pode ter saído do currículo de outra pessoa."
```

- [ ] **Step 10: Rodar tudo e conferir na tela**

```bash
npm test -- --run
npm run lint
npm run build
PORT=3111 BANCO_CAMINHO=/tmp/acervo-teste.db node server.js
```

Confira à mão, com o app aberto em `http://localhost:3111`:

1. A aba Banco de Dados mostra "Carregando o acervo…" e depois a lista
2. Derrubando o servidor (Ctrl-C) e recarregando: aparece **"Não consegui carregar o acervo"** com o botão, e **não** a tela de vazio
3. Subindo de novo e clicando "Tentar de novo": a lista volta sem F5

O passo 2 é o ponto inteiro desta tarefa. Se ele mostrar a tela de vazio, o defeito ainda está lá.

- [ ] **Step 11: Commit**

```bash
git add src/App.jsx
git commit -m "App: o acervo vem do servidor, com os três estados que isso exige

carregando / pronto / falhou. 'Falhou' precisa dizer que falhou: acervo
vazio por queda de rede é visualmente idêntico a acervo vazio de verdade,
e a tela de vazio aconselhava 'faça uma busca' — mandando gastar cota
para consertar um problema de rede.

Arquivar que falha não derruba a busca: as vagas já estão na tela e já
custaram cota.

A nota da Claude ganhou rótulo. O acervo é compartilhado, então ela pode
ter saído do currículo de outra pessoa."
```

---

### Task 7: A descrição no detalhe — buscada sob demanda

`GET /api/acervo` corta `descricao`, e é o que torna a lista viável. Mas a
página de detalhe a mostra (`App.jsx:2604`), e `acharVaga` resolve de listas em
memória. Sem esta tarefa, abrir uma vaga que só existe no acervo mostra
descrição vazia — o mesmo sintoma que o `detalhe.js` já documenta ter custado
uma aba inteira.

**Files:**
- Modify: `src/App.jsx` (estado novo perto de `vagaAberta`, linha ~3167; `abrirVaga` ~3231; `detalhe` ~3391)

**Interfaces:**
- Consumes: `buscarVagaRemota` de `src/acervoRemoto.js` (Task 5)
- Produces: nenhuma

- [ ] **Step 1: Reproduzir o defeito na tela**

Com o servidor da Task 6 no ar e pelo menos uma vaga no acervo:

1. Recarregue a página (para o `banco` nascer vazio — assim a vaga só existe no acervo)
2. Aba Banco de Dados → clique numa vaga

Expected: a página de detalhe abre com o bloco de descrição **vazio**.

Este passo é a evidência. Sem vê-lo, não há como saber se o conserto consertou.

- [ ] **Step 2: Guardar as descrições que chegarem**

Perto do estado `vagaAberta` (linha ~3167), acrescente:

```js
  /**
   * As descrições buscadas sob demanda, por id.
   *
   * `GET /api/acervo` não traz `descricao` — ela é 66% do peso e a tabela não
   * a mostra. Só a página de detalhe precisa, e é uma vaga por vez, então ela
   * busca a sua quando abre.
   *
   * Um mapa e não um campo na vaga: sobrescrever a lista do acervo a cada
   * abertura faria o `filtroAcervo` e os dropdowns recalcularem à toa.
   */
  const [descricoes, setDescricoes] = useState({})
```

- [ ] **Step 3: Buscar ao abrir**

Dentro de `abrirVaga` (linha ~3231), depois do que já existe, acrescente:

```js
    // A descrição não vem na lista. Busca a desta vaga, uma vez — e falha
    // calada de propósito: o detalhe abre sem a descrição, que é o mesmo que
    // acontecia antes, e um aviso vermelho por um campo ausente seria pior que
    // o campo ausente.
    if (!descricoes[id]) {
      buscarVagaRemota(id)
        .then((vaga) => {
          if (vaga?.descricao) {
            setDescricoes((atual) => ({ ...atual, [id]: vaga.descricao }))
          }
        })
        .catch((err) => console.warn('[acervo] sem descrição:', err.message))
    }
```

Acrescente `buscarVagaRemota` ao import de `./acervoRemoto`.

- [ ] **Step 4: Completar a vaga aberta**

Troque a linha ~3391:

```js
  const detalhe = acharVaga(vagaAberta, banco, vagasIa, acervo)
```

por:

```js
  /**
   * A vaga aberta, completada com a descrição se ela já chegou.
   *
   * Não é uma quarta lista para o `acharVaga` — a vaga é a mesma, só lhe falta
   * um campo. Ele continua sendo o ponto único que reconcilia as três listas,
   * como o docstring dele exige.
   */
  const encontrada = acharVaga(vagaAberta, banco, vagasIa, acervo)
  const detalhe =
    encontrada && !encontrada.descricao && descricoes[encontrada.id]
      ? { ...encontrada, descricao: descricoes[encontrada.id] }
      : encontrada
```

- [ ] **Step 5: Confirmar na tela**

Repita o Step 1. Expected: a descrição aparece — na primeira abertura, logo
depois de a página montar.

Confira também que a lista continua leve: no DevTools, aba Network, o
`GET /api/acervo` **não** pode trazer `descricao` nos itens.

- [ ] **Step 6: Suíte, lint e commit**

```bash
npm test -- --run
npm run lint
git add src/App.jsx
git commit -m "Detalhe: busca a descrição da vaga aberta, que a lista não traz

A lista corta a descrição de propósito — 66% do peso para um campo que a
tabela não mostra. O detalhe mostra, então ele busca a sua quando abre.

Um mapa por id, e não um campo reescrito na lista do acervo: sobrescrever
a lista a cada abertura faria o filtro e os dropdowns recalcularem à toa."
```

---

### Task 8: Volume no Railway e deploy

**Files:**
- Modify: `README.md` (a seção "Railway — a versão que funciona", linha ~524)
- Modify: `ONDE-PARAMOS.md` (comandos e lições)

- [ ] **Step 1: Criar o volume**

```bash
railway volume add --mount-path /dados
railway variables --set BANCO_CAMINHO=/dados/acervo.db
```

Confira: `railway volume list` deve mostrar o volume montado em `/dados`.

- [ ] **Step 2: Documentar no README**

Na seção do Railway, acrescente a terceira variável e o volume:

````markdown
Railway precisa de duas variáveis de ambiente, um volume e uma terceira
variável apontando para ele:

```
JSEARCH_API_KEY=...
ANTHROPIC_API_KEY=...
BANCO_CAMINHO=/dados/acervo.db
```

O volume é montado em `/dados` e **não é opcional**. O disco comum do Railway
é efêmero: sem volume, o acervo morre a cada deploy — que é exatamente o
defeito que ele veio corrigir.

Local, `BANCO_CAMINHO` pode ficar sem valor: o padrão é `acervo.db` ao lado do
código, e ele está no `.gitignore`.
````

- [ ] **Step 3: Commit e deploy**

```bash
git add README.md ONDE-PARAMOS.md
git commit -m "README: o volume do acervo, e por que ele não é opcional"
git push origin main
```

- [ ] **Step 4: Verificar no ar**

Espere o build e confira:

```bash
curl -s https://vagas-production-6922.up.railway.app/api/acervo | head -c 300
```

Expected: `{"vagas":[...]}` — 200, JSON, não o `index.html`.

- [ ] **Step 5: A verificação que importa — sobreviver ao deploy**

```bash
railway redeploy
```

Depois que subir, chame o `GET` de novo. **As vagas têm que continuar lá.**

Este é o teste do trabalho inteiro: sem o volume o banco zera aqui, e zerar
aqui é o defeito que motivou tudo. Se as vagas sumirem, o volume não está
montado — confira `railway volume list` e o valor de `BANCO_CAMINHO`.

---

## Autoverificação do plano

**Cobertura da spec:** seção 1 (levantamento) → contexto das Tasks 1-2 · seção 2 (decisões) → Task 2 (`CAMPOS_PATCH`), Task 4 (sem `DELETE`), Task 6 (rótulo) · seção 3 (linha) → Tasks 5-6 · seção 4 (módulos) → Tasks 1, 2, 3, 5 · seção 5 (tabela) → Task 2 · seção 6 (rotas e teto) → Tasks 2 e 4 · seção 7 (o que quebra) → Task 6 · seção 8 (fora de escopo) → respeitado: nenhuma task cria `escondidos.js`, login, paginação ou `DELETE` · seção 9 (migração) → Task 6 steps 1-5 · seção 10 (infra) → Task 7 · seção 11 (testes) → um arquivo por task · seção 12 (ordem) → as oito tasks, nesta ordem (a spec previa sete; a Task 7 saiu da autoverificação).

**Consistência de nomes:** `mesclar`/`temId`/`agora` (Task 1) são os importados na Task 2 · `abrirBanco`/`criarAcervo` (Task 2) são os importados nas Tasks 3-4 · `criarApp({ acervo })` (Task 3) recebe o argumento na Task 4 · `lerAcervoRemoto`/`guardarVagasRemoto`/`buscarVagaRemota`/`atualizarVagaRemota`/`ErroAcervo` (Task 5) são os usados na Task 6 · `lerParaMigrar`/`marcarMigrado` (Task 6 step 3) são os usados no step 6.

**O buraco que a autoverificação achou, e que virou tarefa:** `buscarVagaRemota` nascia na Task 5 sem chamador nenhum, e a página de detalhe lê `descricao` de uma lista que deixou de trazê-la — abrir uma vaga do acervo mostraria descrição vazia. É a Task 7, com um passo de reprodução antes do conserto.
