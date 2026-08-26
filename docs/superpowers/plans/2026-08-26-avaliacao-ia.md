# Avaliação IA — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ligar a Claude ao protótipo para preencher o Rank IA e a aba Vaga Inteligente, hoje ambos apenas casca.

**Architecture:** Duas chamadas no caminho normal — uma no upload do currículo, que extrai um perfil estruturado (e deduz o cargo), e uma por busca, que ranqueia um lote de 10 a 15 vagas devolvendo só `{id, nota, motivo}`. Uma terceira, sob demanda, escreve a justificativa da vaga que o usuário abrir. A chave vive no proxy do dev server, nunca no bundle.

**Tech Stack:** React 19, Vite 8, `@anthropic-ai/sdk` + `zod` (saída estruturada via `messages.parse()` / `zodOutputFormat`), `mammoth` (`.docx` → texto), `vitest`, `localStorage`.

**Spec:** `docs/superpowers/specs/2026-08-26-avaliacao-ia-design.md`

## Global Constraints

- **Modelo:** `claude-opus-5`, declarado em `src/api/claude.js` e em nenhum outro lugar.
- **`ANTHROPIC_API_KEY` nunca com prefixo `VITE_`.** O prefixo publicaria a chave em `dist/assets/*.js`. Vale o mesmo já documentado para `JSEARCH_API_KEY`.
- **Funciona só em `npm run dev`.** Não há proxy em produção. Nada neste plano muda isso.
- **Unidade de salário: R$ mil** (4.5 = R$ 4.500), igual ao `min`/`max` do `src/api/mapear.js`.
- **Nenhuma chamada à Claude é mockada.** Testa-se a lógica pura; a rede se verifica no `npm run dev` com o console mostrando a resposta crua, como o `mapearVagas` já faz.
- **Toda leitura e escrita de `localStorage` é defensiva** (`try`/`catch`, valor corrompido tratado como vazio), seguindo o padrão já estabelecido em `src/cota.js`.
- **Código e comentários em português**, no mesmo tom dos módulos existentes: explicar *por quê*, não *o quê*.
- **`max_tokens`:** 8.000 na extração de perfil, 2.000 no ranking, 2.000 na justificativa. Sem streaming.
- **Saída estruturada é `claude.messages.parse()` com `output_config: { format: zodOutputFormat(Schema) }`**, e o resultado sai em `resposta.parsed_output` — que vem `null` se a validação falhar. Não montar JSON Schema à mão nem dar `JSON.parse` num bloco de texto. A justificativa é a exceção: devolve prosa, então usa `messages.create()`.

---

## Estrutura de arquivos

| arquivo | responsabilidade |
|---|---|
| `src/api/claude.js` | cliente apontado ao proxy; modelo, effort e classificação de erro num lugar só |
| `src/api/perfil.js` | PDF ou texto → perfil estruturado |
| `src/api/ranking.js` | montagem do lote, chamada, e validação da volta |
| `src/api/justificativa.js` | prosa sob demanda para uma vaga |
| `src/docx.js` | `.docx` → texto, via `mammoth` |
| `src/curriculo.js` | perfil, texto cru, correções e instrução, persistidos |
| `src/custo.js` | tokens, dólares e o teto |
| `src/paineis/PainelIA.jsx` | aba Avaliação IA: upload, textarea, tela de conferência |
| `src/paineis/PainelVagaInteligente.jsx` | aba Vaga Inteligente: fluxo real |
| `src/__fixtures__/curriculo.docx` | `.docx` real para o teste do `docx.js` |

`src/App.jsx` perde os dois painéis e ganha a fiação. Os outros painéis ficam onde estão.

---

## Task 0: Commitar o trabalho que já existe

O repositório tem um dia inteiro de trabalho fora do git — integração JSearch, cota, cache, cidades do IBGE. Um `git checkout` acidental apaga tudo, e nenhuma tarefa abaixo deve empilhar mudanças por cima disso.

**Files:** nenhum arquivo novo.

- [ ] **Step 1: Conferir o que entra**

```bash
git status --short
git diff --stat
```

Esperado: 7 modificados, 6 não rastreados. Nenhum `.env` na lista — se aparecer, **pare** e confira o `.gitignore` antes de qualquer coisa.

- [ ] **Step 2: Commitar**

```bash
git add -A
git commit -m "Integra a busca real da JSearch, com cota, cache e cidades do IBGE"
```

- [ ] **Step 3: Confirmar que o `.env` ficou de fora**

```bash
git show --stat HEAD | grep -c "\.env$" || echo "ok: .env fora do commit"
```

Esperado: `ok: .env fora do commit`.

---

## Task 1: Ferramental — dependências, vitest e o proxy da Claude

**Files:**
- Modify: `package.json`
- Modify: `vite.config.js:14-38` (o `guardaDeChave`) e `:63-81` (o bloco `proxy`)
- Modify: `.env.example`
- Create: `src/exemplo.test.js` (temporário, removido no Step 6)

**Interfaces:**
- Consumes: nada.
- Produces: `npm test` executando vitest; `/api/claude/*` respondendo no dev server; `ANTHROPIC_API_KEY` lida pelo `loadEnv`.

> Configuração de build não tem teste unitário honesto — este task se verifica rodando o servidor e batendo nos dois endpoints. As tarefas seguintes são todas TDD.

- [ ] **Step 1: Instalar as dependências**

```bash
npm install @anthropic-ai/sdk mammoth zod
npm install -D vitest
```

> `zod` não é enfeite: a saída estruturada da API é declarada com
> `zodOutputFormat(Schema)` e validada por `client.messages.parse()`, que é o
> caminho documentado do SDK. De quebra, o mesmo schema valida o perfil que
> volta do `localStorage`.

- [ ] **Step 2: Adicionar o script de teste**

Em `package.json`, dentro de `"scripts"`, ao lado de `"lint"`:

```json
    "test": "vitest run",
```

- [ ] **Step 3: Provar que o vitest roda**

Criar `src/exemplo.test.js`:

```js
import { expect, test } from 'vitest'

test('o vitest está de pé', () => {
  expect(1 + 1).toBe(2)
})
```

Rodar: `npm test`
Esperado: 1 passed.

- [ ] **Step 4: Generalizar o `guardaDeChave`**

Hoje ele conhece uma chave só. Em `vite.config.js`, substituir a função inteira por:

```js
/**
 * Corta a requisição antes do proxy quando não há chave, para o erro na tela
 * dizer o que fazer em vez de devolver um 401 genérico — e, principalmente,
 * para não contar como requisição gasta: nada saiu da máquina.
 *
 * `configureServer` roda antes dos middlewares internos do Vite, então este
 * tem prioridade sobre o proxy.
 */
function guardaDeChave({ nome, prefixo, chave, variavel }) {
  return {
    name: `guarda-de-chave-${nome}`,
    configureServer(server) {
      server.middlewares.use(prefixo, (req, res, next) => {
        if (chave) return next()
        res.statusCode = 500
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.setHeader('x-jsearch-proxy', 'sem-chave')
        res.end(
          JSON.stringify({
            message: `${variavel} não encontrada. Copie .env.example para .env, cole sua chave e reinicie o npm run dev.`,
          }),
        )
      })
    },
  }
}
```

- [ ] **Step 5: Adicionar o proxy da Claude**

No topo do arquivo, ao lado das constantes que já existem:

```js
const UPSTREAM_CLAUDE = 'https://api.anthropic.com'
const PREFIXO_CLAUDE = '/api/claude'
```

Dentro de `defineConfig`, depois da leitura da chave do JSearch:

```js
  const chaveClaude = env.ANTHROPIC_API_KEY?.trim()

  if (!chaveClaude) {
    console.warn(
      '\n[claude] ANTHROPIC_API_KEY ausente. A Avaliação IA não vai funcionar.\n',
    )
  }
```

Trocar a linha dos plugins por:

```js
    plugins: [
      react(),
      tailwindcss(),
      guardaDeChave({
        nome: 'jsearch',
        prefixo: PREFIXO,
        chave,
        variavel: 'JSEARCH_API_KEY',
      }),
      guardaDeChave({
        nome: 'claude',
        prefixo: PREFIXO_CLAUDE,
        chave: chaveClaude,
        variavel: 'ANTHROPIC_API_KEY',
      }),
    ],
```

E acrescentar, dentro do objeto `proxy`, ao lado da entrada do JSearch:

```js
        [PREFIXO_CLAUDE]: {
          target: UPSTREAM_CLAUDE,
          changeOrigin: true,
          rewrite: (caminho) => caminho.replace(PREFIXO_CLAUDE, '/v1'),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              // Sobrescreve: o SDK manda uma chave falsa, a real entra aqui.
              // O `anthropic-version` o próprio SDK já envia.
              if (chaveClaude) proxyReq.setHeader('x-api-key', chaveClaude)
              console.log(`[claude] -> ${UPSTREAM_CLAUDE}${proxyReq.path}`)
            })
            proxy.on('proxyRes', (proxyRes, req) => {
              console.log(`[claude] <- ${proxyRes.statusCode} ${req.url}`)
            })
            proxy.on('error', (err) => {
              console.error('[claude] erro de proxy:', err.message)
            })
          },
        },
```

- [ ] **Step 6: Atualizar o `.env.example` e remover o teste temporário**

Acrescentar ao final do `.env.example`:

```
# Chave da Anthropic, para a Avaliação IA. Mesmo motivo do sem-VITE_ acima:
# esta variável fica no processo Node do dev server, que monta o header
# x-api-key do proxy. Renomear para VITE_ANTHROPIC_API_KEY publicaria a chave
# em dist/assets/*.js — e esta, diferente da JSearch, não tem teto de uso.
ANTHROPIC_API_KEY=cole_sua_chave_aqui
```

```bash
rm src/exemplo.test.js
```

- [ ] **Step 7: Verificar os dois endpoints à mão**

Com `ANTHROPIC_API_KEY` preenchida no `.env`, rodar `npm run dev` e, em outro terminal:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "http://localhost:5173/api/claude/models"
```

Esperado: `200`. Um `401` significa chave errada; um `500` com `x-jsearch-proxy: sem-chave`, chave ausente no `.env`.

Confirmar que o JSearch não quebrou: abrir a aba Vagas e repetir uma busca que já esteja em cache (não gasta cota) — a lista tem que aparecer.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json vite.config.js .env.example
git commit -m "Proxy da Claude no dev server, mais vitest e as dependências"
```

---

## Task 2: `src/custo.js` — medidor e teto

**Files:**
- Create: `src/custo.js`
- Test: `src/custo.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `LIMITE_PADRAO_USD: number`
  - `lerCusto(): { desde: string|null, chamadas: Chamada[], teto: number }`
  - `registrarChamada(tipo: 'perfil'|'ranking'|'justificativa', uso: {input_tokens, output_tokens}, modelo: string, agora?: Date): Custo`
  - `dolares(chamadas: Chamada[]): number`
  - `excedeuTeto(custo): boolean`
  - `zerarCusto(agora?: Date): Custo`
  - `definirTeto(usd: number): Custo`
  - `Chamada = { quando: string, tipo: string, entrada: number, saida: number, modelo: string }`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/custo.test.js`:

