# VAGAS — Atalho Inteligente para TI

Protótipo de frontend de um buscador de vagas de TI. Serve para mostrar a
ideia: escolher cargo e cidade, buscar, e ver o resultado com ordenação,
ranking de compatibilidade ("Rank IA") e a tela de configuração da avaliação.

**Site:** https://danielcampetti.github.io/vagasatalhointeligenteparati/

![Tela de vagas do protótipo](docs/print.png)

## ⚠️ A busca só funciona em `npm run dev`

O protótipo deixou de ser frio: **a aba Vagas consulta a API de verdade**. Mas
isso vale apenas em desenvolvimento, e a razão é estrutural.

A chave da API não pode ir para o navegador. Este site é **estático** — o deploy
roda `npm run build` e publica `dist/` no GitHub Pages, sem servidor nenhum. Uma
chave dentro do bundle é pública: qualquer um abre o DevTools e queima as suas
200 requisições. Então a chave fica num `.env` local que **só o proxy do dev
server enxerga**; o navegador chama `/api/jsearch/...`, mesma origem, e quem
acrescenta o header `x-api-key` é o Vite.

**Consequência:** no site publicado não existe esse proxy. `/api/jsearch`
responde 404 e a busca falha. Para a busca funcionar em produção é preciso um
endpoint que guarde a chave fora do navegador — uma função serverless, por
exemplo. Isso ainda não existe.

O que continua sendo frio:

- O upload de currículo só lê o nome e o tamanho do arquivo no navegador. O
  arquivo não sai da máquina nem é enviado para lugar nenhum.
- O **Rank IA** não é calculado: a comparação currículo × descrição é a etapa da
  Claude, ainda não construída. A coluna mostra "—".
- A lista de 5.571 cidades do IBGE é embutida no bundle, não buscada em runtime.
- Favoritar e arquivar valem só para a sessão: recarregar volta ao estado
  inicial. **A exceção é a aba Controle** — contagem de cota e cache das buscas
  ficam no `localStorage`, porque uma cota mensal que zera a cada F5 não
  controlaria nada. Continua sem servidor: vive só na máquina de quem abre.

## Configurando a chave

```bash
cp .env.example .env     # depois cole sua chave da OpenWeb Ninja no arquivo
npm run dev
```

A variável é `JSEARCH_API_KEY`, **sem** o prefixo `VITE_`. Isso é deliberado: o
Vite só injeta no bundle as variáveis que começam com `VITE_`. Renomeá-la para
`VITE_JSEARCH_API_KEY` publicaria a chave em `dist/assets/*.js`.

O `.env` está no `.gitignore`. Sem chave configurada, a busca não chega a sair
da máquina — um middleware corta antes do proxy e a tela diz o que fazer. Isso
também garante que uma chave faltando **não consome cota**.

## O que dá para fazer na tela

> **As vagas vêm da API.** `BANCO_DE_VAGAS` começa vazio e é preenchido pelo
> resultado da busca — não há mais dado fictício no repositório. As 58 vagas de
> mock foram removidas de propósito: com elas dentro, não dava para saber se a
> integração estava funcionando ou se era o mock respondendo.
>
> A tabela mostra "—" no que a API não preenche — salário, sobretudo, vem vazio
> com frequência, e o Rank IA depende da etapa da Claude. Isso é fiel ao dado,
> não falha de mapeamento — veja "O que a JSearch dá e o que falta".

- **Vagas** — o buscador. Não há filtro sobre o resultado: a tela toda são dois
  campos e um botão. Abre num estado de espera, sem resultado nenhum. **Cargo**
  (texto livre) e **cidade** (digita e escolhe da lista) ficam no bloco de
  destaque, atrás do botão **Buscar** — digitar não move a tabela, só o clique
  aplica (veja abaixo). Com resultado vêm a contagem, a ordenação por salário,
  data e Rank IA, a paginação e o menu por linha (favoritar, arquivar). Clicar
  no título abre a **página da vaga**, com a descrição completa e o link para o
  anúncio original.
- **Vaga Inteligente** — a busca que o aluno não precisa saber formular: ele
  informa só a cidade, e a IA deduz o cargo do currículo. Veja abaixo.
