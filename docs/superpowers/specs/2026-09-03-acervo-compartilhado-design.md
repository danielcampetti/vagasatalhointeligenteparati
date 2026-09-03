# Acervo compartilhado — o primeiro estado que mora no servidor

**03/09/2026.** Até hoje o app não guarda nada fora do navegador. Este
documento desenha a mudança: as vagas passam a viver num SQLite no Railway, e
toda busca — de quem quer que seja — alimenta o mesmo acervo.

---

## 1. O que existe hoje

Levantado no código, não suposto.

Quatro chaves no `localStorage`, e mais nada em lugar nenhum:

| chave | módulo | o que guarda |
|---|---|---|
| `vagas:acervo` | `acervo.js` | as vagas acumuladas — a aba Banco de Dados |
| `vagas:cota` | `cota.js` | contagem de requisições + cache das consultas |
| `vagas:cv` | `curriculo.js` | currículo e instrução |
| `vagas:custo` | `custo.js` | gasto com a Claude |

O `server.js` não escreve em disco: `grep` por `fs.`, sqlite, postgres, mongo,
redis e prisma dá zero. Ele serve o `dist/` e reproxia dois prefixos de API
injetando chaves. É um proxy, não um backend.

A consequência é a que motivou este trabalho: **o acervo é por origem**. O que
o `npm run dev` juntou não está no Railway, e o contrário também não. Foi essa
mesma propriedade que fez o painel Controle mostrar 3/200 com 50 gastas — ver o
commit `5d8bfc9`, de hoje.

### O que o `acervo.js` já resolve, e vai continuar resolvendo

Ele não é ingênuo, e nada aqui joga fora o que ele aprendeu:

- **dedupe por `id`**, com vaga sem `id` recusada (não teria como ser
  atualizada depois — entraria como lixo inalcançável);
- **`mesclar`**, que preserva o que é de quem usa: `fav` e `seen` uma vez
  ligados não desligam numa busca nova; `rank` novo vence, mas ausente não
  apaga o antigo, que custou uma chamada paga; `descricao` vazia não zera a
  guardada;
- **`entrouEm` estável** — quando entrou, não quando foi vista de novo, porque
  é o critério de descarte do teto;
- **teto de 500**, com o corte no fim da lista.

### Duas funções mortas

`removerDoAcervo` (linha 169) e `limparAcervo` (linha 175) são exportadas e
testadas, e **nenhum componente as chama**. O único "Remover" da interface é o
do currículo, em `PainelIA.jsx:554`. Não há botão de apagar vaga nem de limpar
o acervo.

Isso importa para o escopo: ver a seção 8.

### A medição que decide o formato da rota

Feita em 03/09/2026 sobre 88 vagas reais: **2,7 KB por vaga, dos quais 66% é a
`descricao`**. E `descricao` do acervo só é lida em um lugar — a página de
detalhe (`App.jsx:2604`). O ranking também a usa (`ranking.js:107`), mas opera
sobre a busca corrente (`banco`), não sobre o acervo.

---

## 2. As decisões tomadas

Quatro, todas do dono do projeto, em 03/09/2026:

1. **Tudo compartilhado.** Vaga e marcas (`fav`, `seen`, `rank`) vão para o
   servidor. Um store só.
2. **Nada é destruído no servidor.** Se um dia existir "Remover", ele esconde
   da tela de quem clicou; o banco não perde a vaga.
3. **SQLite em volume**, via `node:sqlite`.
4. **Não poupar cota agora.** A busca continua indo à API como hoje; o banco só
   recebe o que ela trouxe.

### A consequência aceita

`rank` é a nota que a Claude deu comparando a vaga com **um** currículo — o de
quem pagou pela chamada. Compartilhada, ela aparece para quem tem outro
currículo, medindo compatibilidade com o de outra pessoa.

Isso foi pesado e aceito. A mitigação combinada é um rótulo, não esconder a
nota. Concretamente: onde a nota aparece hoje sem qualificação, passa a
aparecer com a ressalva de que ela mede um currículo que pode não ser o de quem
está lendo. Uma linha na página de detalhe e um `title` na coluna da tabela —
nenhuma tela nova.

---

## 3. Onde a linha é traçada

```
NAVEGADOR                          SERVIDOR (Railway)         VOLUME
─────────                          ──────────────────         ──────
vagas:cota    (inalterado)                                    /dados
vagas:cv      (inalterado)         server.js                    acervo.db
vagas:custo   (inalterado)           /api/acervo    ──────►     (SQLite)
                                     /api/acervo/:id
acervoRemoto.js ────HTTP────►
```