```js
import { beforeEach, describe, expect, test } from 'vitest'
import {
  LIMITE_PADRAO_USD,
  definirTeto,
  dolares,
  excedeuTeto,
  lerCusto,
  registrarChamada,
  zerarCusto,
} from './custo'

beforeEach(() => localStorage.clear())

describe('dolares', () => {
  test('cobra entrada e saída com preços diferentes', () => {
    // 1M de entrada a US$5 + 1M de saída a US$25 = US$30
    const chamadas = [
      { entrada: 1_000_000, saida: 1_000_000, modelo: 'claude-opus-5' },
    ]
    expect(dolares(chamadas)).toBeCloseTo(30, 6)
  })

  test('soma várias chamadas', () => {
    const chamadas = [
      { entrada: 13_300, saida: 270, modelo: 'claude-opus-5' },
      { entrada: 13_300, saida: 270, modelo: 'claude-opus-5' },
    ]
    // (13300*5 + 270*25) / 1e6 = 0.073250 por chamada
    expect(dolares(chamadas)).toBeCloseTo(0.14650, 5)
  })

  test('modelo desconhecido não derruba a conta, conta como zero', () => {
    expect(dolares([{ entrada: 100, saida: 100, modelo: 'inventado' }])).toBe(0)
  })
})

describe('registrarChamada', () => {
  test('guarda tokens, não dólares', () => {
    const custo = registrarChamada(
      'ranking',
      { input_tokens: 13_300, output_tokens: 270 },
      'claude-opus-5',
      new Date('2026-08-26T12:00:00Z'),
    )
    expect(custo.chamadas[0]).toMatchObject({
      tipo: 'ranking',
      entrada: 13_300,
      saida: 270,
      modelo: 'claude-opus-5',
    })
    expect(custo.chamadas[0]).not.toHaveProperty('usd')
  })

  test('a mais recente vem primeiro', () => {
    registrarChamada('perfil', { input_tokens: 1, output_tokens: 1 }, 'claude-opus-5')
    registrarChamada('ranking', { input_tokens: 2, output_tokens: 2 }, 'claude-opus-5')
    expect(lerCusto().chamadas[0].tipo).toBe('ranking')
  })
})

describe('teto', () => {
  test('começa no padrão', () => {
    expect(lerCusto().teto).toBe(LIMITE_PADRAO_USD)
  })

  test('não excede quando está abaixo', () => {
    registrarChamada('ranking', { input_tokens: 1000, output_tokens: 10 }, 'claude-opus-5')
    expect(excedeuTeto(lerCusto())).toBe(false)
  })

  test('excede quando passa do teto', () => {
    definirTeto(0.01)
    registrarChamada(
      'ranking',
      { input_tokens: 1_000_000, output_tokens: 0 },
      'claude-opus-5',
    )
    expect(excedeuTeto(lerCusto())).toBe(true)
  })

  test('definirTeto sobrevive à leitura', () => {
    definirTeto(12)
    expect(lerCusto().teto).toBe(12)
  })
})

describe('leitura defensiva', () => {
  test('storage vazio devolve o estado zerado', () => {
    expect(lerCusto()).toEqual({
      desde: null,
      chamadas: [],
      teto: LIMITE_PADRAO_USD,
    })
  })

  test('valor corrompido não lança', () => {
    localStorage.setItem('vagas:custo', 'isto não é json')
    expect(() => lerCusto()).not.toThrow()
    expect(lerCusto().chamadas).toEqual([])
  })

  test('formato antigo com campos errados vira o estado zerado', () => {
    localStorage.setItem('vagas:custo', JSON.stringify({ chamadas: 'nope' }))
    expect(lerCusto().chamadas).toEqual([])
  })
})

describe('zerarCusto', () => {
  test('esvazia as chamadas e mantém o teto', () => {
    definirTeto(9)
    registrarChamada('perfil', { input_tokens: 10, output_tokens: 10 }, 'claude-opus-5')
    const custo = zerarCusto(new Date('2026-09-01T00:00:00Z'))
    expect(custo.chamadas).toEqual([])
    expect(custo.teto).toBe(9)
    expect(custo.desde).toBe('2026-09-01T00:00:00.000Z')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -- custo`
Esperado: FAIL — `Failed to resolve import "./custo"`.

> Se em vez disso o erro for `localStorage is not defined`, o ambiente do vitest está em `node`. Acrescentar ao `vite.config.js`, no objeto devolvido: `test: { environment: 'jsdom' }` e instalar `npm install -D jsdom`.

- [ ] **Step 3: Escrever o `src/custo.js`**

```js
/**
 * Quanto a Claude já custou neste ciclo.
 *
 * O `cota.js` cuida das 200 requisições mensais do JSearch — uma contagem, com
 * teto imposto pelo provedor. Aqui a unidade é outra: dólares por token, sem
 * teto nenhum do lado de lá. A Claude só para quando o cartão para, então o
 * teto é nosso.
 *
 * Guarda token, calcula dólar na leitura. Preço muda; um valor em dólar gravado
 * vira mentira no dia do reajuste. Token é fato.
 */

/** US$ por 1M de tokens. Fonte: precificação da Anthropic. */
export const PRECOS = {
  'claude-opus-5': { entrada: 5, saida: 25 },
}

/** Teto mensal de partida. Seguro barato contra um bug de laço. */
export const LIMITE_PADRAO_USD = 5

const CHAVE = 'vagas:custo'

const VAZIO = { desde: null, chamadas: [], teto: LIMITE_PADRAO_USD }

export function lerCusto() {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return { ...VAZIO, chamadas: [] }
    const dados = JSON.parse(cru)
    return {
      desde: typeof dados.desde === 'string' ? dados.desde : null,
      chamadas: Array.isArray(dados.chamadas) ? dados.chamadas : [],
      teto:
        typeof dados.teto === 'number' && dados.teto > 0
          ? dados.teto
          : LIMITE_PADRAO_USD,
    }
  } catch {
    return { ...VAZIO, chamadas: [] }
  }
}

function gravar(custo) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(custo))
  } catch {
    // Storage cheio ou bloqueado: o medidor vira volátil nesta sessão, mas a
    // chamada em si não tem por que falhar.
  }
  return custo
}

/**
 * `uso` é o `response.usage` do SDK. Modelo desconhecido é guardado do mesmo
 * jeito — o registro é histórico, e o preço a gente resolve na leitura.
 */
export function registrarChamada(tipo, uso, modelo, agora = new Date()) {
  const custo = lerCusto()
  const quando = agora.toISOString()
  return gravar({
    ...custo,
    desde: custo.desde ?? quando,
    chamadas: [
      {
        quando,
        tipo,
        entrada: uso?.input_tokens ?? 0,
        saida: uso?.output_tokens ?? 0,
        modelo,
      },
      ...custo.chamadas,
    ].slice(0, 200),
  })
}

/**
 * Modelo fora da tabela conta como zero em vez de lançar: um preço
 * desconhecido não pode derrubar a aba Controle.
 */
export function dolares(chamadas) {
  return chamadas.reduce((soma, c) => {
    const preco = PRECOS[c.modelo]
    if (!preco) return soma
    return soma + (c.entrada * preco.entrada + c.saida * preco.saida) / 1_000_000
  }, 0)
}

export function excedeuTeto(custo) {
  return dolares(custo.chamadas) >= custo.teto
}

export function zerarCusto(agora = new Date()) {
  const custo = lerCusto()
  return gravar({ ...custo, desde: agora.toISOString(), chamadas: [] })
}

export function definirTeto(usd) {
  return gravar({ ...lerCusto(), teto: usd })
}
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -- custo`
Esperado: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add src/custo.js src/custo.test.js
git commit -m "Medidor de custo da Claude, com teto mensal"
```

---

## Task 3: `src/curriculo.js` — persistência do currículo

**Files:**
- Create: `src/curriculo.js`
- Test: `src/curriculo.test.js`

**Interfaces:**
- Consumes: nada.
- Produces:
  - `VERSAO: 1`
  - `lerCurriculo(): Curriculo | null`
  - `gravarCurriculo({ arquivo, texto, perfil }): Curriculo`
  - `perfilEfetivo(cv): object | null`
  - `corrigirPerfil(campo: string, valor: any): Curriculo`
  - `limparCorrecoes(): Curriculo`
  - `definirInstrucao(texto: string): Curriculo`
  - `removerCurriculo(): void`
  - `Curriculo = { versao, arquivo: {nome, tamanho, quando}, texto, perfil, correcoes, instrucao }`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/curriculo.test.js`:

```js
import { beforeEach, describe, expect, test } from 'vitest'
import { limparCache } from './cota'
import {
  VERSAO,
  corrigirPerfil,
  definirInstrucao,
  gravarCurriculo,
  lerCurriculo,
  limparCorrecoes,
  perfilEfetivo,
  removerCurriculo,
} from './curriculo'

const PERFIL = {
  cargo_deduzido: 'Técnico de Suporte de TI',
  senioridade: 'junior',
  cidade: 'Caxias do Sul, RS',
  aceita_remoto: true,
  pretensao_min: null,
  tecnologias: [{ nome: 'Python', profundidade: 'producao', anos: 3 }],
  formacao: 'Tecnólogo em ADS (cursando)',
  resumo: 'Suporte migrando para dev.',
}

function gravarExemplo() {
  return gravarCurriculo({
    arquivo: { nome: 'cv.pdf', tamanho: '120 KB', quando: '2026-08-26T12:00:00Z' },
    texto: 'texto cru do currículo',
    perfil: PERFIL,
  })
}

beforeEach(() => localStorage.clear())

describe('lerCurriculo', () => {
  test('sem nada gravado devolve null', () => {
    expect(lerCurriculo()).toBe(null)
  })

  test('devolve o que foi gravado', () => {
    gravarExemplo()
    const cv = lerCurriculo()
    expect(cv.texto).toBe('texto cru do currículo')
    expect(cv.perfil.cargo_deduzido).toBe('Técnico de Suporte de TI')
    expect(cv.versao).toBe(VERSAO)
  })

  test('versão desconhecida é descartada, não migrada', () => {
    localStorage.setItem(
      'vagas:cv',
      JSON.stringify({ versao: 99, perfil: PERFIL, texto: 'x' }),
    )
    expect(lerCurriculo()).toBe(null)
  })

  test('valor corrompido não lança', () => {
    localStorage.setItem('vagas:cv', 'isto não é json')
    expect(() => lerCurriculo()).not.toThrow()
    expect(lerCurriculo()).toBe(null)
  })
})

describe('correções', () => {
  test('o perfil efetivo aplica a correção por cima', () => {
    gravarExemplo()
    corrigirPerfil('pretensao_min', 4.5)
    expect(perfilEfetivo(lerCurriculo()).pretensao_min).toBe(4.5)
  })

  test('a correção não sobrescreve o perfil extraído', () => {
    gravarExemplo()
    corrigirPerfil('cidade', 'Bento Gonçalves, RS')
    const cv = lerCurriculo()
    expect(cv.perfil.cidade).toBe('Caxias do Sul, RS')
    expect(cv.correcoes.cidade).toBe('Bento Gonçalves, RS')
  })

  test('limparCorrecoes volta ao que a IA entendeu', () => {
    gravarExemplo()
    corrigirPerfil('cidade', 'Bento Gonçalves, RS')
    limparCorrecoes()
    expect(perfilEfetivo(lerCurriculo()).cidade).toBe('Caxias do Sul, RS')
  })

  test('regravar o perfil preserva as correções', () => {
    gravarExemplo()
    corrigirPerfil('pretensao_min', 4.5)
    gravarCurriculo({
      arquivo: { nome: 'cv2.pdf', tamanho: '90 KB', quando: '2026-08-27T12:00:00Z' },
      texto: 'outro texto',
      perfil: { ...PERFIL, senioridade: 'pleno' },
    })
    const cv = lerCurriculo()
    expect(cv.perfil.senioridade).toBe('pleno')
    expect(perfilEfetivo(cv).pretensao_min).toBe(4.5)
  })

  test('perfilEfetivo com cv nulo devolve null', () => {
    expect(perfilEfetivo(null)).toBe(null)
  })
})

describe('instrução', () => {
  test('sobrevive à leitura', () => {
    gravarExemplo()
    definirInstrucao('Pontue só por aderência técnica.')
    expect(lerCurriculo().instrucao).toBe('Pontue só por aderência técnica.')
  })
})

describe('remoção', () => {
  test('removerCurriculo apaga a chave, não só a memória', () => {
    gravarExemplo()
    removerCurriculo()
    expect(localStorage.getItem('vagas:cv')).toBe(null)
    expect(lerCurriculo()).toBe(null)
  })

  test('limpar o cache do JSearch não leva o currículo junto', () => {
    gravarExemplo()
    limparCache()
    expect(lerCurriculo()).not.toBe(null)
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -- curriculo`
Esperado: FAIL — `Failed to resolve import "./curriculo"`.

- [ ] **Step 3: Escrever o `src/curriculo.js`**

```js
/**
 * O currículo do candidato, persistido.
 *
 * Chave própria, separada do `vagas:cota`: ciclo de vida diferente, e "Limpar
 * cache" não pode levar o currículo junto.
 *
 * Guarda três coisas que parecem uma só:
 *
 *   perfil      o que a IA extraiu
 *   correcoes   o que o aluno corrigiu por cima
 *   texto       o texto cru, para a justificativa detalhada
 *
 * `correcoes` fica separado de propósito. Se o schema melhorar e o perfil for
 * re-extraído, a correção do aluno sobrevive — e dá para oferecer "voltar ao
 * que a IA entendeu", impossível se a correção sobrescrevesse.
 *
 * Toda leitura é defensiva, pelo mesmo motivo do `cota.js`: aba anônima,
 * storage bloqueado ou valor corrompido por uma versão anterior fazem o acesso
 * lançar, e a tela não pode quebrar por causa disso.
 */

/** Sobe quando a forma do perfil mudar. Versão desconhecida é descartada. */
export const VERSAO = 1

const CHAVE = 'vagas:cv'

export function lerCurriculo() {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return null
    const dados = JSON.parse(cru)
    // Migrar um formato antigo daria mais erro que valor: o perfil velho
    // alimentaria um prompt novo em silêncio. Melhor pedir o currículo de novo.
    if (dados?.versao !== VERSAO) return null
    return {
      versao: VERSAO,
      arquivo: dados.arquivo ?? null,
      texto: typeof dados.texto === 'string' ? dados.texto : '',
      perfil: dados.perfil ?? null,
      correcoes:
        dados.correcoes && typeof dados.correcoes === 'object'
          ? dados.correcoes
          : {},
      instrucao: typeof dados.instrucao === 'string' ? dados.instrucao : null,
    }
  } catch {
    return null
  }
}

function gravar(cv) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(cv))
  } catch {
    // Storage cheio ou bloqueado: vale nesta sessão e some no reload.
  }
  return cv
}

/**
 * Grava um currículo novo. As correções e a instrução do anterior ficam —
 * trocar o arquivo não é motivo para o aluno redigitar a pretensão salarial.
 */
export function gravarCurriculo({ arquivo, texto, perfil }) {
  const anterior = lerCurriculo()
  return gravar({
    versao: VERSAO,
    arquivo,
    texto: texto ?? '',
    perfil,
    correcoes: anterior?.correcoes ?? {},
    instrucao: anterior?.instrucao ?? null,
  })
}

/** O perfil que as chamadas usam: o extraído, com as correções por cima. */
export function perfilEfetivo(cv) {
  if (!cv?.perfil) return null
  return { ...cv.perfil, ...cv.correcoes }
}

export function corrigirPerfil(campo, valor) {
  const cv = lerCurriculo()
  if (!cv) return null
  return gravar({ ...cv, correcoes: { ...cv.correcoes, [campo]: valor } })
}

export function limparCorrecoes() {
  const cv = lerCurriculo()
  if (!cv) return null
  return gravar({ ...cv, correcoes: {} })
}

export function definirInstrucao(texto) {
  const cv = lerCurriculo()
  if (!cv) return null
  return gravar({ ...cv, instrucao: texto })
}

/** Apaga de verdade. O botão da tela chama isto, não um setState. */
export function removerCurriculo() {
  try {
    localStorage.removeItem(CHAVE)
  } catch {
    // Nada a fazer: se não dá para escrever, não dá para apagar.
  }
}
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -- curriculo`
Esperado: 12 passed.

- [ ] **Step 5: Commit**

```bash
git add src/curriculo.js src/curriculo.test.js
git commit -m "Persistência do currículo, com correções separadas do perfil extraído"
```

---

## Task 4: `src/docx.js` — `.docx` para texto

**Files:**
- Create: `src/docx.js`
- Create: `src/__fixtures__/curriculo.docx`
- Test: `src/docx.test.js`

**Interfaces:**
- Consumes: nada.
- Produces: `extrairDocx(arquivoOuBuffer: File|ArrayBuffer): Promise<string>` — lança `Error` com mensagem em português se o arquivo não abrir.

- [ ] **Step 1: Gerar o fixture**

Um `.docx` é um zip com XML dentro. Este script monta um mínimo válido sem depender do Word:

```bash
node -e "
const {execSync}=require('child_process');const fs=require('fs');const os=require('os');const path=require('path');
const d=fs.mkdtempSync(path.join(os.tmpdir(),'docx'));
fs.mkdirSync(path.join(d,'_rels'));fs.mkdirSync(path.join(d,'word'));
fs.writeFileSync(path.join(d,'[Content_Types].xml'),'<?xml version=\"1.0\"?><Types xmlns=\"http://schemas.openxmlformats.org/package/2006/content-types\"><Default Extension=\"rels\" ContentType=\"application/vnd.openxmlformats-package.relationships+xml\"/><Override PartName=\"/word/document.xml\" ContentType=\"application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml\"/></Types>');
fs.writeFileSync(path.join(d,'_rels','.rels'),'<?xml version=\"1.0\"?><Relationships xmlns=\"http://schemas.openxmlformats.org/package/2006/relationships\"><Relationship Id=\"rId1\" Type=\"http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument\" Target=\"word/document.xml\"/></Relationships>');
fs.writeFileSync(path.join(d,'word','document.xml'),'<?xml version=\"1.0\"?><w:document xmlns:w=\"http://schemas.openxmlformats.org/wordprocessingml/2006/main\"><w:body><w:p><w:r><w:t>Maria Silva</w:t></w:r></w:p><w:p><w:r><w:t>Tecnica de TI em Caxias do Sul</w:t></w:r></w:p></w:body></w:document>');
fs.mkdirSync('src/__fixtures__',{recursive:true});
execSync('powershell -NoProfile -Command \"Compress-Archive -Path \'' + d + '\\\\*\' -DestinationPath \'src\\\\__fixtures__\\\\curriculo.zip\' -Force\"');
fs.renameSync('src/__fixtures__/curriculo.zip','src/__fixtures__/curriculo.docx');
console.log('fixture criado');
"
```

Conferir que abriu: `node -e "require('mammoth').extractRawText({path:'src/__fixtures__/curriculo.docx'}).then(r=>console.log(JSON.stringify(r.value)))"`

Esperado: uma string contendo `Maria Silva`.

- [ ] **Step 2: Escrever os testes que falham**

Criar `src/docx.test.js`:

```js
import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import { extrairDocx } from './docx'

function fixture() {
  const buffer = fs.readFileSync('src/__fixtures__/curriculo.docx')
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  )
}

describe('extrairDocx', () => {
  test('devolve o texto do documento', async () => {
    const texto = await extrairDocx(fixture())
    expect(texto).toContain('Maria Silva')
    expect(texto).toContain('Caxias do Sul')
  })

  test('não devolve marcação XML', async () => {
    const texto = await extrairDocx(fixture())
    expect(texto).not.toContain('<w:')
  })

  test('arquivo corrompido lança com mensagem em português', async () => {
    const lixo = new TextEncoder().encode('isto não é um docx').buffer
    await expect(extrairDocx(lixo)).rejects.toThrow(/não foi possível ler/i)
  })

  test('documento sem texto lança em vez de devolver vazio', async () => {
    // Um .docx válido e vazio é indistinguível de uma falha silenciosa lá na
    // frente: melhor falhar aqui, onde dá para oferecer a textarea.
    const vazio = new TextEncoder().encode('').buffer
    await expect(extrairDocx(vazio)).rejects.toThrow()
  })
})
```

- [ ] **Step 3: Rodar e ver falhar**

Rodar: `npm test -- docx`
Esperado: FAIL — `Failed to resolve import "./docx"`.

- [ ] **Step 4: Escrever o `src/docx.js`**