- **Banco de Dados** — o acervo. Lista o banco inteiro de uma vez, sem controle
  nenhum acima da tabela: só a ordenação pelo cabeçalho e a paginação.
- **Avaliação IA** — o currículo e o texto que orientaria a nota de 0 a 100. É a
  configuração do que a Vaga Inteligente executa; o currículo enviado aqui vale
  para as duas abas.
- **Controle** — quanto da cota mensal da API já foi gasto. Veja abaixo.
- Abaixo de 1024px de largura a tabela vira uma lista de cards.

Arquivar uma vaga vale para as duas abas: é o mesmo banco.

## O seletor de cidade

O seletor cobre **as 5.571 cidades do Brasil**, do IBGE — e o que você escolhe
aqui vai literalmente na consulta enviada à API, como texto.

### Como se escolhe

É um **combobox**: você digita, a lista se estreita, e escolhe uma linha. O
`CampoCidade` no `App.jsx` faz isso à mão — o projeto não tem biblioteca de UI.

Ao contrário do cargo, aqui o texto **filtra mas não vira valor**: só se pode
escolher dentro da lista, e o que ficou digitado sem escolha é descartado ao
sair do campo. É a diferença que importa entre os dois campos — cargo errado
devolve resultado ruim, cidade errada não devolve nada.

Antes o campo era um par de seletores em cascata (estado, depois cidade) —
rolar 497 opções para achar Caxias era ruim, e o `<select>` nativo só salta
pela primeira letra, então `cax` não levava a lugar nenhum.

Três detalhes que não são enfeite:

- **Acento é normalizado dos dois lados.** Sem isso, `sao` casa com **zero**
  cidades — são todas "São", com til. Seria o primeiro caso que qualquer um
  testaria.
- **Casamento exato vem primeiro.** `sao paulo` tem de pôr a capital no topo;
  na ordem alfabética pura, "São Paulo das Missões" vem antes. Depois vêm os
  que começam com o termo, depois os que o contêm em qualquer posição — é o
  que faz `sul` achar "Caxias do Sul".
- **A lista tem teto de 40 linhas**, com um rodapé dizendo quantas ficaram de
  fora. `santa` casa com 199 cidades; despejar todas seria inútil e pesado.

O valor guardado é a string completa `"Caxias do Sul, RS"`, no mesmo formato do
campo `cidade` de uma vaga — então dá para comparar direto com os dados, e é
também a forma que entra na query da API (a JSearch recebe localização como
texto, não código IBGE). A sigla faz parte do rótulo porque **232 nomes de
município se repetem entre estados** — "Bom Jesus" existe em cinco.

A lista é gerada, não escrita à mão:

```bash
npm run cidades     # baixa do IBGE e reescreve src/data/cidades.js
```

O arquivo gerado é commitado de propósito: município quase não muda, e embutir
a lista mantém a promessa de não fazer requisição nenhuma em runtime. O custo é
**+33 KB no bundle depois do gzip** (de 71,5 para 105 KB) — a resposta crua do
IBGE tem 2,4 MB, mas 97% dela é hierarquia de meso/microrregião que a tela não
usa.

## A aba Vaga Inteligente

Na aba Vagas quem sabe formular a busca é o usuário: ele escreve o cargo. A
Vaga Inteligente inverte isso — **o aluno informa só a cidade**, e o resto sai
do currículo.

O mecanismo previsto, quando as três integrações existirem:

1. a **Claude API** lê o currículo e deduz o cargo
2. a **JSearch** busca por *(cargo deduzido + cidade)*
3. a **Claude API** compara cada vaga com o currículo e dá uma nota
4. a lista volta **ordenada por compatibilidade**

O cargo deduzido não é editável: a proposta é o aluno não precisar saber o nome
do cargo que procura. Se a leitura do currículo errar, o caminho é trocar o
currículo — e esse é o ponto a revisitar se na prática a dedução falhar muito.

### O que existe hoje

Nada disso está ligado. O painel é a casca: os estados, a ordem das etapas e o
lugar de cada resultado. Concretamente:

- **Sem currículo**, a aba não tem o que fazer e manda o aluno para a Avaliação
  IA. O currículo é **um só no app inteiro** — as duas abas leem o mesmo. Trocar
  de aba não apaga a cidade já escolhida aqui, justamente porque o fluxo obriga
  esse ida-e-volta.