O servidor passa a ser dono das **vagas**. Tudo que já era do navegador
continua sendo, sem uma linha mexida.

---

## 4. Os módulos

| módulo | onde roda | responsabilidade |
|---|---|---|
| `src/vaga.js` **(novo)** | ambos | `mesclar` e a validação de `id` |
| `src/servidor/banco.js` **(novo)** | servidor | schema e as quatro operações |
| `server.js` | servidor | quatro rotas finas sobre o `banco.js` |
| `src/acervoRemoto.js` **(novo)** | navegador | os `fetch` |
| `src/acervo.js` | navegador | reduzido à fonte da migração |

### Por que `vaga.js` existe

`mesclar` é a única regra que os dois lados precisam concordar, e ela já tem
teste. Movida para um módulo neutro, roda no servidor sem ser reescrita — e o
`acervo.test.js` que a cobre continua valendo com um import trocado.

Reescrevê-la como `ON CONFLICT DO UPDATE` em SQL seria traduzir para outra
linguagem quatro regras sutis que custaram bugs para aprender. Não vale.

### Por que `banco.js` não conhece HTTP

Para ser testável com `:memory:`, sem subir servidor. As rotas ficam finas o
bastante para o teste de integração ser sobre o transporte, não sobre a lógica.

### A armadilha: hoje o `server.js` não é importável

Ele monta o `app` e chama `app.listen` no topo do módulo. Um teste que o
importasse **abriria uma porta** como efeito colateral do import — e uma porta
já ocupada derrubaria a suíte por um motivo que não tem nada a ver com o que
está sendo testado.

Então o arquivo passa a exportar `criarApp()`, e o `listen` só acontece quando
ele é o ponto de entrada. É uma mudança de três linhas, mas é pré-requisito do
teste de integração da seção 11 — não uma melhoria opcional.

---

## 5. A tabela

```sql
CREATE TABLE IF NOT EXISTS vagas (
  id       TEXT PRIMARY KEY,
  entrouEm TEXT NOT NULL,
  dados    TEXT NOT NULL          -- a vaga inteira, JSON
);
CREATE INDEX IF NOT EXISTS vagas_entrouem ON vagas(entrouEm DESC);
```

Três colunas, não vinte. `id` e `entrouEm` saem para fora porque são os dois
que o **banco** usa: dedupe e ordenação/teto. O resto é carga.

O motivo está no `ONDE-PARAMOS`, já escrito: *"nomes de campo da API: confira,
não deduza"* — `job_is_remote` não existe, o certo é `work_arrangement`, e isso
custou duas colunas vazias. O `mapear.js` já mudou de forma e vai mudar de
novo. Com colunas enumeradas, cada campo novo viraria uma migração de schema;
com `dados` em JSON, o `mapear.js` segue livre e o banco não precisa saber.

O preço é não poder filtrar em SQL. Não custa nada hoje: o `filtroAcervo.js`
recorta a lista inteira no navegador, e vai continuar.

### `node:sqlite`, verificado

Testado em 03/09/2026 no Node 22.14.0 — o mesmo que o Railway roda (`railway
run node -v`). `DatabaseSync`, `prepare`, `run` e `ON CONFLICT DO UPDATE`
funcionam **sem flag**. Sai um `ExperimentalWarning` no log; a API pode mudar
num Node futuro, e esse é o risco assumido em troca de zero dependência nova.

---

## 6. As rotas

```
GET   /api/acervo        → lista SEM descricao
GET   /api/acervo/:id    → a vaga inteira
POST  /api/acervo        → vagas de uma busca; upsert via mesclar
PATCH /api/acervo/:id    → favoritar, marcar lida, gravar nota
```

Não há `DELETE`. É assim que a decisão 2 fica satisfeita sem código: o que não
existe não pode ser chamado por engano.

O `GET` corta `descricao` porque ela é 66% do peso e a tabela não a mostra. A
página de detalhe busca por `id` — é o único consumidor.

### O teto sobe para 2000

Os 500 de hoje vinham dos ~5 MB do `localStorage`, restrição que some no
volume. Com a lista enxuta a ~0,9 KB/vaga, `GET /api/acervo` fica em ~1,8 MB
numa aba que carrega uma vez.