```js
/**
 * `.docx` para texto, no navegador.
 *
 * Existe porque a Claude lê PDF nativamente mas não `.docx`, e porque `.docx` é
 * o formato mais comum de currículo. A saída entra no mesmo caminho do texto
 * colado na textarea — o `mammoth` não cria um fluxo novo, alimenta o que já
 * existe.
 *
 * `.doc` (Word binário, pré-2007) não passa por aqui: não há biblioteca de
 * navegador que o abra. Esse caso é da textarea.
 */
import mammoth from 'mammoth'

/** Aceita o `File` do input ou um `ArrayBuffer` já lido (o teste usa o segundo). */
export async function extrairDocx(arquivoOuBuffer) {
  const arrayBuffer =
    arquivoOuBuffer instanceof ArrayBuffer
      ? arquivoOuBuffer
      : await arquivoOuBuffer.arrayBuffer()

  let resultado
  try {
    resultado = await mammoth.extractRawText({ arrayBuffer })
  } catch (err) {
    throw new Error(
      `Não foi possível ler este .docx (${err.message}). Se ele estiver protegido por senha, abra no Word e cole o texto no campo abaixo.`,
    )
  }

  const texto = resultado.value.trim()
  // Um .docx que abre e não tem texto viraria um perfil oco lá na frente, longe
  // daqui, onde ninguém saberia o motivo. Falhar aqui deixa oferecer a textarea.
  if (!texto) {
    throw new Error(
      'Este .docx abriu mas não tem texto — se o currículo for uma imagem dentro do documento, exporte como PDF ou cole o texto no campo abaixo.',
    )
  }
  return texto
}
```

- [ ] **Step 5: Rodar e ver passar**

Rodar: `npm test -- docx`
Esperado: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add src/docx.js src/docx.test.js src/__fixtures__/curriculo.docx
git commit -m "Extração de .docx com mammoth"
```

---

## Task 5: `src/api/claude.js` — cliente e erros

**Files:**
- Create: `src/api/claude.js`
- Test: `src/api/claude.test.js`

**Interfaces:**
- Consumes: `lerCusto`, `excedeuTeto`, `registrarChamada`, `dolares` de `src/custo.js`.
- Produces:
  - `MODELO: 'claude-opus-5'`
  - `claude: Anthropic` (instância)
  - `class ErroClaude extends Error { tipo: 'config'|'teto'|'rede'|'api'|'recusa'|'vazio', status: number }`
  - `mensagemDoErro(err): string`
  - `conferirTeto(): void` — lança `ErroClaude` de tipo `teto` se estourou
  - `conferirResposta(resposta): void` — lança em `stop_reason: 'refusal'`
  - `contabilizar(tipo, resposta): void`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/api/claude.test.js`:

```js
import Anthropic from '@anthropic-ai/sdk'
import { beforeEach, describe, expect, test } from 'vitest'
import { definirTeto, lerCusto, registrarChamada } from '../custo'
import {
  ErroClaude,
  MODELO,
  conferirResposta,
  conferirTeto,
  contabilizar,
  mensagemDoErro,
} from './claude'

beforeEach(() => localStorage.clear())

describe('conferirTeto', () => {
  test('passa quando está abaixo', () => {
    expect(() => conferirTeto()).not.toThrow()
  })

  test('lança tipo "teto" quando estourou', () => {
    definirTeto(0.001)
    registrarChamada(
      'ranking',
      { input_tokens: 1_000_000, output_tokens: 0 },
      MODELO,
    )
    expect(() => conferirTeto()).toThrow(ErroClaude)
    try {
      conferirTeto()
    } catch (err) {
      expect(err.tipo).toBe('teto')
      expect(err.message).toMatch(/teto/i)
    }
  })
})

describe('conferirResposta', () => {
  test('passa numa resposta normal', () => {
    expect(() =>
      conferirResposta({ stop_reason: 'end_turn', content: [] }),
    ).not.toThrow()
  })

  test('lança tipo "recusa" em refusal', () => {
    try {
      conferirResposta({
        stop_reason: 'refusal',
        stop_details: { category: 'cyber', explanation: 'x' },
      })
      throw new Error('devia ter lançado')
    } catch (err) {
      expect(err.tipo).toBe('recusa')
    }
  })

  test('lança quando a saída foi cortada pelo max_tokens', () => {
    try {
      conferirResposta({ stop_reason: 'max_tokens', content: [] })
      throw new Error('devia ter lançado')
    } catch (err) {
      expect(err.tipo).toBe('vazio')
    }
  })
})

describe('contabilizar', () => {
  test('registra o uso no custo.js', () => {
    contabilizar('perfil', {
      usage: { input_tokens: 100, output_tokens: 50 },
    })
    const chamada = lerCusto().chamadas[0]
    expect(chamada).toMatchObject({ tipo: 'perfil', entrada: 100, saida: 50 })
    expect(chamada.modelo).toBe(MODELO)
  })

  test('resposta sem usage não derruba', () => {
    expect(() => contabilizar('perfil', {})).not.toThrow()
  })
})

describe('mensagemDoErro', () => {
  test('429 vira mensagem sobre limite', () => {
    const err = new Anthropic.RateLimitError(429, {}, 'rate limited', {})
    expect(mensagemDoErro(err)).toMatch(/limite/i)
  })

  test('ErroClaude devolve a própria mensagem', () => {
    const err = new ErroClaude('mensagem específica', { tipo: 'teto' })
    expect(mensagemDoErro(err)).toBe('mensagem específica')
  })

  test('erro desconhecido não devolve undefined', () => {
    expect(mensagemDoErro(new Error('qualquer coisa'))).toBeTruthy()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -- api/claude`
Esperado: FAIL — `Failed to resolve import "./claude"`.

- [ ] **Step 3: Escrever o `src/api/claude.js`**

```js
/**
 * Camada de rede da Avaliação IA.
 *
 * O browser só conhece `/api/claude/...`; quem sabe a chave é o proxy do dev
 * server (veja vite.config.js). Consequência: **isto só funciona em
 * `npm run dev`**, igual ao JSearch.
 *
 * Sobre o `dangerouslyAllowBrowser` abaixo: o flag existe para impedir que se
 * coloque uma chave de verdade num bundle, que é público. Aqui a chave **não
 * está no bundle** — a que vai daqui é falsa, e o proxy a sobrescreve com a
 * real antes de sair da máquina. Não "conserte" isto removendo o flag: o SDK
 * simplesmente para de funcionar no navegador.
 */
import Anthropic from '@anthropic-ai/sdk'
import { dolares, excedeuTeto, lerCusto, registrarChamada } from '../custo'

/** O modelo mora aqui e em nenhum outro lugar. */
export const MODELO = 'claude-opus-5'

export const claude = new Anthropic({
  baseURL: '/api/claude',
  apiKey: 'via-proxy', // falsa de propósito: veja o comentário do topo
  dangerouslyAllowBrowser: true,
})

export class ErroClaude extends Error {
  constructor(mensagem, { tipo = 'api', status = 0 } = {}) {
    super(mensagem)
    this.name = 'ErroClaude'
    this.tipo = tipo // 'config' | 'teto' | 'rede' | 'api' | 'recusa' | 'vazio'
    this.status = status
  }
}

/**
 * O JSearch tem teto imposto pelo provedor; a Claude não tem nenhum. Este é o
 * nosso, e ele bloqueia **antes** da chamada — depois já custou.
 */
export function conferirTeto() {
  const custo = lerCusto()
  if (excedeuTeto(custo)) {
    const gasto = dolares(custo.chamadas).toFixed(2)
    throw new ErroClaude(
      `Teto de custo atingido: US$ ${gasto} de US$ ${custo.teto.toFixed(2)} neste ciclo. Zere a contagem na aba Controle ou aumente o teto.`,
      { tipo: 'teto' },
    )
  }
}

/** Checa antes de ler `content` — uma recusa vem com HTTP 200. */
export function conferirResposta(resposta) {
  if (resposta.stop_reason === 'refusal') {
    throw new ErroClaude(
      'A Claude recusou esta requisição. Se o currículo tiver algo fora do comum, tente colar só o texto profissional.',
      { tipo: 'recusa' },
    )
  }
  if (resposta.stop_reason === 'max_tokens') {
    throw new ErroClaude(
      'A resposta foi cortada por tamanho. Se o currículo for muito longo, cole só a parte profissional.',
      { tipo: 'vazio' },
    )
  }
}

/** Toda chamada passa por aqui na volta, senão o medidor mente. */
export function contabilizar(tipo, resposta) {
  if (!resposta?.usage) return
  registrarChamada(tipo, resposta.usage, MODELO)
}

export function mensagemDoErro(err) {
  if (err instanceof ErroClaude) return err.message
  if (err instanceof Anthropic.RateLimitError) {
    return 'Limite de requisições da Claude atingido (429). Espere um instante e tente de novo.'
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return 'Chave da Claude não autorizada (401). Confira ANTHROPIC_API_KEY no .env e reinicie o npm run dev.'
  }
  if (err instanceof Anthropic.BadRequestError) {
    return `A Claude recusou os parâmetros (400): ${err.message}`
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return 'Não foi possível falar com o servidor de desenvolvimento. O npm run dev ainda está rodando?'
  }
  if (err instanceof Anthropic.APIError) {
    return `A Claude respondeu ${err.status}: ${err.message}`
  }
  return `Erro inesperado: ${err.message}`
}
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -- api/claude`
Esperado: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/api/claude.js src/api/claude.test.js
git commit -m "Cliente da Claude apontado ao proxy, com erros tipados e teto"
```

---

## Task 6: `src/api/perfil.js` — extração do currículo

**Files:**
- Create: `src/api/perfil.js`
- Test: `src/api/perfil.test.js`

**Interfaces:**
- Consumes: `claude`, `MODELO`, `ErroClaude`, `conferirTeto`, `conferirResposta`, `contabilizar` de `./claude`.
- Produces:
  - `PerfilSchema: ZodObject`
  - `conteudoDePdf(base64: string): Array` — blocos de conteúdo
  - `conteudoDeTexto(texto: string): Array`
  - `conferirPerfil(perfil): void` — lança se vier oco
  - `extrairPerfil({ base64?, texto? }): Promise<perfil>`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/api/perfil.test.js`:

```js
import { describe, expect, test } from 'vitest'
import {
  PerfilSchema,
  conferirPerfil,
  conteudoDePdf,
  conteudoDeTexto,
} from './perfil'

const PERFIL_BOM = {
  cargo_deduzido: 'Técnico de Suporte de TI',
  senioridade: 'junior',
  cidade: 'Caxias do Sul, RS',
  aceita_remoto: true,
  pretensao_min: null,
  tecnologias: [{ nome: 'Python', profundidade: 'producao', anos: 3 }],
  formacao: null,
  resumo: 'Suporte migrando para dev.',
  texto_extraido: 'texto completo do currículo',
}

describe('PerfilSchema', () => {
  test('aceita o perfil completo', () => {
    expect(PerfilSchema.parse(PERFIL_BOM)).toBeTruthy()
  })

  test('null é valor válido, não ausência', () => {
    const comNulos = {
      ...PERFIL_BOM,
      senioridade: null,
      cidade: null,
      aceita_remoto: null,
      pretensao_min: null,
      formacao: null,
    }
    expect(() => PerfilSchema.parse(comNulos)).not.toThrow()
  })

  test('campo faltando é erro — null tem que ser explícito', () => {
    const { pretensao_min, ...semCampo } = PERFIL_BOM
    expect(() => PerfilSchema.parse(semCampo)).toThrow()
  })

  test('profundidade fora dos três valores é rejeitada', () => {
    const ruim = {
      ...PERFIL_BOM,
      tecnologias: [{ nome: 'Python', profundidade: 'muita', anos: null }],
    }
    expect(() => PerfilSchema.parse(ruim)).toThrow()
  })

  test('senioridade fora do enum é rejeitada', () => {
    expect(() =>
      PerfilSchema.parse({ ...PERFIL_BOM, senioridade: 'chefe' }),
    ).toThrow()
  })
})

describe('conteudoDePdf', () => {
  test('o bloco document vem antes do texto', () => {
    const blocos = conteudoDePdf('QkFTRTY0')
    expect(blocos[0].type).toBe('document')
    expect(blocos[1].type).toBe('text')
  })

  test('monta o source de base64 com o media_type de PDF', () => {
    const [doc] = conteudoDePdf('QkFTRTY0')
    expect(doc.source).toEqual({
      type: 'base64',
      media_type: 'application/pdf',
      data: 'QkFTRTY0',
    })
  })

  test('pede a transcrição, que é a única fonte de texto do PDF', () => {
    const blocos = conteudoDePdf('QkFTRTY0')
    expect(blocos[1].text).toMatch(/texto_extraido/)
  })
})

describe('conteudoDeTexto', () => {
  test('manda só texto, sem bloco document', () => {
    const blocos = conteudoDeTexto('Maria Silva, técnica de TI')
    expect(blocos).toHaveLength(1)
    expect(blocos[0].type).toBe('text')
    expect(blocos[0].text).toContain('Maria Silva')
  })

  test('não pede transcrição: o texto já veio do navegador', () => {
    const blocos = conteudoDeTexto('Maria Silva')
    expect(blocos[0].text).not.toMatch(/texto_extraido/)
  })
})

describe('conferirPerfil', () => {
  test('passa num perfil com tecnologias', () => {
    expect(() => conferirPerfil(PERFIL_BOM)).not.toThrow()
  })

  test('lança quando não achou tecnologia nenhuma', () => {
    // Dez notas plausíveis contra um perfil vazio é pior que um erro na cara.
    expect(() => conferirPerfil({ ...PERFIL_BOM, tecnologias: [] })).toThrow(
      /não consegui ler/i,
    )
  })

  test('lança quando o perfil é nulo', () => {
    expect(() => conferirPerfil(null)).toThrow()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -- api/perfil`
Esperado: FAIL — `Failed to resolve import "./perfil"`.

- [ ] **Step 3: Escrever o `src/api/perfil.js`**

```js
/**
 * Currículo → perfil estruturado. Uma chamada, no upload.
 *
 * Por que estruturar em vez de guardar o texto cru: o perfil tem ~500 tokens
 * contra ~3.000 do texto, e ele viaja em **toda** busca. Mas o ganho maior não
 * é preço — é que `pretensao_min: null` é um fato que o modelo pode usar, e o
 * silêncio de um texto corrido não é. A instrução de ranking tem cláusulas
 * sobre pretensão e cidade; sem campo explícito elas pontuam contra nada.
 *
 * A dedução do cargo sai daqui junto, sem chamada extra — é o que a aba Vaga
 * Inteligente precisa saber antes de buscar.
 */
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import {
  ErroClaude,
  MODELO,
  claude,
  conferirResposta,
  conferirTeto,
  contabilizar,
} from './claude'

/**
 * `.nullable()` em quase tudo é a decisão central deste módulo: null significa
 * "o currículo não diz", e é diferente de um chute plausível. Campo obrigatório
 * e nulável, nunca opcional — assim a ausência é uma afirmação, não um silêncio.
 */
export const PerfilSchema = z.object({
  cargo_deduzido: z.string().nullable(),
  senioridade: z
    .enum(['junior', 'pleno', 'senior', 'especialista'])
    .nullable(),
  cidade: z.string().nullable(),
  aceita_remoto: z.boolean().nullable(),
  // Em R$ mil, igual ao min/max do mapear.js (4.5 = R$ 4.500). Unidade
  // diferente entre os dois lados vira lixo silencioso.
  pretensao_min: z.number().nullable(),
  tecnologias: z.array(
    z.object({
      nome: z.string(),
      // "operou em produção" é o que a instrução pede e o que um currículo
      // revela; anos por tecnologia quase nunca está escrito.
      profundidade: z.enum(['producao', 'projeto', 'contato']),
      anos: z.number().nullable(),
    }),
  ),
  formacao: z.string().nullable(),
  resumo: z.string().nullable(),
  texto_extraido: z.string().nullable(),
})

const REGRA_NULO =
  'Preencha com null todo campo que o currículo não disser. Não invente e não deduza por plausibilidade: null é uma resposta melhor que um chute, porque quem lê depois sabe a diferença. pretensao_min vai em R$ mil (4500 vira 4.5).'

export function conteudoDePdf(base64) {
  return [
    {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64 },
    },
    {
      type: 'text',
      text: `Extraia o perfil profissional deste currículo. ${REGRA_NULO}\n\nEm texto_extraido, transcreva o documento inteiro literalmente — é a única fonte de texto que existe para um PDF, porque o navegador não o abriu.`,
    },
  ]
}

export function conteudoDeTexto(texto) {
  return [
    {
      type: 'text',
      // texto_extraido fica null: o texto já está guardado do lado de cá, e
      // pedir a transcrição custaria ~3.000 tokens de saída à toa.
      text: `Extraia o perfil profissional deste currículo. ${REGRA_NULO}\n\nDeixe texto_extraido como null.\n\nCurrículo:\n\n${texto}`,
    },
  ]
}

/**
 * Um perfil sem tecnologia nenhuma não dá para ranquear: as dez notas sairiam
 * plausíveis e sem fundamento. Melhor falhar aqui, onde a tela pode oferecer a
 * textarea, do que produzir um ranking inventado.
 */
export function conferirPerfil(perfil) {
  if (!perfil) {
    throw new ErroClaude('A extração não devolveu perfil nenhum.', {
      tipo: 'vazio',
    })
  }
  if (!Array.isArray(perfil.tecnologias) || perfil.tecnologias.length === 0) {
    throw new ErroClaude(
      'Não consegui ler tecnologia nenhuma neste currículo. Se ele for um PDF escaneado de baixa qualidade, cole o texto no campo abaixo.',
      { tipo: 'vazio' },
    )
  }
}

export async function extrairPerfil({ base64, texto }) {
  conferirTeto()

  // `parse` em vez de `create`: valida a saída contra o schema e devolve em
  // `parsed_output` já pronta, em vez de um bloco de texto para desserializar.
  const resposta = await claude.messages.parse({
    model: MODELO,
    max_tokens: 8000, // folga para o texto_extraido do PDF
    output_config: { format: zodOutputFormat(PerfilSchema) },
    messages: [
      {
        role: 'user',
        content: base64 ? conteudoDePdf(base64) : conteudoDeTexto(texto),
      },
    ],
  })

  contabilizar('perfil', resposta)
  conferirResposta(resposta)

  // `parsed_output` vem null quando a validação falha — não confiar sem checar.
  conferirPerfil(resposta.parsed_output)
  return resposta.parsed_output
}
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -- api/perfil`
Esperado: 13 passed.

- [ ] **Step 5: Commit**

```bash
git add src/api/perfil.js src/api/perfil.test.js
git commit -m "Extração do perfil estruturado a partir de PDF ou texto"
```

---

## Task 7: `src/api/ranking.js` — o lote e a validação

Esta é a tarefa que mais tem teste, porque é onde as falhas são silenciosas: um id que não voltou não grita, ele só produz uma vaga sem nota que ninguém percebe.

**Files:**
- Create: `src/api/ranking.js`
- Test: `src/api/ranking.test.js`
- Modify: `src/data/vagas.js:42-43` (a `INSTRUCAO_PADRAO`)

**Interfaces:**
- Consumes: `claude`, `MODELO`, `conferirTeto`, `conferirResposta`, `contabilizar` de `./claude`.
- Produces:
  - `TAMANHO_LOTE: 12`
  - `NotasSchema: ZodObject`
  - `resumirVaga(vaga): object`
  - `validarNotas(notas, idsEnviados): { validas: Map<string, {nota, motivo}>, faltando: string[] }`
  - `aplicarNotas(vagas, validas): vaga[]`
  - `ranquear(perfil, instrucao, vagas): Promise<vaga[]>`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/api/ranking.test.js`:

```js
import { describe, expect, test } from 'vitest'
import {
  NotasSchema,
  aplicarNotas,
  resumirVaga,
  validarNotas,
} from './ranking'

const VAGA = {
  id: 'a1',
  cargo: 'Técnico de TI',
  empresa: 'Acme',
  cidade: 'Caxias do Sul, RS',
  modalidade: 'Presencial',
  min: 3.5,
  max: 4.5,
  days: 7,
  descricao: 'Suporte a usuários, redes, Windows Server.',
  rank: null,
  status: 'Ativa',
}

describe('resumirVaga', () => {
  test('leva só o que a nota precisa', () => {
    const r = resumirVaga(VAGA)
    expect(r).toEqual({
      id: 'a1',
      cargo: 'Técnico de TI',
      empresa: 'Acme',
      cidade: 'Caxias do Sul, RS',
      modalidade: 'Presencial',
      salario_min: 3.5,
      salario_max: 4.5,
      dias_desde_publicacao: 7,
      descricao: 'Suporte a usuários, redes, Windows Server.',
    })
  })

  test('não manda campos de tela', () => {
    const r = resumirVaga(VAGA)
    expect(r).not.toHaveProperty('rank')
    expect(r).not.toHaveProperty('status')
    expect(r).not.toHaveProperty('fav')
  })
})