- **Com currículo**, o campo de cidade é o mesmo combobox da aba Vagas, e o
  botão roda uma espera simulada antes de mostrar o estado que nomeia as três
  ligações que faltam.
- **A busca é registrada na cota**, com o termo `Vaga Inteligente` no lugar do
  cargo — que só existirá quando a Claude ler o currículo. O cache vale aqui
  também: repetir a mesma cidade não consome requisição.

### Ela é a parte cara do app

Uma busca inteligente custa **1 requisição JSearch + 1 chamada Claude para o
cargo + 1 chamada Claude por vaga comparada**. Com 20 vagas no resultado, são 21
chamadas à Claude numa única busca.

A aba Controle conta só a parte da JSearch — é a cota escassa, 200 por mês. O
consumo de tokens da Claude é outro orçamento e ainda não tem medidor; se a
Vaga Inteligente virar o caminho principal, vale medir também.

## O que a JSearch dá e o que falta

A API é a **OpenWeb Ninja** (`api.openwebninja.com/jsearch/search-v2`), com os
parâmetros fixos `country=br`, `language=pt`, `num_pages=1`. A consulta é montada
como `"<cargo> em <cidade>"`.

O mapeamento está em `src/api/mapear.js`, e a regra ali é **não inventar**:
campo ausente vira `null` e a tela mostra "—". Preencher com um valor plausível
faria a tabela mentir sobre o que a busca trouxe.

| Coluna | De onde vem |
|---|---|
| Cargo, Empresa | `job_title`, `employer_name` |
| Localização | `job_city` + `job_state`, com fallback para `job_location` e "Remoto" |
| Publicada | cadeia de três: `job_posted_at_timestamp`, `job_posted_at_datetime_utc`, e por último o texto `job_posted_at` ("7 days ago"), que em algumas respostas é o único presente |
| Salário | `job_min_salary`/`job_max_salary` — **frequentemente vazios**. Valor anual é descartado em vez de virar "R$ 60 mil por mês" |
| Modalidade | `work_arrangement` (`remote` / `onsite` / `hybrid`) → Remoto, Presencial, Híbrido |
| Link | `job_apply_link`, com `apply_options[0].apply_link` de reserva |
| **Rank IA** | **não existe** — é a comparação currículo × descrição, a etapa da Claude |
| Status | a API não tem o campo. Toda vaga recém-buscada entra como **Ativa** — é o que se pode afirmar do anúncio; "Em análise" e "Encerrada" são estados do processo seletivo, sem fonte |

A `job_description` inteira é guardada em cada vaga. Ela não aparece na tabela:
está lá para a comparação com o currículo.

**O título da vaga abre a página de detalhe**, dentro do app. Ela mostra o que
sabemos da vaga — incluindo a descrição completa, que não cabe na tabela — e só
no fim oferece o link para o anúncio original.

Essa ordem é deliberada: o título já foi link externo direto, e expulsava o
usuário para outro site na primeira interação com um resultado. O link para fora
existe, mas depois.

O botão externo vai com `rel="noopener noreferrer"`, que não é enfeite: sem
`noopener` a página aberta recebe uma referência a esta pela `window.opener` e
pode trocar o endereço daqui. São links de terceiros, vindos de uma API.

### A página de detalhe e o histórico

O app não tem router — as abas são estado local, e não valia trazer um só para
isso. A página de detalhe substitui a tabela quando há vaga aberta.

**O botão voltar do navegador funciona**: abrir empurra uma entrada no histórico
com `pushState`, mas **sem trocar a URL**. Uma URL nova seria pior — no GitHub
Pages não há servidor para reescrever rotas, então recarregar em `/vaga/123`
daria 404.

O preço: a vaga **não é compartilhável por link** e não sobrevive a um F5. Se
deep-link virar requisito, aí sim entra um router — e junto o `404.html` que o
GitHub Pages exige para SPAs.