Acima de 2000 seria preciso paginar, e paginar mexeria no `filtroAcervo.js` e
nos dropdowns, que hoje leem o acervo inteiro. Fica para quando o número
justificar.

---

## 7. O que quebra, e como avisa

### A aba deixa de ser síncrona

Hoje: `useState(() => lerAcervo())` em `App.jsx:3047` — o acervo existe no
primeiro render. Com o servidor, não existe. A aba ganha três estados:
**carregando**, **carregou**, **falhou**.

"Falhou" tem que dizer que falhou. Acervo vazio por queda de rede é
visualmente idêntico a acervo vazio de verdade, e a tela de vazio hoje diz
*"Faça uma busca por lá e as vagas aparecem neste acervo"* — conselho errado
para quem está vendo um erro de rede. Mensagem explícita e botão de tentar de
novo.

### Escrita que falha não derruba a busca

As vagas já estão na tela quando o POST sai: elas vieram da API e já custaram
cota. Um POST que falha vira aviso, nunca erro fatal — perder a tela por causa
do arquivamento seria perder o que foi pago.

### O `semear` sai de cena

`semear` existe porque, quando o acervo nasceu, havia 88 vagas paradas no
`cota.cache` já debitadas das 200. Essa carga inicial já aconteceu; a marca
`semeado` já está gravada. No servidor ela não se repete, e o lugar da
semeadura passa a ser a migração da seção 9.

---

## 8. Fora de escopo, de propósito

- **`escondidos.js` e o esconder local.** A decisão 2 está tomada e registrada,
  mas os botões que a acionariam não existem (seção 1). Construir o mecanismo
  agora seria inventar funcionalidade. Quando "Remover" aparecer, o
  comportamento já está decidido: esconde local, não apaga no servidor.
- **Login.** Sem ele, quem tem a URL escreve no banco — aceito, e já é verdade
  para as chaves de API desde o primeiro deploy (está no README).
- **Poupar cota consultando o banco antes de buscar.** Decisão 4.
- **Paginação, busca full-text, apagar de verdade.**

---

## 9. Migração

Na primeira carga, se houver acervo no `localStorage`, ele sobe num POST e
ganha marca de migrado.

A marca é o que importa, e o precedente é o próprio `semeado`: sem ela, o local
voltaria a subir a cada carga, e qualquer coisa que o servidor fizesse com
aquelas vagas seria desfeita na sessão seguinte.

**O `vagas:acervo` local não é apagado**, só marcado. Se a migração der errado,
o dado ainda está lá para ser reenviado à mão.

---

## 10. Infra

Volume do Railway montado em `/dados`; `BANCO_CAMINHO=/dados/acervo.db`.

Sem volume o disco do Railway é efêmero e o banco morre a cada deploy — que é
exatamente o defeito que este trabalho existe para corrigir. O volume não é
opcional.

Em dev e em teste o caminho cai em arquivo temporário ou `:memory:`. **O
`server.js` não pode passar a exigir volume para rodar local**: o README promete
que `npm run dev` e o Railway se comportam igual, e essa promessa é o que faz
defeito de produção aparecer antes de publicar.

---

## 11. Testes

| arquivo | o que trava |
|---|---|
| `src/vaga.test.js` | `mesclar` — herda os casos que hoje vivem no `acervo.test.js` |
| `src/servidor/banco.test.js` | dedupe, merge, teto descarta o mais antigo, `id` ausente recusado, `:memory:` |
| `src/servidor/rotas.test.js` | as quatro rotas contra `:memory:`; `GET` sem `descricao`, `GET /:id` com |
| `src/acervoRemoto.test.js` | erro de rede vira estado de falha, não lista vazia |

O `acervo.test.js` encolhe para o que sobrar do módulo (a migração) e cede o
resto para `vaga.test.js`.

---

## 12. Ordem sugerida

1. `vaga.js` — extrair `mesclar`, mover testes, nada muda de comportamento
2. `banco.js` + testes com `:memory:` — sem HTTP, sem tela
3. `criarApp()` no `server.js` — só torna o arquivo importável, sem rota nova
4. rotas + teste de integração
5. `acervoRemoto.js` + testes de falha
6. `App.jsx` — os três estados, a migração, o rótulo da nota
7. volume no Railway e deploy

Cada passo é verificável sozinho. Os cinco primeiros não tocam a tela e não
podem quebrar o que está no ar.