describe('validarNotas', () => {
  const ids = ['a1', 'a2', 'a3']

  test('caso feliz: todas voltam', () => {
    const { validas, faltando } = validarNotas(
      [
        { id: 'a1', nota: 80, motivo: 'x' },
        { id: 'a2', nota: 60, motivo: 'y' },
        { id: 'a3', nota: 40, motivo: 'z' },
      ],
      ids,
    )
    expect(faltando).toEqual([])
    expect(validas.get('a1').nota).toBe(80)
  })

  test('id inventado é descartado', () => {
    const { validas, faltando } = validarNotas(
      [
        { id: 'a1', nota: 80, motivo: 'x' },
        { id: 'INVENTADO', nota: 99, motivo: 'y' },
      ],
      ids,
    )
    expect(validas.has('INVENTADO')).toBe(false)
    expect(faltando).toEqual(['a2', 'a3'])
  })

  test('duplicata: a primeira vence', () => {
    const { validas } = validarNotas(
      [
        { id: 'a1', nota: 80, motivo: 'primeira' },
        { id: 'a1', nota: 10, motivo: 'segunda' },
      ],
      ids,
    )
    expect(validas.get('a1').motivo).toBe('primeira')
  })

  test('resposta vazia deixa todas faltando', () => {
    const { validas, faltando } = validarNotas([], ids)
    expect(validas.size).toBe(0)
    expect(faltando).toEqual(ids)
  })

  test('resposta não-array não derruba', () => {
    const { faltando } = validarNotas(null, ids)
    expect(faltando).toEqual(ids)
  })

  test('nota fora de 0-100 é descartada', () => {
    const { validas, faltando } = validarNotas(
      [
        { id: 'a1', nota: 150, motivo: 'x' },
        { id: 'a2', nota: -5, motivo: 'y' },
        { id: 'a3', nota: 70, motivo: 'z' },
      ],
      ids,
    )
    expect(validas.size).toBe(1)
    expect(faltando.sort()).toEqual(['a1', 'a2'])
  })

  test('nota não-numérica é descartada', () => {
    const { faltando } = validarNotas([{ id: 'a1', nota: 'oitenta' }], ids)
    expect(faltando).toContain('a1')
  })
})

describe('aplicarNotas', () => {
  test('preenche rank e motivo', () => {
    const validas = new Map([['a1', { nota: 87, motivo: 'Domina o stack' }]])
    const [vaga] = aplicarNotas([VAGA], validas)
    expect(vaga.rank).toBe(87)
    expect(vaga.rankMotivo).toBe('Domina o stack')
  })

  test('vaga sem nota fica com rank null — a tela mostra "—"', () => {
    const [vaga] = aplicarNotas([VAGA], new Map())
    expect(vaga.rank).toBe(null)
  })

  test('não muda os outros campos', () => {
    const [vaga] = aplicarNotas([VAGA], new Map())
    expect(vaga.cargo).toBe('Técnico de TI')
    expect(vaga.status).toBe('Ativa')
  })
})

describe('NotasSchema', () => {
  test('aceita a forma esperada', () => {
    expect(() =>
      NotasSchema.parse({ notas: [{ id: 'a1', nota: 80, motivo: 'x' }] }),
    ).not.toThrow()
  })

  test('nota fora de 0-100 é rejeitada no schema', () => {
    expect(() =>
      NotasSchema.parse({ notas: [{ id: 'a1', nota: 150, motivo: 'x' }] }),
    ).toThrow()
  })

  test('nota fracionária é rejeitada', () => {
    expect(() =>
      NotasSchema.parse({ notas: [{ id: 'a1', nota: 80.5, motivo: 'x' }] }),
    ).toThrow()
  })

  test('item sem motivo é rejeitado', () => {
    expect(() => NotasSchema.parse({ notas: [{ id: 'a1', nota: 80 }] })).toThrow()
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -- api/ranking`
Esperado: FAIL — `Failed to resolve import "./ranking"`.

- [ ] **Step 3: Escrever o `src/api/ranking.js`**

```js
/**
 * Perfil + N vagas → N notas, numa chamada só.
 *
 * Por que em lote: o currículo viaja uma vez em vez de N, e a saída — que custa
 * 5× a entrada — encolhe para `{id, nota, motivo}`. Dá ~3,5× mais barato que
 * uma chamada por vaga. Lote de 10 a 15; com 50 a qualidade cai.
 *
 * A nota é **relativa ao conjunto** desta busca: o modelo calibra dentro do que
 * vê, e as mesmas vagas contra outras dez dariam números diferentes. Serve para
 * ranquear, não é porcentagem de compatibilidade — por isso a tela escreve
 * "Rank IA 87" e não "87%".
 *
 * Validar a volta não é zelo: um id que não voltou não grita, vira uma vaga sem
 * nota que ninguém percebe.
 */
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import {
  MODELO,
  claude,
  conferirResposta,
  conferirTeto,
  contabilizar,
} from './claude'

export const TAMANHO_LOTE = 12

export const NotasSchema = z.object({
  notas: z.array(
    z.object({
      id: z.string(),
      nota: z.number().int().min(0).max(100),
      motivo: z.string().max(90),
    }),
  ),
})

/** Só o que a nota precisa. Campos de tela (fav, seen, status) não vão. */
export function resumirVaga(vaga) {
  return {
    id: vaga.id,
    cargo: vaga.cargo,
    empresa: vaga.empresa,
    cidade: vaga.cidade,
    modalidade: vaga.modalidade,
    salario_min: vaga.min,
    salario_max: vaga.max,
    dias_desde_publicacao: vaga.days,
    descricao: vaga.descricao,
  }
}

/**
 * Três conferências: id existe no conjunto enviado, nota é número de 0 a 100,
 * e duplicata não sobrescreve. O que não passar entra em `faltando` e vai numa
 * segunda chamada.
 */
export function validarNotas(notas, idsEnviados) {
  const permitidos = new Set(idsEnviados)
  const validas = new Map()

  for (const item of Array.isArray(notas) ? notas : []) {
    if (!permitidos.has(item?.id)) continue
    if (validas.has(item.id)) continue // a primeira vence
    const nota = Number(item.nota)
    if (!Number.isFinite(nota) || nota < 0 || nota > 100) continue
    validas.set(item.id, { nota: Math.round(nota), motivo: item.motivo ?? '' })
  }

  return {
    validas,
    faltando: idsEnviados.filter((id) => !validas.has(id)),
  }
}

/** Vaga sem nota fica com `rank: null`; a tabela já sabe mostrar "—". */
export function aplicarNotas(vagas, validas) {
  return vagas.map((vaga) => {
    const achado = validas.get(vaga.id)
    return achado
      ? { ...vaga, rank: achado.nota, rankMotivo: achado.motivo }
      : { ...vaga, rank: null, rankMotivo: null }
  })
}

async function pontuarLote(perfil, instrucao, vagas) {
  const resposta = await claude.messages.parse({
    model: MODELO,
    max_tokens: 2000,
    system: `${instrucao}\n\nCampos com null significam que o currículo não informa aquilo. Nesse caso ignore a cláusula correspondente em vez de supor um valor — uma pretensão salarial ausente não é uma pretensão baixa.\n\nDevolva uma nota para CADA vaga recebida, usando o id exatamente como veio. O motivo tem no máximo 10 palavras.`,
    output_config: { format: zodOutputFormat(NotasSchema) },
    messages: [
      {
        role: 'user',
        content: `Perfil do candidato:\n${JSON.stringify(perfil, null, 2)}\n\nVagas:\n${JSON.stringify(vagas.map(resumirVaga), null, 2)}`,
      },
    ],
  })

  contabilizar('ranking', resposta)
  conferirResposta(resposta)

  // O schema garante a forma de cada item; ele NÃO garante que os ids sejam os
  // que enviamos, nem que todos voltaram. Essa parte é a `validarNotas`.
  return validarNotas(resposta.parsed_output?.notas, vagas.map((v) => v.id))
}

/**
 * Uma chamada, mais uma segunda só com o que faltar. O que sobrar depois disso
 * fica sem nota e a lista aparece do mesmo jeito — tela em branco por causa de
 * um item faltando seria pior que ranking parcial.
 */
export async function ranquear(perfil, instrucao, vagas) {
  conferirTeto()

  const primeira = await pontuarLote(perfil, instrucao, vagas.slice(0, TAMANHO_LOTE))
  let validas = primeira.validas

  if (primeira.faltando.length) {
    console.warn('[claude] sem nota na primeira volta:', primeira.faltando)
    const restantes = vagas.filter((v) => primeira.faltando.includes(v.id))
    const segunda = await pontuarLote(perfil, instrucao, restantes)
    validas = new Map([...validas, ...segunda.validas])
    if (segunda.faltando.length) {
      console.warn('[claude] seguem sem nota:', segunda.faltando)
    }
  }

  return aplicarNotas(vagas, validas)
}
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -- api/ranking`
Esperado: 16 passed.

- [ ] **Step 5: Ajustar a `INSTRUCAO_PADRAO`**

Em `src/data/vagas.js`, a instrução manda pesar a pretensão salarial e a cidade do candidato. Agora esses campos existem e podem vir `null`. Acrescentar ao final da string, antes do fecho das aspas:

```
\n\nQuando um campo do perfil vier null, o currículo não informa aquilo: ignore a cláusula correspondente em vez de supor. Pretensão ausente não é pretensão baixa, e cidade ausente não é candidato disposto a mudar.
```

- [ ] **Step 6: Commit**

```bash
git add src/api/ranking.js src/api/ranking.test.js src/data/vagas.js
git commit -m "Ranking em lote, com validação de id e segunda volta para o que faltar"
```

---

## Task 8: `src/api/justificativa.js` — prosa sob demanda

**Files:**
- Create: `src/api/justificativa.js`
- Test: `src/api/justificativa.test.js`

**Interfaces:**
- Consumes: `claude`, `MODELO`, `conferirTeto`, `conferirResposta`, `contabilizar` de `./claude`; `resumirVaga` de `./ranking`.
- Produces: `montarPrompt(perfil, texto, vaga): string`; `justificar(perfil, texto, instrucao, vaga): Promise<string>`

- [ ] **Step 1: Escrever os testes que falham**

Criar `src/api/justificativa.test.js`:

```js
import { describe, expect, test } from 'vitest'
import { montarPrompt } from './justificativa'

const PERFIL = { cargo_deduzido: 'Técnico de TI', tecnologias: [] }
const VAGA = {
  id: 'a1',
  cargo: 'Analista de Suporte',
  empresa: 'Acme',
  cidade: 'Caxias do Sul, RS',
  modalidade: 'Presencial',
  min: null,
  max: null,
  days: 3,
  descricao: 'Atendimento nível 2.',
}

describe('montarPrompt', () => {
  test('leva o texto cru do currículo, não só o perfil', () => {
    const p = montarPrompt(PERFIL, 'TEXTO CRU DO CURRICULO', VAGA)
    expect(p).toContain('TEXTO CRU DO CURRICULO')
  })

  test('leva a vaga', () => {
    expect(montarPrompt(PERFIL, 'x', VAGA)).toContain('Analista de Suporte')
  })

  test('funciona sem texto cru — currículo antigo pode não ter', () => {
    expect(() => montarPrompt(PERFIL, '', VAGA)).not.toThrow()
    expect(montarPrompt(PERFIL, '', VAGA)).toContain('Analista de Suporte')
  })
})
```

- [ ] **Step 2: Rodar e ver falhar**

Rodar: `npm test -- justificativa`
Esperado: FAIL — `Failed to resolve import "./justificativa"`.

- [ ] **Step 3: Escrever o `src/api/justificativa.js`**

```js
/**
 * A justificativa detalhada de UMA vaga, quando o usuário a abre.
 *
 * É a única das três chamadas que recebe o **texto cru** do currículo — é para
 * isso que ele fica guardado. No ranking o perfil basta, e é justamente o que
 * torna o lote barato.
 *
 * Não persiste: reabrir a vaga refaz a chamada, ~US$ 0,02. Guardar exigiria
 * mais um cache para invalidar quando o perfil mudasse.
 */
import {
  MODELO,
  claude,
  conferirResposta,
  conferirTeto,
  contabilizar,
} from './claude'
import { resumirVaga } from './ranking'

export function montarPrompt(perfil, texto, vaga) {
  const curriculo = texto
    ? `\n\nCurrículo completo:\n${texto}`
    : '\n\n(O texto completo do currículo não está disponível — use só o perfil.)'

  return `Perfil do candidato:\n${JSON.stringify(perfil, null, 2)}${curriculo}\n\nVaga:\n${JSON.stringify(resumirVaga(vaga), null, 2)}`
}

export async function justificar(perfil, texto, instrucao, vaga) {
  conferirTeto()

  const resposta = await claude.messages.create({
    model: MODELO,
    max_tokens: 2000,
    system: `${instrucao}\n\nExplique em dois ou três parágrafos curtos por que esta vaga combina ou não com este candidato. Seja concreto: cite as tecnologias que casam e as que faltam. Não invente requisito que não está no anúncio nem experiência que não está no currículo. Campo null no perfil significa que o currículo não informa — diga isso em vez de supor.`,
    messages: [{ role: 'user', content: montarPrompt(perfil, texto, vaga) }],
  })

  contabilizar('justificativa', resposta)
  conferirResposta(resposta)

  return resposta.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n\n')
}
```

- [ ] **Step 4: Rodar e ver passar**

Rodar: `npm test -- justificativa`
Esperado: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add src/api/justificativa.js src/api/justificativa.test.js
git commit -m "Justificativa detalhada sob demanda, com o texto cru do currículo"
```

---

## Task 9: `PainelIA` — upload, textarea e tela de conferência

**Files:**
- Create: `src/paineis/PainelIA.jsx`
- Modify: `src/App.jsx:1860-2137` (recortar o `PainelIA`), `:3179-3180`, `:3366-3376` (o `registrarCv`), `:3560-3595` (a fiação)
- Test: verificação manual — é componente de tela

**Interfaces:**
- Consumes: `extrairPerfil` de `../api/perfil`; `extrairDocx` de `../docx`; `lerCurriculo`, `gravarCurriculo`, `corrigirPerfil`, `limparCorrecoes`, `removerCurriculo`, `definirInstrucao`, `perfilEfetivo` de `../curriculo`; `mensagemDoErro` de `../api/claude`.
- Produces: `<PainelIA cv instrucao onCv onInstrucao onRestaurar />` — o `App` continua dono do estado; o painel só chama de volta.

- [ ] **Step 1: Recortar o componente para o arquivo novo**

Mover o bloco `function PainelIA({...}) { ... }` de `src/App.jsx` (linhas 1860 a 2137) para `src/paineis/PainelIA.jsx`, acrescentando no topo:

```jsx
import { useState } from 'react'
```

e no fim `export default PainelIA` (trocando `function PainelIA` por `export default function PainelIA`). No `App.jsx`, acrescentar aos imports:

```jsx
import PainelIA from './paineis/PainelIA'
```

Rodar `npm run dev` e conferir que a aba Avaliação IA abre igual a antes. **Commitar só este recorte**, antes de mudar comportamento:

```bash
git add src/App.jsx src/paineis/PainelIA.jsx
git commit -m "Move o PainelIA para arquivo próprio, sem mudança de comportamento"
```

- [ ] **Step 2: Trocar o `accept` e acrescentar a textarea**

Nos dois inputs de arquivo do `PainelIA.jsx` (eram `App.jsx:1934` e `:2024`), trocar:

```jsx
accept=".pdf,.doc,.docx"
```

por:

```jsx
accept=".pdf,.docx"
```

Abaixo do dropzone, acrescentar:

```jsx
<div style={{ marginTop: 14 }}>
  <div style={{ fontSize: 12.5, color: '#7C8699', marginBottom: 6 }}>
    Ou cole o texto do seu currículo — serve para .doc, .odt, LinkedIn ou
    qualquer formato que não seja PDF nem .docx.
  </div>
  <textarea
    value={colado}
    onChange={(e) => setColado(e.target.value)}
    placeholder="Cole aqui..."
    rows={6}
    style={{ width: '100%', resize: 'vertical' }}
  />
  <button disabled={!colado.trim() || lendo} onClick={() => enviarTexto(colado)}>
    {lendo ? 'Lendo...' : 'Usar este texto'}
  </button>
</div>
```

- [ ] **Step 3: Ligar a extração**

Dentro do `PainelIA`, acrescentar:

```jsx
const [colado, setColado] = useState('')
const [lendo, setLendo] = useState(false)
const [erro, setErro] = useState(null)

/** O File vira base64 sem quebras de linha, que é o que a API exige. */
function paraBase64(arquivo) {
  return new Promise((ok, falha) => {
    const leitor = new FileReader()
    leitor.onload = () => ok(String(leitor.result).split(',')[1])
    leitor.onerror = () => falha(new Error('Não foi possível ler o arquivo.'))
    leitor.readAsDataURL(arquivo)
  })
}

async function enviarArquivo(arquivo) {
  setLendo(true)
  setErro(null)
  try {
    const ehPdf = arquivo.name.toLowerCase().endsWith('.pdf')
    // .docx vira texto aqui e segue o mesmo caminho do texto colado.
    const entrada = ehPdf
      ? { base64: await paraBase64(arquivo) }
      : { texto: await extrairDocx(arquivo) }

    const perfil = await extrairPerfil(entrada)
    const kb = arquivo.size / 1024
    onCv(
      gravarCurriculo({
        arquivo: {
          nome: arquivo.name,
          tamanho: kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(kb))} KB`,
          quando: new Date().toISOString(),
        },
        // Para PDF o texto só existe porque a Claude transcreveu.
        texto: ehPdf ? (perfil.texto_extraido ?? '') : entrada.texto,
        perfil,
      }),
    )
  } catch (err) {
    setErro(mensagemDoErro(err))
  } finally {
    setLendo(false)
  }
}