> **Ao mexer no mapeamento, confira os nomes na documentação.** Dois campos
> foram deduzidos numa primeira versão e pareciam óbvios: `job_is_remote` (que
> não existe) e `job_posted_at_datetime_utc` sozinho. O resultado foram duas
> colunas inteiras vazias em toda busca. O `mapearVagas` agora imprime no
> console os campos da primeira vaga de cada resposta — custa zero requisição e
> mostra a forma real.

## A aba Controle e a cota da API

O plano gratuito da JSearch dá **200 requisições por mês**, e a ideia é gastar o
mínimo. A aba Controle existe para isso não virar surpresa no fim do mês.

O número agora é real: a aba Vagas chama a API, e cada chamada entra aqui.

**O cache é o que faz as 200 renderem.** Cada busca é identificada por
`cargo|cidade`. Se a consulta já foi feita, o resultado sai do `localStorage` e
**a requisição não acontece**; senão a chamada sai e gasta uma. A aba mostra as
duas contagens, e o histórico marca cada busca com sua origem.

O cache guarda as vagas inteiras, com descrição — por isso tem teto de 20
consultas, descartando as mais antigas. O `localStorage` tem uns 5 MB e não vale
enchê-lo de histórico.

**Só conta o que tocou a API.** Um erro tem três destinos diferentes:

| Situação | Consome cota? |
|---|---|
| `.env` sem chave | **Não** — um middleware corta antes do proxy; nada sai da máquina |
| 401, chave inválida | **Não** — a API recusa antes de debitar |
| 429, limite atingido | **Sim** — a requisição chegou lá |
| 200 sem resultado | **Sim** — buscar e não achar custa igual |

Quem carrega essa distinção é o campo `tocouApi` do `ErroJSearch`.

Duas regras que valem conhecer:

- **Consulta vazia não registra nada.** Sem cargo e sem cidade não haveria
  requisição a fazer, e contá-la inflaria o número à toa. A tabela ainda
  aparece — o mock devolve tudo —, mas a cota não se move.
- **A renovação é manual.** O botão *Zerar contagem* existe porque a RapidAPI
  conta pela data da assinatura, não pelo dia 1º; adivinhar essa regra daria um
  número errado. Zere quando o plano virar. *Limpar cache* é independente: zerar
  a contagem preserva o cache, e limpar o cache preserva a contagem.

Tudo mora em `src/cota.js`, isolado do `App.jsx` — que já tem 2.500 linhas e não
precisa ser dono do `localStorage` também. Toda leitura e escrita é defensiva:
em aba anônima, com storage bloqueado ou com o valor corrompido, o acesso lança,
e a tela não pode quebrar por causa do contador. No pior caso ele volta a zero.

## O botão Buscar

Cargo e cidade existem em dois tempos dentro do `App`:

```js
cargoRascunho, cidadeRascunho   // o que os campos do destaque mostram
cargo, cidade                   // os critérios da consulta já feita
```

Digitar altera só o rascunho — a tabela não se move, e um aviso âmbar diz que há
critérios não aplicados. Quem promove um no outro é `buscar()`, e é ela que
dispara a requisição.

Essa separação existe porque uma chamada de rede precisa de um instante definido
para acontecer, mais os estados de carregando e de erro. Recalcular a cada tecla
serve para um array em memória e não sobrevive a uma requisição por alteração.

**A ordem dentro de `buscar()` importa:**

1. valida que há ao menos cargo ou cidade — consulta vazia não vira requisição
2. **consulta o cache primeiro** — repetir uma busca não pode custar uma das 200
3. só então chama a API, e guarda o resultado no cache
4. em caso de erro, registra o uso **apenas se a requisição tocou a API**

**Não há filtro local sobre o resultado.** O `filtradas` só ordena. Comparar a
cidade de novo aqui derrubaria vagas legítimas: a JSearch escreve "Caxias Do
Sul" ou devolve municípios vizinhos, e nada disso bate com o rótulo exato do
IBGE. Quem filtrou por localização foi a API.

O que sobrou de controle na tela é a ordenação pelo cabeçalho e a paginação,
ambas locais. A ordenação trata campo ausente como "vai para o fim" — sem isso,
`null - 5` vira `NaN` e o sort embaralha a lista inteira.

## Rodando local

```bash
npm install
cp .env.example .env     # cole sua chave da OpenWeb Ninja
npm run dev
```