async function enviarTexto(texto) {
  setLendo(true)
  setErro(null)
  try {
    const perfil = await extrairPerfil({ texto })
    onCv(
      gravarCurriculo({
        arquivo: { nome: 'texto colado', tamanho: `${Math.max(1, Math.round(texto.length / 1024))} KB`, quando: new Date().toISOString() },
        texto,
        perfil,
      }),
    )
    setColado('')
  } catch (err) {
    setErro(mensagemDoErro(err))
  } finally {
    setLendo(false)
  }
}
```

Trocar os dois `onArquivo`/`registrarCv` existentes por `enviarArquivo`, e mostrar `erro` acima do dropzone quando não for nulo.

- [ ] **Step 4: A tela de conferência**

Quando `cv?.perfil` existir, no lugar do dropzone:

```jsx
<div>
  <div style={{ fontSize: 13, color: '#7C8699', marginBottom: 10 }}>
    Isto é o que a IA entendeu do seu currículo. Corrija o que estiver errado —
    é contra isto que as vagas são comparadas.
  </div>

  <Campo rotulo="Cargo" valor={efetivo.cargo_deduzido}
    onMudar={(v) => onCv(corrigirPerfil('cargo_deduzido', v))} />
  <Campo rotulo="Senioridade" valor={efetivo.senioridade}
    onMudar={(v) => onCv(corrigirPerfil('senioridade', v))} />
  <Campo rotulo="Cidade" valor={efetivo.cidade}
    onMudar={(v) => onCv(corrigirPerfil('cidade', v))} />
  <Campo rotulo="Pretensão (R$ mil)" valor={efetivo.pretensao_min}
    vazio="não informada — preencha para as vagas serem pesadas por salário"
    onMudar={(v) => onCv(corrigirPerfil('pretensao_min', v === '' ? null : Number(v)))} />

  <div style={{ marginTop: 12, fontSize: 13 }}>
    <strong>Tecnologias:</strong>{' '}
    {efetivo.tecnologias.map((t) => `${t.nome} (${t.profundidade})`).join(', ')}
  </div>

  <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
    <button onClick={() => onCv(limparCorrecoes())}>
      Voltar ao que a IA entendeu
    </button>
    <button onClick={() => { removerCurriculo(); onCv(null) }}>
      Remover currículo
    </button>
  </div>

  <div style={{ marginTop: 12, fontSize: 12, color: '#7C8699' }}>
    Seu currículo fica guardado só neste navegador, nesta máquina. Ele sai daqui
    apenas na hora de comparar com as vagas.
  </div>
</div>
```

Com `const efetivo = perfilEfetivo(cv)` no topo e um componente `Campo` simples (rótulo + input controlado) no mesmo arquivo.

- [ ] **Step 5: Persistir a instrução**

Em `App.jsx`, trocar:

```jsx
const [instrucao, setInstrucao] = useState(INSTRUCAO_PADRAO)
```

por:

```jsx
const [instrucao, setInstrucao] = useState(
  () => lerCurriculo()?.instrucao ?? INSTRUCAO_PADRAO,
)
```

e nos dois handlers, gravar junto:

```jsx
onInstrucao={(e) => { setInstrucao(e.target.value); definirInstrucao(e.target.value) }}
onRestaurar={() => { setInstrucao(INSTRUCAO_PADRAO); definirInstrucao(INSTRUCAO_PADRAO) }}
```

E trocar `const [cv, setCv] = useState(null)` por `useState(() => lerCurriculo())`.

- [ ] **Step 6: Verificar à mão**

Com `npm run dev`:

1. Subir um PDF de currículo → a tela de conferência aparece com tecnologias preenchidas.
2. F5 → o currículo continua lá.
3. Corrigir a pretensão → F5 → a correção continua.
4. "Voltar ao que a IA entendeu" → a correção some, o resto fica.
5. "Remover currículo" → F5 → o dropzone volta.
6. Colar texto na textarea → mesmo resultado do arquivo.
7. Subir um `.docx` → mesmo resultado.
8. Aba Controle → o gasto da Claude aparece (só depois da Task 11; por ora confira no `localStorage.getItem('vagas:custo')`).

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/paineis/PainelIA.jsx
git commit -m "Extração real do currículo, com tela de conferência e textarea"
```

---

## Task 10: `PainelVagaInteligente` e o ranking na aba Vagas

**Files:**
- Create: `src/paineis/PainelVagaInteligente.jsx`
- Modify: `src/App.jsx:2530-2913` (recortar), `:3276-3306` (o `buscar`), `:3321-3329` (o `buscarInteligente`), `:2323-2528` (`PaginaVaga`, para a justificativa)

**Interfaces:**
- Consumes: `ranquear` de `../api/ranking`; `justificar` de `../api/justificativa`; `perfilEfetivo` de `../curriculo`.
- Produces: `<PainelVagaInteligente cv cidade ... />`.