Abre em `http://localhost:5173/vagasatalhointeligenteparati/` (o caminho tem o
nome do repositório por causa do `base` do Vite — veja abaixo).

Outros comandos:

```bash
npm run build     # gera dist/
npm run preview   # serve o dist/ como em produção
npm run lint      # oxlint
```

## Deploy

Push na branch `main` → o workflow `.github/workflows/deploy.yml` faz o build e
publica no GitHub Pages. Também dá para disparar na mão em
**Actions → Deploy no GitHub Pages → Run workflow**.

Em **Settings → Pages**, o *source* é **GitHub Actions**.

Um detalhe importante para não quebrar: em `vite.config.js`,
`base: '/vagasatalhointeligenteparati/'` precisa ser exatamente o nome do
repositório. Se o repositório for renomeado e o `base` não acompanhar, a página
abre sem CSS nenhum (o HTML procura os assets na raiz do domínio e recebe 404).
O `public/.nojekyll` existe para o Pages não ignorar arquivos e pastas que
começam com `_`.

## Estrutura

```
index.html
.env.example        # modelo do .env com a chave da API (o .env fica fora do git)
src/
  main.jsx          # bootstrap do React
  App.jsx           # a página inteira (uma tela só, sem router — abas em estado local)
  index.css         # Tailwind + tokens do tema + estilos base
  cota.js           # contagem da cota da API + cache, no localStorage
  api/jsearch.js    # a chamada de rede e os erros traduzidos
  api/mapear.js     # resposta da JSearch -> a forma de vaga da tabela
  data/vagas.js     # ⬅️ os dados mockados: é aqui que se edita o conteúdo
  data/cidades.js   # os 5.571 municípios do IBGE — gerado, não editar à mão
scripts/
  gerar-cidades.mjs # regenera cidades.js a partir da API do IBGE
public/
  .nojekyll
  favicon.svg
.github/workflows/deploy.yml
```

Stack: Vite + React 19 (JavaScript, sem TypeScript) e Tailwind CSS v4. O v4
configura o tema em CSS, pelo bloco `@theme` do `src/index.css`, em vez do
antigo `tailwind.config.js`. O layout veio de um protótipo do Claude Design que
usava estilos inline, então eles foram mantidos como estão; o Tailwind cuida do
reset, dos tokens e dos estados de `hover`.

## Editando os dados

`src/data/vagas.js` exporta `BANCO_DE_VAGAS`, **hoje um array vazio** — é onde a
resposta da API vai pousar, e a base única que a aba Vagas consulta e a aba
Banco de Dados lista. Cada item tem esta forma:

```js
{
  id: 'j0',
  cargo: 'Técnico de Redes',
  techs: ['Cisco', 'Wi-Fi', 'Switch'],
  empresa: 'Marcopolo',
  cidade: 'Caxias do Sul, RS',
  modalidade: 'Remoto',      // Remoto | Híbrido | Presencial
  min: 2.7, max: 3.9,        // faixa salarial em R$ mil
  days: 12,                  // dias desde a publicação (a data é calculada a partir de hoje)
  rank: 87,                  // 0 a 100
  status: 'Ativa',           // Ativa | Em análise | Encerrada
  seen: false,               // false mostra o ponto azul de "não lida"
  fav: false,
}
```

Colar itens nesse formato dentro do array é o jeito de ver a tabela com
conteúdo antes da API. Salvou, o Vite recarrega. Nada além disso — o
`ModalNovaVaga` existe no `App.jsx`, mas nenhum botão da tela o abre.

Uma armadilha ao preencher: **a `cidade` precisa bater exatamente com o rótulo
do IBGE**, senão o registro fica inalcançável pela busca. O seletor só oferece
os 5.571 nomes oficiais e o recorte compara a string inteira, então copie o
rótulo como ele aparece — `"Caxias do Sul, RS"`.

O `vagas.js` não exporta lista de cargo nenhuma: o campo virou texto livre.
`MODALIDADES` sobrou só para o formulário de nova vaga, e a lista de cidades do
seletor vem do `cidades.js`, do IBGE — não é derivada daqui.

O campo `techs` não filtra nada; segue aparecendo abaixo do cargo, como
informação da vaga.