- [ ] **Step 1: Recortar o componente**

Mover `function PainelVagaInteligente({...})` para `src/paineis/PainelVagaInteligente.jsx`, `export default`, importar no `App.jsx`. Rodar `npm run dev`, conferir que a aba abre igual, commitar o recorte sozinho:

```bash
git add src/App.jsx src/paineis/PainelVagaInteligente.jsx
git commit -m "Move o PainelVagaInteligente para arquivo próprio, sem mudança de comportamento"
```

- [ ] **Step 2: Ranquear depois da busca da aba Vagas**

Em `App.jsx`, no `buscar()`, depois de `setBanco(vagas)` e do `registrarUso(..., 'rede', vagas)`:

```jsx
      setConsultaFeita(true)

      // O ranking é enriquecimento, não pré-requisito: sem currículo a lista
      // aparece do mesmo jeito, com "—" na coluna Rank IA.
      const efetivo = perfilEfetivo(cv)
      if (efetivo && vagas.length) {
        setRanqueando(true)
        try {
          setBanco(await ranquear(efetivo, instrucao, vagas))
        } catch (err) {
          setErroRanking(mensagemDoErro(err))
        } finally {
          setRanqueando(false)
        }
      }
```

com `const [ranqueando, setRanqueando] = useState(false)` e `const [erroRanking, setErroRanking] = useState(null)` ao lado dos outros estados. O erro do ranking é mostrado como aviso acima da tabela — as vagas continuam na tela.

- [ ] **Step 3: O fluxo real da Vaga Inteligente**

Trocar o `buscarInteligente()` inteiro por:

```jsx
  /**
   * Cargo do perfil → JSearch → ranking. Uma requisição JSearch e uma Claude.
   * O cargo não é digitado: sai do currículo, que é a razão desta aba existir.
   */
  async function buscarInteligente() {
    if (buscandoIa) return
    const efetivo = perfilEfetivo(cv)
    if (!efetivo?.cargo_deduzido) {
      setErroIa('Envie um currículo primeiro — é dele que sai o cargo.')
      return
    }

    setBuscandoIa(true)
    setErroIa(null)
    try {
      const termo = efetivo.cargo_deduzido
      const guardado = consultarCache(termo, cidadeIa)
      let vagas
      if (guardado) {
        vagas = guardado.vagas
        setCota(registrarUso(termo, cidadeIa, 'cache'))
      } else {
        const resposta = await buscarVagas(montarConsulta(termo, cidadeIa))
        vagas = mapearVagas(vagasDaResposta(resposta))
        setCota(registrarUso(termo, cidadeIa, 'rede', vagas))
      }
      setVagasIa(vagas.length ? await ranquear(efetivo, instrucao, vagas) : [])
      setBuscaIaFeita(true)
    } catch (err) {
      setErroIa(err instanceof ErroJSearch ? err.message : mensagemDoErro(err))
    } finally {
      setBuscandoIa(false)
    }
  }
```

> **O registro falso de cota some aqui.** A linha `setCota(registrarUso('Vaga Inteligente', cidadeIa, 'rede'))` contava uma requisição que nunca acontecia. Agora a requisição é real e é registrada com o termo verdadeiro. Contar nos dois lugares contaria dobrado.

- [ ] **Step 4: A justificativa na página de detalhe**

Em `PaginaVaga`, acrescentar um botão "Por que esta nota?" que aparece só quando `vaga.rank !== null`:

```jsx
const [texto, setTexto] = useState(null)
const [carregando, setCarregando] = useState(false)

async function pedirJustificativa() {
  setCarregando(true)
  try {
    setTexto(await justificar(perfilEfetivo(cv), cv.texto, instrucao, vaga))
  } catch (err) {
    setTexto(mensagemDoErro(err))
  } finally {
    setCarregando(false)
  }
}
```

- [ ] **Step 5: Verificar à mão**

Com `npm run dev` e um currículo já enviado:

1. Aba Vagas, buscar algo novo → as vagas aparecem, depois as notas preenchem.
2. Ordenar por Rank IA → a ordem muda.
3. Abrir uma vaga → "Por que esta nota?" → parágrafos coerentes com o currículo.
4. Remover o currículo, buscar de novo → a lista aparece com "—" no Rank IA, sem erro.
5. Aba Vaga Inteligente → escolher cidade → buscar → vagas ranqueadas, e a aba Controle mostra **uma** requisição JSearch, não duas.
6. Confirmar no console: `[jsearch] ->` e `[claude] ->` aparecem uma vez cada.

- [ ] **Step 6: Commit**

```bash
git add src/App.jsx src/paineis/PainelVagaInteligente.jsx
git commit -m "Ranking real nas duas abas e justificativa na página de detalhe"
```

---

## Task 11: `PainelControle` — o gasto da Claude

**Files:**
- Modify: `src/App.jsx:2921-3128` (o `PainelControle`), `:3606-3613` (a fiação)

**Interfaces:**
- Consumes: `lerCusto`, `dolares`, `zerarCusto`, `definirTeto`, `LIMITE_PADRAO_USD` de `./custo`.
- Produces: nada para tarefas seguintes.

- [ ] **Step 1: Acrescentar o cartão de custo**

No `PainelControle`, abaixo do cartão das 200 requisições:

```jsx
<div style={{ /* mesmo estilo dos outros cartões */ }}>
  <div>
    <strong style={{ fontSize: 26 }}>US$ {gasto.toFixed(2)}</strong>
    <span> de US$ {custo.teto.toFixed(2)} neste ciclo</span>
    <button onClick={onZerarCusto}>Zerar</button>
  </div>
  <div style={{ fontSize: 12.5, color: '#7C8699', marginTop: 8 }}>
    A Claude é cobrada por token, não por requisição — e, diferente do JSearch,
    não tem teto do lado de lá. Este teto é local: ao atingi-lo, as chamadas
    param até você zerar ou aumentar.
  </div>
  <div style={{ marginTop: 10, fontSize: 13 }}>
    {['perfil', 'ranking', 'justificativa'].map((tipo) => (
      <div key={tipo}>
        {tipo}: {custo.chamadas.filter((c) => c.tipo === tipo).length} chamadas ·
        US$ {dolares(custo.chamadas.filter((c) => c.tipo === tipo)).toFixed(3)}
      </div>
    ))}
  </div>
</div>
```

com `const gasto = dolares(custo.chamadas)` no topo do componente e `custo`/`onZerarCusto` chegando por props.

- [ ] **Step 2: Ligar no `App`**

```jsx
const [custo, setCusto] = useState(() => lerCusto())
```

e na fiação:

```jsx
<PainelControle
  cota={cota}
  custo={custo}
  onZerar={() => setCota(zerarContagem())}
  onZerarCusto={() => setCusto(zerarCusto())}
  onLimparCache={() => setCota(limparCache())}
/>
```

O `custo` precisa ser relido depois de cada chamada — acrescentar `setCusto(lerCusto())` no `finally` de `buscar`, `buscarInteligente` e das duas do `PainelIA`.

- [ ] **Step 3: Verificar à mão**

1. Fazer uma busca com currículo → o número de dólares sobe.
2. "Zerar" → volta a US$ 0,00 e o teto continua.
3. Definir o teto baixo no console (`localStorage`), tentar buscar → a mensagem de teto aparece e **nenhuma** chamada sai (confirmar que não há `[claude] ->` no terminal).

- [ ] **Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "Aba Controle mostra o gasto da Claude ao lado da cota do JSearch"
```

---

## Task 12: Fechar as pendências no ONDE-PARAMOS

**Files:**
- Modify: `ONDE-PARAMOS.md`

- [ ] **Step 1: Riscar o que foi feito**

Pendências que este plano fecha: **4** (dedução do cargo), **5** (medidor de consumo da Claude), **8** (registro falso de cota na Vaga Inteligente). Marcar as três como resolvidas com a data.

A pendência **11** (App.jsx grande) fica parcialmente feita: dois painéis saíram, o arquivo encolheu. Atualizar a contagem de linhas com `wc -l src/App.jsx`.

- [ ] **Step 2: Acrescentar o que este trabalho criou**

- A Avaliação IA funciona **só em `npm run dev`**, como a busca. O site publicado agora tem duas features mortas em vez de uma — a pendência 1 (proxy de produção) ficou mais cara de adiar.
- `.doc` não é mais aceito; a textarea cobre o caso.
- Existe teste (`npm test`), o que antes não existia. Novo comando na lista.

- [ ] **Step 3: Commit**

```bash
git add ONDE-PARAMOS.md
git commit -m "Atualiza o ONDE-PARAMOS com o que a Avaliação IA fechou"
```

---

## Auto-revisão deste plano

**Cobertura da spec:** as dez seções têm task. Seção 2.1 → Task 1; 2.2/2.3 → Task 5; 3 → Task 6; 4 → Tasks 7 e 8; 5 → Task 3; 6 → Tasks 2 e 11; 7 → distribuída (cada módulo trata seus erros, com o mapa central no `claude.js` da Task 5); 8 → o ferramental na Task 1 e os testes em cada task; 9 → Tasks 9, 10 e 11.

**Lacuna conhecida:** a spec diz que o cache de prompt não dispara por causa do prefixo curto. Não há task para isso porque não há nada a construir — é um fato registrado para ninguém investigar depois por que `cache_read_input_tokens` vem zero.

**Consistência de nomes:** `perfilEfetivo` (Task 3) é o nome usado nas Tasks 9, 10 e 11. `registrarChamada` (Task 2) é o que o `contabilizar` (Task 5) chama. `resumirVaga` (Task 7) é reusado pela Task 8. `extrairDocx` (Task 4) é o nome chamado na Task 9. `PerfilSchema` (Task 6) e `NotasSchema` (Task 7) são schemas Zod, não objetos JSON Schema — a primeira versão deste plano errava isso.

**Uma correção já aplicada:** a versão inicial montava JSON Schema à mão e desserializava um bloco de texto. O caminho documentado do SDK é `messages.parse()` com `zodOutputFormat`, lendo `parsed_output`. Corrigido nas Tasks 1, 6 e 7. Se aparecer `output_config: { format: { type: 'json_schema' ... } }` em algum lugar durante a execução, é resíduo dessa versão — troque.

**Divisão de responsabilidade na validação:** o schema Zod garante a *forma* de cada item que volta; ele não garante que os ids sejam os enviados, nem que todos voltaram. Isso é da `validarNotas` (Task 7), e é onde estão as falhas silenciosas.

**Ordem obrigatória:** 0 → 1 antes de tudo. 2, 3, 4 são independentes entre si. 5 depende de 2. 6, 7, 8 dependem de 5. 9 depende de 3, 4 e 6. 10 depende de 7, 8 e 9. 11 depende de 2 e 9. 12 por último.
