# Onde paramos — 02/09/2026

Retomada rápida do protótipo VAGAS. O **README.md** explica *como as coisas
funcionam*; este arquivo diz *em que pé estão* e *o que fazer a seguir*.

> **Como ler:** o bloco abaixo é o estado de hoje. Depois dele vem o diário do
> dia 02/09, do mais recente para o mais antigo — é onde estão as medições e o
> **porquê** de cada mudança. As seções estruturais ("O que funciona hoje",
> "Decisões já tomadas", "Pendências", "Armadilhas") vêm no fim e valem para
> qualquer retomada.

---

## Onde estamos agora — 02/09/2026

**Seis commits hoje**, todos no `main` local, working tree limpo. Para o
número exato à frente do remoto: `git rev-list --count origin/main..main`.

    af24166  Listagem: a coluna Status virou "Ver Vaga", com link para o anúncio
    ea64f9a  Buscar: uma página, e o botão serve as seguintes do cache
    b433a6b  Carregar mais: manda só as vagas novas, com âncora de escala
    4f85abc  README/ONDE-PARAMOS: a janela, o custo do pensamento e o dashboard
    a419468  ranking: o effort nunca era enviado, e o padrão da API é "high"
    ab00cd2  Aba Vagas: janela de publicação, contra vaga encerrada e vaga velha

O dia inteiro foi **medição contra a API real**, não leitura de código. O que
mudou, em uma linha cada:

| | antes | agora |
|---|---|---|
| vagas sem data na busca | 5 de 10 | 0 de 10 |
| espera do "Avaliando N vagas" | ~28s | ~7–19s |
| custo de uma busca | $0,0486 | $0,0289 |
| custo de "Carregar mais" | ~$0,0399 | $0,0157 |
| "Buscar" depois de paginar | devolvia a lista acumulada | devolve uma página |
| coluna Status | pílula "Ativa" em toda linha | link para o anúncio |

Testes: **202** (`npm test`). Lint limpo fora de um aviso pré-existente em
`perfil.test.js`. Build OK.

**Continua tudo local, sem push** — decisão de 28/08, reafirmada hoje. Um push
no `main` dispara o deploy do GitHub Pages (`on: push: branches: [main]`), e o
site publicado tem busca e Avaliação IA mortas: não há proxy em produção.

---

## 02/09 (noite, 3) — a coluna Status virou "Ver Vaga"

Pedido: trocar o Status por um atalho para o anúncio, com ícone na linha, para
poder ir pelo detalhe interno **ou** direto para o site do anunciante.

A troca se justificava sozinha: `mapear.js` fixa `status: 'Ativa'` em toda vaga
vinda da API — a JSearch não tem campo de expiração, conferido nos 35 campos da
resposta —, então a coluna repetia a mesma pílula verde em todas as linhas. Era
uma coluna constante dando lugar a uma acionável.

Feito na tabela e no cartão de tela estreita. A página de detalhe manteve o
status: ela tem espaço de sobra e já tinha o botão "Ver vaga no site original".

O componente `LinkDaVaga` carrega três cuidados:

- `e.stopPropagation()`, porque a linha inteira já abre o detalhe — sem ele o
  clique no ícone abriria a aba externa **e** a página interna por baixo;
- `rel="noopener noreferrer"`, o mesmo raciocínio já registrado no README para
  o botão do detalhe;
- a URL chega saneada da origem.

Esse terceiro item foi o que mudou de peso e virou teste. Enquanto o link só
existia no detalhe, atrás de um clique deliberado, o risco era teórico. Dez
âncoras por tela, montadas com URLs vindas de uma API de terceiros que ninguém
leu, é outro cálculo — um `javascript:` num `href` executa ao clique, na origem
da própria página. O `linkDeCandidatura` entrou no `mapear.js` com lista de
permissão (`http`/`https`, esquema estranho recusado por omissão) e peneira por
candidato: link principal recusado ainda deixa a reserva de `apply_options` ser
avaliada.

O `mapear.js` não tinha teste nenhum até aqui; ganhou o primeiro.

Verificado no app, busca "Analista" em Porto Alegre:

- cabeçalho lê "Ver Vaga", "Status" sumiu da listagem;
- 10 âncoras, todas com `target="_blank"` e `rel="noopener noreferrer"`, com
  hrefs reais (gupy.io, simplyhired, divulgavagas);
- **clique no ícone não abriu o detalhe**, e o controle confirma que clicar na
  linha continua abrindo — que é a prova de que o `stopPropagation` está no
  lugar certo e só ali;
- o cartão de tela estreita mostra "Ver vaga" com rótulo, no lugar da pílula.

Testes: 194 -> 202.

---

## 02/09 (noite, 2) — Buscar devolvia 27 vagas

Relatado: clicar em Buscar trouxe 27 vagas em vez de 10.

Não era a API (`num_pages` segue 1, e as sete requisições de diagnóstico da
manhã sempre voltaram 10). Era o cache. `carregarMais` grava a lista
**acumulada** sob a mesma chave da busca — o que é correto, senão a próxima
repetição perderia as páginas já pagas —, e `buscar()` fazia
`setBanco(guardado.vagas)` sem olhar o tamanho. As 27 eram três páginas de uma
sessão anterior voltando juntas.

Agravante: elas iam inteiras para a Claude (`ranquearBanco(guardado.vagas)`).
Uma busca que não gastava nenhuma das 200 custava ~US$ 0,06.

### O que ficou

A entrada de cache passou a registrar as fronteiras das páginas (`paginas`), e
`cota.js` ganhou `paginasDoCache` e `proximaPagina`. Buscar restaura a
primeira; o botão serve as seguintes **do cache, sem rede** — elas já custaram
uma requisição cada, e descartá-las faria o próximo clique pagar de novo.

Também entrou `ranquearPendentes`: só as vagas sem nota vão para a Claude,
ancoradas nas que já têm. Uma página que volta do cache já pontuada não custa
nada.

Verificado no app, com uma entrada de cache **legada** (gravada antes de
`paginas` existir, o que exercita o fallback junto):

- Buscar: "Mostrando 1 a 10 de 10" — eram 15 — e **zero chamadas à Claude**,
  porque as 10 voltaram já pontuadas;
- Carregar mais: serviu as 5 guardadas com **zero requisições JSearch**
  (contador do proxy: 13 antes, 13 depois) e uma chamada Claude só para as 5
  sem nota;
- o texto embaixo do botão trocou sozinho de "sai do cache, sem consumir
  requisição" para "Consome 1 das 200" quando o cache acabou.

Detalhe de forma: a memo que decide se há página no cache lê o `cota` que já
está em estado, não o `localStorage`. Ler storage dentro do render funcionava,
mas escondia a dependência do linter — e a dependência é real, porque
`setCota(registrarUso(...))` é o que precisa disparar a reavaliação.

Testes: 186 -> 194.

---

## 02/09 (noite) — "Carregar mais" reenviava tudo

Suspeita levantada pelo gasto na API, e estava certa: `carregarMais` terminava
em `ranquearBanco(listaCompleta)` — a lista acumulada inteira, não as novas.

Era deliberado e documentado (notas de lotes diferentes não são comparáveis, e
a tabela ordena por Rank IA). Mas o comentário afirmava que *"reranquear junto
custa quase o mesmo, porque continua sendo uma chamada só"* — e isso não se
sustenta. No log de custo real:

    00:39:04  busca          in 10.086  out 2.637  = $0,0465
    00:40:40  carregar mais  in 17.668  out 3.048  = $0,0658   +41%

Projetando busca + 3 cliques: **$0,2117 contra $0,1045**, 102% de sobrecusto, e
100 vagas-slot enviadas para 40 vagas únicas — 60% de repetição pura.

**E a justificativa se desmontava exatamente onde doía.** Ela valia "enquanto a
lista couber em TAMANHO_LOTE" (30). Rodando o `emLotes`: 40 vagas viram
`[20, 20]` — duas chamadas com escalas independentes. No terceiro clique você
paga a entrada de 40 vagas *e* recebe a mistura de escalas que o desenho
existia para evitar. Pior dos dois mundos, em silêncio.

Havia ainda um furo na premissa. Ela se apoia em "9,1 pontos de diferença
média" ao partir o lote — mas a medição de effort da rodada anterior mostrou
que **duas chamadas idênticas já divergem 6,8 pontos**. O dano marginal do
fatiamento é ~2,3 pontos, não 9,1.

### O que ficou

Só as vagas novas viajam com descrição. As já pontuadas vão como **âncora de
escala** — `{cargo, nota}`, sem descrição (`calibracaoDe`, com teto de 30 e
amostragem ao longo da faixa de notas, para a âncora não mostrar só o meio da
escala).

A âncora não é opcional: o viés que ela evita não é ruído, é direcional. Um
lote avaliado só contra si mesmo sobe em bloco (+6 a +10, medido). Sem ela,
vaga ruim da página 2 subiria acima de vaga boa da página 1.

Verificado no app, busca "Analista" em Porto Alegre:

- a tela diz **"Avaliando 5 vagas com a IA"** (as novas), não 15 — precisou de
  um contador próprio, porque `banco.length` deixou de ser essa resposta;
- entrada de **6.861** contra os ~15.400 do comportamento antigo;
- as notas antigas **preservadas ao pé da letra** (`mesclarRank` já fazia isso);
- a vaga nova entrou com **15**, numa lista cujas notas iam de 3 a 30 — dentro
  da faixa, que é a âncora funcionando;
- **$0,0157 contra ~$0,0399**, 61% mais barato, 6,3s em vez de ~15s.

Página que só traz repetidas agora não chama a Claude nenhuma vez — antes
reranqueava tudo por nada. Aconteceu no teste, com a busca de Caxias do Sul.

O penhasco dos 40 vagas some junto: cada chamada só vê a página nova, e nunca
mais estoura o `TAMANHO_LOTE`.

Estimativa corrigida: a âncora custa ~60 tokens por vaga, não os ~15 que eu
tinha projetado — títulos de vaga são longos. Continua irrelevante ($0,0012 por
clique), mas o número no comentário é o medido.

Testes: 178 -> 186.

---

## 02/09 (tarde) — a espera de 27s do "Avaliando N vagas com a IA"

Reclamação: a avaliação demorava demais para um sistema simples. O sistema é
simples; **o modelo é que estava sendo mandado pensar a fundo, por um padrão
que ninguém escolheu.**

`ranking.js` montava `output_config` só com o `format` e nunca com `effort` —
e o padrão do `claude-sonnet-5` é `high`. Medido contra a API real, mesmo lote
de 10 vagas, três execuções cada:

| effort | tempo | saída |
|---|---|---|
| `high` (o que rodava) | 23,6s · 26,8s · 28,4s | 2.000–2.700 tokens |
| `medium` | 15,1s · 16,4s · 19,2s | 430–1.412 tokens |
| `low` | 5,2s · 5,4s · 6,3s | ~440 tokens |

A resposta útil são ~250 tokens em todos os casos — dez objetos
`{ref, nota, motivo}`. **~90% do que era gerado em `high` era pensamento**, e a
API confirma em `usage.output_tokens_details.thinking_tokens`.

**Ficou `medium`**, por decisão do dono do projeto depois de ver a medição de
qualidade. Essa medição rodou `high` **duas vezes**, para separar degradação de
ruído:

| contra o `high` | dif. média | 1º lugar | top-3 |
|---|---|---|---|
| `high` de novo (**ruído**) | 6,8 pts | mantido | 2/3 |
| `medium` | 12,0 pts | trocado | 1/3 |
| `low` | 15,5 pts | trocado | 0/3 |

Verificado no app: a espera caiu de ~28s para **7,2s** e a busca de $0,0486
para **$0,0289**. O pódio trocou (o Estágio de Infra caiu de 1º/68 para 2º/45),
que é o desvio medido acontecendo.

Só o ranking mudou. Perfil e justificativa continuam no padrão: nenhum dos dois
é a espera que incomoda, e nenhum dos dois foi medido — mexer por simetria seria
supor.

### O susto do dashboard, e a lição

O dashboard da Anthropic mostrava **~$0,08 por busca** contra os $0,049 desta
análise. Investigado até o fim, e **não era defeito de nada**:

- preço conferido na fonte oficial — `claude-sonnet-5` é $2/$10, e o aumento
  para $3/$15 que estava marcado para 01/09/2026 **não aconteceu**;
- `usage` despejado inteiro — sem campo escondido, cache zerado, e o cálculo do
  `custo.js` bate ao centavo com o cálculo completo.

A causa era de contabilidade: **11 chamadas de medição feitas por fora do app**
somaram $0,43 na mesma chave — quase 40% do total. Dividir o total da chave
pelas buscas feitas no app inflava cada busca para $0,077.

**A lição vale para a próxima vez:** medição feita com a chave do projeto entra
na fatura mesmo sem passar pelo medidor da aba Controle. Ao comparar os dois
números, filtre por requisição, não por total.

### O que ficou mapeado e não foi feito

- **77% da entrada são descrições de vaga**, e o `INSTRUCAO_PADRAO` manda
  ignorar boa parte delas. Cortar em 1.500 caracteres tira 40% da entrada.
  **Não feito porque só medi tokens, não qualidade** — falta rodar a mesma
  comparação de notas que o `effort` teve.
- `JSON.stringify(x, null, 2)` gasta 356 tokens em indentação. Risco zero.
- **A tabela espera o ranking inteiro de propósito** (`fase.js:10` já registra
  o preço disso). Mostrar a lista assim que a JSearch responde, com a coluna
  Rank IA carregando por linha, derrubaria a espera percebida para ~2s **sem
  custo de qualidade nenhum**. É a mudança de maior retorno que sobrou.
- Dois lotes de 5 **em paralelo** cortariam o tempo pela metade. A nota do
  `ranking.js:38` rejeitou o fatiamento por mover as notas em 9,1 pontos — mas
  agora sabemos que o ruído entre duas chamadas iguais é 6,8. A maior parte
  daqueles 9,1 era ruído, não fatiamento; a advertência é mais fraca do que
  parece.

---

## 02/09 — a janela de publicação, e o que a API não tem

Duas reclamações: a busca trazia **vaga encerrada** e **vaga publicada há
muito tempo**. Foram diagnosticadas com sete requisições reais à JSearch, não
por leitura de código — e o diagnóstico mudou a solução.

**O achado que importa: a API não tem campo de expiração.** Uni os campos das
10 vagas de uma resposta real: são 35 nomes e nenhum é de validade. Não existe
como perguntar se o anúncio caiu, e o `status: 'Ativa'` fixo do `mapear.js`
não é bug — é a única coisa honesta disponível. O que existe é a correlação:
metade do retorno vinha com `job_posted_at` nulo, sempre de agregadores que
copiam anúncio e nunca o tiram do ar (Jobfy, Solides Vagas, Empregos Hub,
BNE), e `date_posted=month` devolveu **zero** delas. Idade desconhecida é o
proxy que existe, e é ele que a correção usa.

**O segundo achado: `date_posted=week` não é honrado.** `today` e `3days`
filtram de verdade (0 vagas), `month` também (10 datadas, nenhuma sem data),
mas `week` voltou vaga de 26 dias e 5 sem data — praticamente o mesmo conjunto
do `all`. A janela mais estreita deixou passar mais lixo que a mais larga. Por
isso o corte acontece **duas vezes**: `date_posted` na requisição e de novo na
tela. A tabela completa das sete medições está no README.

O que entrou:

- `src/janela.js`, dono do conceito inteiro — o valor que vai para a API, o
  rótulo em português e o corte local. Vaga sem data é descartada em qualquer
  janela que não seja "Qualquer data".
- Dropdown na aba Vagas, **padrão "Último mês"**. Era o `all` — o que a API
  assume quando ninguém manda `date_posted`, que era o caso — que deixava os
  zumbis entrarem.
- **Estreitar não gasta cota**: "Última semana" cabe no que "Último mês" já
  baixou, então o recorte é local, sem rede e sem reavaliar com a Claude.
  Alargar vai à rede. Daí o par `janela` (o que a tela mostra) e
  `janelaBaixada` (o que a API atendeu) — e é a segunda que o "Carregar mais"
  repete, porque o cursor pertence à busca que o gerou.
- A janela entrou na chave do cache (`termo|cidade|janela`), senão trocar para
  "Hoje" seria servido pelo resultado guardado de "Qualquer data".
- O estado vazio passou a distinguir "a API não achou nada" de "a janela
  escondeu tudo". Sem isso o segundo caso mentia: diria "a API não devolveu
  resultados" depois de uma requisição que devolveu dez vagas.

Verificado no app rodando, não só no vitest: a requisição sai com
`date_posted=month`, a tela mostra 10 vagas **todas datadas** (contra 5 de 10
sem data antes), estreitar para semana e voltar para mês custou **zero**
requisições, e alargar para "Qualquer data" foi à rede e trouxe os 5 sem data
de volta — com o Rank IA colocando dois deles em 2º e 3º lugar, que era
exatamente a queixa.

Testes: 171 → 177. `date_posted` foi conferido contra a API real, não deduzido
da documentação — que, aliás, é uma página client-side que não serve o texto
dos parâmetros.

**O que ficou de fora, de propósito:** `exclude_job_publishers` funciona
(testado: 10 → 5 vagas, a API ecoa a lista já parseada) e barraria os
agregadores direto. Não foi ligado porque o filtro de data já derrubou todos
eles, e bloquear publisher envelhece mal — esconde vaga boa sem avisar. Se o
lixo voltar, o gancho é uma linha no `montarUrl`.

**Achado colateral não corrigido:** `job_posted_at_timestamp` e
`job_posted_at_datetime_utc` vieram `null` nas 10 vagas. A cadeia de três
passos do `diasDesde()` colapsa sempre no último elo, o texto `"há 9 dias"` —
funciona, mas o README descrevia como "ordem de confiabilidade" algo cujos
dois primeiros elos nunca chegam. O README foi corrigido; o código não mudou,
porque a cadeia continua certa se a API voltar a mandar os campos.

> **Revisado em 27/08/2026.** Cada afirmação abaixo foi conferida contra o
> código — `wc -l`, `npm test`, `git log` — não contra a memória. Este arquivo
> foi escrito quando a Avaliação IA não existia; ela existe agora, então quase
> tudo abaixo mudou. Onde algo mudou de rumo, o texto registra o que era antes
> e por que mudou, não só o estado novo.

---

## Estado do repositório

> Escrito em 28/08 e ainda válido no essencial — a decisão de não publicar, o
> `.env` com duas chaves, o histórico da `avaliacao-ia`. O que mudou desde
> então está em "Onde estamos agora", no topo.

Tudo commitado, `git status` limpo. **A `avaliacao-ia` foi integrada ao
`main` em 28/08**, por fast-forward — ela não era um desvio lateral, era a
linha principal do trabalho, e o histórico já estava commit a commit. As duas
referências apontam para o mesmo commit desde então; a de trabalho daqui para
frente é o `main`.

Dos commits do `main`, os 29 do meio são a Avaliação IA inteira — do desenho ao
medidor de custo, passando pela revisão final e pela onda de correções que ela
gerou — e os 7 do topo são o trabalho de 28/08: a correção do Rank IA, a lista
que passou a esperar o ranking, o detalhe que abre também da Vaga Inteligente,
a linha clicável da tabela, o "Carregar mais vagas", e este documento.

**Nada disso está no remoto — e isso é decisão, não esquecimento.** Em 28/08
ficou combinado manter o trabalho só nesta máquina por enquanto; não publique
sem pedir. O `main` local está dezenas de commits à frente do `origin/main` —
para o número de agora, `git rev-list --count origin/main..main`.

O risco continua existindo e vale reavaliar de vez em quando: dias de trabalho
sem cópia fora daqui. Mas quem decide quando publicar é o dono do repositório,
e a resposta atual é "ainda não".

> O número não está escrito aqui de propósito. Ele já ficou errado **três
> vezes** neste documento, e a causa é sempre a mesma: um contador que muda a
> cada commit, escrito à mão, envelhece antes de o commit que o escreveu
> terminar — inclusive o commit que corrige o número anterior. O comando não
> envelhece.

O que está publicado no GitHub é anterior até à integração da busca real da
JSearch: o site de lá não conhece nem a busca, nem a Avaliação IA, nem nada de
28/08.

**Passou por revisão final**, escopada ao que nunca tinha tido gate próprio: o
`ranking.js`, a `justificativa.js` e a camada de tela toda. Ela achou três
defeitos de peso, listados nas Armadilhas abaixo, e todos foram corrigidos —
os testes foram de 111 para 120 nessa leva.

Isto era diferente na revisão anterior: um dia inteiro de trabalho vivia solto
no diretório, sem um único commit, sob risco de um `git checkout` acidental
apagar tudo. Ficou para trás — não é mais um risco a repetir.

O `.env` existe na máquina, tem chave real e está corretamente ignorado.
Agora tem **duas** chaves: `JSEARCH_API_KEY` (de sempre) e `ANTHROPIC_API_KEY`
(nova, para a Avaliação IA). O `.env.example` documenta as duas.

---

## Como testar agora

```bash
npm run dev
```

Sobe em **http://localhost:5173/vagasatalhointeligenteparati/** — repare no
caminho: o `base` do Vite aponta para o nome do repositório, então a raiz
(`localhost:5173/`) devolve 404.

```bash
npm test
```

152 testes, 11 arquivos, todos verdes. Não existia teste nenhum na revisão
anterior.

---

## Roteiro de teste no navegador — parcialmente feito

**Em 28/08 o roteiro saiu do papel pela primeira vez, e a primeira coisa que
ele encontrou foi um defeito que nenhum teste pegava: o Rank IA saía "—" em
toda vaga, nas duas abas.** A causa e a correção estão nas Armadilhas, nas duas
entradas sobre orçamento de saída — vale ler antes de mexer em qualquer chamada
à Claude.

Verificados contra a API real, na tela: **1** (currículo colado, com a
profundidade das tecnologias saindo certa), **3** (ranking na aba Vagas), **4**
(justificativa — funciona, e achou as pendências 12 e 13) e **5** (Vaga
Inteligente). Sobram **2** (pretensão) e **6** (conferir o gasto em US$), os
dois sem chamada paga e portanto baratos de fechar.

Faça na ordem. O custo total é de centavos, e cada passo depende do anterior.

**1. Currículo.** Aba Avaliação IA → cole um currículo de verdade na textarea,
ou suba um PDF. Deve aparecer a tela de conferência com cargo deduzido,
cidade, e as tecnologias com a profundidade entre parênteses — `produção`,
`projeto` ou `contato`. Custa ~US$ 0,02 por texto colado, ~US$ 0,015 por PDF.

> Se as tecnologias saírem sem a distinção de profundidade, ou se o cargo vier
> errado, o problema é o prompt de `perfil.js`, não a tela.

**2. Corrija a pretensão.** O campo vem vazio quase sempre — currículo não traz
isso. Preencha, dê F5, confirme que continuou. Custo zero.

**3. Ranking.** Aba Vagas → busque um cargo e uma cidade. A tela mostra
"Avaliando N vagas com a IA..." e a lista aparece **já pontuada** — vaga e nota
juntas, nunca a tabela primeiro e as notas depois. Ordene por Rank IA e veja se
a ordem muda. Custa 1 requisição JSearch + ~US$ 0,024.

> **Prefira uma consulta já em cache** para não gastar JSearch. A aba Controle
> mostra quais já foram feitas.

**4. Justificativa.** Abra uma vaga com nota → "Por que esta nota?". A prosa
deve citar tecnologias que estão no seu currículo. Custa ~US$ 0,008.

> **Verificado em 28/08 e funciona** — a prosa saiu concreta, citando Windows
> Server, AD e Linux do currículo e apontando o que falta. Mas achou dois
> defeitos, ambos abertos: o markdown sai cru na tela e a prosa afirma uma
> nota própria, diferente do Rank IA logo acima. Ver as pendências 12 e 13.

> Com currículo em PDF ela sai mais pobre, e isso é esperado: o texto cru não
> é guardado para PDF (ver a decisão sobre `texto_extraido` nas pendências).

**5. Vaga Inteligente.** Escolha só a cidade e busque. O cargo tem que vir do
currículo, sem você digitar. Confira na aba Controle que subiu **uma**
requisição JSearch, não duas — havia um registro falso ali que foi removido, e
esta é a verificação de que a remoção está certa.

**6. Controle.** O gasto em US$ deve bater com o que você fez, quebrado por
tipo de chamada.

**O que fazer se algo quebrar:** o console do navegador e o terminal do
`npm run dev` mostram `[claude] ->` e `[claude] <-` com o status de cada
chamada. Uma tela em branco sem essas linhas significa que nem saiu.

---

## O que funciona hoje

- **Busca real na JSearch** (OpenWeb Ninja), só em `npm run dev`. A chave vive
  no `.env` e apenas o proxy do Vite a enxerga.
- **Janela de publicação** (02/09): dropdown ao lado da cidade — Hoje, 3 dias,
  Semana, Mês, Qualquer data —, padrão **Último mês**. Corta duas vezes:
  `date_posted` na requisição e de novo na tela, porque a API aceita `week` e
  não o cumpre. Vaga sem data de publicação é descartada fora de "Qualquer
  data" — é o proxy mais próximo de "encerrada" que a resposta oferece, já que
  a API **não tem campo de expiração**. Estreitar a janela não gasta cota.
- **"Ver Vaga" na listagem** (02/09): a coluna Status deu lugar a um link
  direto para o anúncio, na tabela e no cartão estreito. Dois caminhos para a
  mesma vaga — a linha abre o detalhe interno, o ícone abre o site do
  anunciante. A URL é saneada na origem (`linkDeCandidatura`).
- **"Carregar mais vagas" na aba Vagas**, que traz a próxima página da JSearch
  e a acrescenta à lista. Desde 02/09 ele manda à Claude **só as vagas novas**,
  com as já pontuadas viajando como âncora de escala (`{cargo, nota}`, sem
  descrição). O botão escreve o próprio custo, e o texto muda conforme a
  próxima página venha do cache (de graça) ou da rede.
- **Cache paginado** (02/09): repetir uma consulta serve do `localStorage` e
  **não faz requisição**. A entrada registra as fronteiras das páginas, então
  "Buscar" devolve **uma** página e o botão serve as seguintes do cache antes
  de gastar cota. Teto de 20 consultas guardadas.
- **Página de detalhe da vaga**, com a descrição completa e o link externo.
  Voltar funciona pelo botão e pelo navegador. Abre das **duas** listas, e nas
  duas o alvo é a **linha/card inteiro**: a tabela da aba Vagas (linha toda,
  com os controles do menu se guardando por conta própria) e os cards da Vaga
  Inteligente. O título continua sendo um botão focável nas duas — é o caminho
  de teclado, já que um `div` com `onClick` não pega foco. Trocar de aba
  fecha o detalhe; sem isso ele aparecia sob o cabeçalho de outra aba.
  No topo da página há uma barra com **Voltar aos resultados** (botão fantasma,
  não mais texto solto em cinza fraco) e **Ver vaga no site original** — este
  também segue no rodapé, com o mesmo rótulo: é a mesma ação, e trocar o nome
  no meio do fluxo obrigaria a reaprender a tela. Abrir uma vaga rola para o
  topo: a rolagem da lista era herdada, e clicar numa vaga do fim abria o
  detalhe já no meio da descrição, com o cabeçalho fora da tela.
- **Combobox de cidade** com as 5.571 do IBGE, sem acento e com casamento
  exato no topo.
- **A Avaliação IA existe e funciona, ligada de ponta a ponta:**
  - Currículo em **PDF**, **.docx** ou **texto colado** numa textarea vira
    perfil estruturado numa chamada só à Claude. A dedução do cargo sai da
    mesma chamada, sem custo extra.
  - A busca — aba Vagas e aba Vaga Inteligente — ranqueia as vagas contra
    esse perfil: um lote de até **30** vagas por chamada (`TAMANHO_LOTE`), nota
    relativa ao conjunto daquele lote. Desde 02/09 a chamada roda em
    `effort: 'medium'` (`EFFORT_RANKING`); antes ia no padrão `high` da API, e
    ~90% do que era gerado era pensamento.
  - Vaga que já tem nota não é reavaliada: `ranquearPendentes` manda só as sem
    nota, ancoradas nas que têm.
  - A página de detalhe da vaga **justifica a nota sob demanda**: botão "Por
    que esta nota?", só chama a Claude quando clicado.
  - A aba **Vaga Inteligente busca de verdade** agora: deduz o cargo do
    perfil, chama a JSearch e ranqueia — não é mais casca vazia.
  - A aba **Controle mostra o gasto com a Claude**, ao lado da cota da
    JSearch: US$ por tipo de chamada, com botão de zerar. Antes só a JSearch
    tinha medidor.

## O que não funciona

- **A busca no site publicado — agora duas features mortas, não uma.**
  GitHub Pages é estático, sem proxy: nem `/api/jsearch` nem `/api/claude`
  respondem em produção (`vite.config.js` só faz esse proxy dentro do dev
  server, para as duas APIs). Antes só a busca morria fora do ar; agora a
  Avaliação IA morre junto, e adiar essa pendência ficou mais caro.
- **O caso de trocar de currículo depois de ranquear.** Nota e justificativa
  podem sair de dois perfis diferentes, sem aviso — ver "Próximo passo
  imediato".

---

## Depois do teste no navegador

**1. O proxy de produção.** Era a pendência 1 desde a revisão anterior; agora é
mais urgente, porque bloqueia duas features publicadas em vez de uma.

**2. O caso do currículo trocado — a decisão de desenho que ficou aberta.**

O aluno ranqueia com um currículo, troca de currículo **sem remover o antigo**,
e a tela passa a misturar dois perfis sem avisar. A revisão final apurou que é
pior do que parecia quando foi registrado:

- A `vaga.rank` veio do perfil antigo, e a justificativa compara com o novo —
  uma chamada **paga** cujo texto pode contradizer de frente o número acima
  dele ("Rank IA 92" com prosa explicando por que o candidato não serve).
- A ordenação padrão da tabela é por `rank`, então não é uma nota solta fora de
  lugar: é a **ordem inteira da lista** vinda de um perfil que não está mais lá.

Duas saídas, e nenhuma é um ajuste pequeno: carimbar cada nota com o
identificador do perfil que a gerou, ou invalidar `rank`/`rankMotivo` do banco
quando o currículo muda — dois `setState` no `onCv`, mais barato e mais bruto.

**3. As dívidas antigas que seguem abertas:** `no-undef` no lint (pendência 6),
o cabeçalho desatualizado do `cota.js` (7), o `docs/print.png` (9) e o
`ModalNovaVaga` sem gatilho (10). Nenhuma foi tocada nesta leva — confirmado
por `git log`, apesar de documentação anterior sugerir o contrário sobre a 6.

---

## Decisões já tomadas (não relitigar)

> **Duas linhas desta tabela foram relitigadas em 02/09 — com razão, e com
> medição.** Ficam abaixo marcadas como revistas, não apagadas: saber que uma
> decisão mudou, e por quê, vale mais que a decisão nova sozinha. Se for
> revisitar outra daqui, o padrão é este — meça antes.

| Decisão | Por quê |
|---|---|
| Cargo é texto livre; cidade é lista fechada | Cargo errado devolve resultado ruim; cidade errada não devolve nada |
| **Nenhum recorte local de cargo ou cidade** (data é exceção, ver acima) | Quem filtra é a API. O recorte por cidade saiu junto com o mock: a JSearch escreve "Caxias Do Sul" ou devolve municípios vizinhos, e nada disso bate com o rótulo exato do IBGE — comparar de novo derrubava vaga legítima. Sobrou ordenação e paginação |
| Sem filtros sobre o resultado — **exceto data** | Tecnologia, empresa, modalidade e status foram removidos de propósito. A **janela de publicação** entrou em 02/09 e é a única exceção: ela não é conveniência de tela, é o remédio para as duas queixas de vaga encerrada e vaga velha, e o corte precisa acontecer também no cliente porque a API não honra `week` |
| Status entra como "Ativa" — **mas saiu da listagem em 02/09** | O valor continua no dado e na página de detalhe, pelo motivo de sempre: veio de uma busca agora, e "Em análise"/"Encerrada" são estados do processo seletivo, sem fonte na API. O que mudou é o lugar dele na tabela: como a API não tem campo de expiração, *toda* linha mostrava a mesma pílula verde — uma coluna constante. O espaço virou o "Ver Vaga" |
| Sem router | Abas são estado local. A página de detalhe usa `pushState` sem trocar a URL — recarregar em `/vaga/123` daria 404 no Pages |
| Cota no `localStorage` | Uma cota mensal que zera no F5 não controla nada |
| As 58 vagas de mock foram apagadas | Com mock dentro não dá para saber se a API está funcionando |
| Modelo é `claude-sonnet-5`, não `claude-opus-5` | Custo questionado depois de decidido: US$ 2/US$ 10 por 1M de tokens contra US$ 5/US$ 25 do Opus. `src/custo.js` guarda os dois preços — o do Opus fica de referência histórica, não é mais usado. **Preço reconferido na fonte oficial em 02/09**: o aumento para US$ 3/US$ 15 que estava marcado para 01/09/2026 não aconteceu |
| O ranking roda em `effort: 'medium'` | Decidido em 02/09 depois de medir. Sem `effort` explícito o padrão da API é `high`, e ~90% do que era gerado era pensamento — 27s de espera para uma resposta de 250 tokens. `low` seria 5× mais rápido mas diverge o dobro do ruído e perde o pódio inteiro; `medium` corta quase metade do tempo e do custo assumindo metade do desvio. Vale só para o ranking: perfil e justificativa não foram medidos |
| "Buscar" devolve uma página; o botão devolve as seguintes | Decidido em 02/09, depois de "Buscar" trazer 27 vagas. O cache guarda a lista acumulada — necessário, senão a repetição perderia páginas já pagas —, e antes ela voltava inteira. Agora a entrada registra as fronteiras das páginas |
| Ranking em lote (perfil + N vagas, uma chamada) | Decisão antiga (era a pendência 3), agora implementada em `ranking.js`: currículo viaja uma vez, a saída cara encolhe para `{id, nota, motivo}`. Lote de 12 (`TAMANHO_LOTE`); nota **relativa ao conjunto** do lote, não porcentagem absoluta |
| `.doc` não é mais aceito no upload | Sem servidor não há como abrir Word binário (formato OLE) no navegador. Uma textarea de colar texto cobre `.doc`, `.odt`, exportação do LinkedIn e qualquer outro formato — `.pdf` e `.docx` continuam indo por upload de arquivo |
| ~~"Carregar mais" reranqueia tudo~~ — **revisto em 02/09** | Era: lote menor que a lista a partiria em escalas independentes (medido: 9,1 pontos de diferença média), e "reranquear junto custa quase o mesmo, continua uma chamada". **As duas metades caíram.** O custo: a segunda chamada custou 41% mais que a primeira (10.086 → 17.668 tokens), e numa sessão de três cliques o sobrecusto era de 102%. A premissa: os 9,1 pontos foram medidos sem piso de ruído — duas chamadas *idênticas* divergem 6,8, então o dano do fatiamento era ~2,3, não 9,1. E a condição "enquanto couber em `TAMANHO_LOTE`" se quebrava no 3º clique, quando 40 vagas viram dois lotes e as escalas se misturavam de qualquer jeito. Hoje só as vagas novas viajam, com âncora de escala |
| `TAMANHO_LOTE` continua 30 | O teto por chamada segue valendo; o que mudou é que a lista raramente chega perto dele, porque cada "Carregar mais" só manda a página nova |
| O trabalho fica só na máquina local, sem push | Decidido em 28/08. O `origin/main` segue anterior à busca real da JSearch, e publicar é escolha do dono do repositório — não faça por iniciativa própria ao ler o aviso de risco acima |
| A tela acumula resultados em vez de paginar contra a API | O cursor do `search-v2` só anda para frente: não existe "cursor anterior" para pedir. Uma paginação real exigiria guardar cada página para poder voltar; acumular resolve o mesmo problema sem esse estado |
| A faixa da nota (`min`/`max`) saiu do schema Zod e foi para `validarNotas` | A saída estruturada da Claude não suporta essas restrições — ver "Armadilhas conhecidas" |
| A lista espera o ranking: vaga e nota aparecem juntas | Era o contrário — a tabela vinha em ~2s e as notas caíam em cima dela depois. Lia como defeito: lista pronta, coluna Rank IA vazia, nada dizendo que ainda vinha coisa. O custo aceito é a espera subir para ~25s, e é por isso que a fase é **nomeada** ("Consultando a API de vagas..." → "Avaliando N vagas com a IA...") — espera longa e muda seria o mesmo problema por outro caminho. Quem decide é `faseDaBusca` em `src/fase.js` |
| Quem espera é a tela, não o dado | O `banco` continua recebendo as vagas antes do ranking; só a tabela é que aguarda. É isso que mantém a degradação de graça: ranking que falha, que volta parcial, ou que nem roda por falta de currículo cai no `finally`, e a lista aparece com o que tiver. Uma lista que já custou uma das 200 requisições da JSearch nunca fica refém de uma chamada à Claude que deu errado |

---

## Pendências acumuladas

**Fechadas desde a revisão anterior** (eram as pendências 3, 4, 5 e 8):

- **3. Comparação currículo × vaga**, para preencher o Rank IA. Implementada em
  `src/api/ranking.js` como o desenho previa: uma chamada por lote, com o
  perfil + N vagas, devolvendo `{id, nota, motivo}`. Duas correções sobre o
  plano original, registradas porque mudaram de rumo: o lote acabou em **12**
  vagas (`TAMANHO_LOTE`), não "10 a 15"; e a nota é 0–100 **relativa ao
  conjunto do lote**, não os "percentuais absolutos" do plano — a tela escreve
  "Rank IA 87", nunca "87%", porque a mesma vaga contra outro lote daria outro
  número. O ganho de custo medido ficou em ~3,5×, não os ~4× estimados no
  desenho original.
- **4. Dedução do cargo a partir do currículo.** Saiu de graça: o mesmo
  `perfil.js` que extrai o currículo devolve `cargo_deduzido` na mesma
  chamada, sem chamada extra à Claude.
- **5. Medidor de consumo da Claude.** A aba Controle agora mostra o gasto em
  US$, por tipo de chamada, ao lado da cota da JSearch (commit `4dc6e63`).
- **8. Vaga Inteligente registrava cota sem tocar a API.** Corrigido: o clique
  só conta como uso quando a requisição de fato sai. `buscarInteligente()` em
  `App.jsx` chama `registrarUso(termo, cidadeAlvo, 'rede', vagas)` depois do
  `buscarVagas` de verdade, do mesmo jeito que `buscar()` já fazia na aba
  Vagas — não é mais um número inventado.

**Da integração (seguem abertas):**

1. **Proxy de produção.** Sem isso o site publicado nunca busca — nem JSearch
   nem Claude. Mais urgente que antes: agora bloqueia **duas** features, não
   uma. Uma função serverless (Cloudflare Workers, Vercel, Netlify) guardando
   as duas chaves.
2. **Conferir os demais campos** contra dado real — salário e
   `job_salary_period` ainda não foram vistos numa resposta de verdade.

**Achadas em 28/08, no primeiro teste real da justificativa (pendências 12 e
13 — as duas na mesma tela, e a segunda é a mais séria):**

12. **O markdown da justificativa sai cru.** A Claude devolve prosa com
    `**negrito**`, e a tela imprime os asteriscos literalmente: o aluno lê
    "`**Nota: 84 — Muito bom**`". A instrução em `justificativa.js` não proíbe
    markdown, e a tela não o interpreta — as duas pontas precisam concordar.
    Duas saídas: pedir texto puro na instrução, ou renderizar o markdown.

13. **A justificativa afirma uma nota própria, que contradiz o Rank IA na
    mesma tela.** Visto: crachá "Rank IA 78 · Bom" e, dois centímetros abaixo,
    "Nota: 84 — Muito bom". Não é bug de exibição: a instrução de ranking
    manda "devolva o número e a faixa", e a justificativa é uma **chamada
    separada**, que pontua de novo sem ver a nota do lote — e a nota do lote é
    relativa ao conjunto daquela busca, então os dois números nem são da mesma
    escala. O ONDE-PARAMOS já previa "prosa que contradiz o número acima dele"
    para o caso do currículo trocado; aqui acontece com **um perfil só**.
    A saída provável é a justificativa receber a nota já dada e ter de
    explicá-la, em vez de produzir outra.

**Mapeadas em 02/09, medidas, e deliberadamente não feitas:**

- **12. Mostrar a lista antes do ranking terminar.** É a de maior retorno que
  sobrou, e **não custa qualidade nenhuma**: a JSearch responde em ~2s, o
  ranking leva mais 7 a 19. Hoje a tabela espera as duas etapas de propósito
  (ver a decisão "a lista espera o ranking", e o `fase.js:10`, que já registra
  o preço). A saída é a coluna Rank IA carregando **por linha**, em vez de
  bloquear a tela toda — resolve o problema original (a coluna ficava em "—"
  sem avisar que ainda vinha coisa) sem o preço. **Reverte uma decisão
  registrada, então é escolha do dono.**
- **13. Cortar a descrição da vaga antes de mandar à Claude.** 77% da entrada
  do ranking são descrições, e boa parte é texto que a própria
  `INSTRUCAO_PADRAO` manda ignorar — uma descrição medida tinha 6.561
  caracteres terminando em política de uniforme e escala de turno. Cortar em
  1.500 tira **40% da entrada**. Não feito porque **só medi tokens, não
  qualidade**: falta rodar a mesma comparação de notas que o `effort` teve,
  com `high` duas vezes para estabelecer o piso de ruído.
- **14. `JSON.stringify(x, null, 2)` no `pontuarLote`** gasta **356 tokens só
  em indentação**. Tirar o `null, 2` é risco zero.
- **15. Dois lotes em paralelo cortariam o tempo pela metade.** A nota do
  `ranking.js` rejeitou o fatiamento citando 9,1 pontos de divergência, mas o
  ruído entre duas chamadas iguais é 6,8 — o dano real é ~2,3. A advertência é
  bem mais fraca do que o comentário faz parecer, e vale reler antes de
  descartar a ideia.
- **16. Avisar na tela quando a lista passa do `TAMANHO_LOTE`.** Acima de 30
  vagas o `emLotes` parte em lotes de escalas independentes, e a coluna Rank IA
  passa a misturar réguas **em silêncio**. Hoje é raro (cada "Carregar mais" só
  manda a página nova), mas continua possível numa busca única muito grande.

**Dívidas menores:**

6. **`npm run lint` não pega variável inexistente.** Segue como estava: o
   `.oxlintrc.json` não mudou desde o commit inicial do protótipo — só liga
   `react/rules-of-hooks` e `react/only-export-components`. `no-undef` com
   `env` resolveria; não foi feito.
7. **O cabeçalho do `cota.js` está desatualizado.** Continua descrevendo um
   mundo em que "o `buscar()` não chega à rede" — não é verdade desde a
   integração da JSearch, e já não era na revisão anterior.
9. `docs/print.png` segue desatualizado — ainda é de 21/08, agora anterior a
   **duas** integrações inteiras (busca real e Avaliação IA), não uma.
10. `ModalNovaVaga` existe no `App.jsx` e **nenhum botão o abre**. Confirmado
    de novo: `setModalAberto(true)` só aparece dentro de um comentário, nunca
    em código executável.
11. **`App.jsx` encolheu, e voltou a crescer.** Eram 3.628 linhas, caíram para
    3.013 com a extração dos painéis, e o trabalho de 02/09 as levou de volta
    a **3.708** — o número aqui já envelheceu duas vezes, então confira com
    `wc -l src/App.jsx` em vez de acreditar nele. Dois painéis
    (`PainelIA.jsx`, `PainelVagaInteligente.jsx`), um campo de cidade
    (`CampoCidade.jsx`) e dois avisos compartilhados (`AvisoErro`,
    `Carregando`, em `comuns.jsx`) saíram para `src/paineis/`. Sobrou o
    resto: a página de detalhe da vaga e a maior parte do estado de topo
    continuam no arquivo principal.

---

## Armadilhas conhecidas

- **`date_posted=week` é aceito e ignorado.** A API ecoa o parâmetro em
  `parameters` e responde 200, mas em 02/09 devolveu vaga de 26 dias e cinco
  sem data — praticamente o mesmo conjunto do `all`. `today`, `3days` e `month`
  filtram de verdade. **Não simplifique o `janela.js` confiando no
  `date_posted`**: o corte local não é redundância, é o portão que funciona.
- **A API não tem campo de expiração.** A união dos campos de uma resposta de
  10 vagas dá 35 nomes e nenhum é de validade. Não existe como perguntar se o
  anúncio caiu — o `status: 'Ativa'` fixo do `mapear.js` não é preguiça, é a
  única coisa honesta disponível. O proxy que se usa é idade desconhecida.
- **O cache guarda a lista acumulada, não a primeira página.** `carregarMais`
  grava `[...banco, ...novas]` sob a **mesma chave** da busca — e tem que ser
  assim, senão a próxima repetição perderia páginas já baixadas e pagas. Quem
  mexer em `buscar()` precisa lembrar de restaurar só a primeira fatia
  (`proximaPagina(entrada, 0)`): a versão que fazia `setBanco(guardado.vagas)`
  devolvia 27 vagas numa busca, e mandava as 27 para a Claude.
- **Medição feita com a chave do projeto entra na fatura, mas não no medidor.**
  A aba Controle só conta o que o app gastou. Onze chamadas de teste por fora
  somaram US$ 0,43 na mesma chave em 02/09 — 40% do total — e fizeram o
  dashboard da Anthropic parecer o dobro do custo real por busca. Ao comparar
  os dois números, filtre por requisição, não por total.
- **A nota do ranking É relativa ao lote — medido, não suposto.** O cabeçalho
  do `ranking.js` afirmava isso desde o desenho, e havia motivo para duvidar:
  a instrução de avaliação define faixas absolutas ("Excelente, Muito bom,
  Bom, Regular, Baixo"), o que sugeriria notas comparáveis. **A medição deu
  razão ao comentário.** As mesmas 10 vagas reais, ranqueadas num lote só e
  partidas em dois de 5: diferença média de **9,1 pontos**, máxima de **14**, e
  o primeiro lugar **trocou** — a melhor vaga caiu de 80 para 66 e outra, de
  lote diferente, assumiu com 72. O padrão explica o mecanismo: as 5 do lote
  mais fraco subiram **todas** (+6 a +10), porque avaliadas só contra si mesmas
  são graduadas na curva.

  Consequência prática: **lista maior que `TAMANHO_LOTE` ordena errado por
  Rank IA.** É por isso que o lote subiu para 30 e que "Carregar mais"
  reranqueia a lista inteira em vez de só as vagas novas — uma chamada só, e
  todas as notas da mesma comparação. Passando de 30 o fatiamento volta e o
  problema com ele.

- **O cursor da JSearch mora em `data.cursor`, não no topo da resposta.** A
  documentação nomeia o campo mas não diz o nível, e o topo era o palpite
  natural. Conferido contra a resposta real: `{status, request_id, parameters,
  data: { jobs, cursor }}`. Errar aqui não daria erro nenhum — daria uma
  paginação que nunca avança, calada. `cursorDaResposta` aceita os dois
  níveis de propósito.

- **`max_tokens` inclui o pensamento, e o modelo pensa sem você pedir.** Esta
  é a que custou o Rank IA inteiro. O `claude-sonnet-5` roda thinking
  *adaptive* por padrão — não existe parâmetro nenhum ligando isso no código,
  então lendo só o código não dá para saber que existe. E o pensamento sai do
  **mesmo** orçamento da resposta visível. Medido na resposta real de um lote
  de 10 vagas: **1.476 tokens de pensamento** para 796 caracteres de JSON,
  contra um `max_tokens` de 2.000. Cabia por 112 tokens numa chamada e não
  cabia na seguinte — a saída vinha cortada no meio de uma string, o lote
  morria inteiro e a tela mostrava "—". Hoje o teto é a constante `MAX_TOKENS`
  (16.000) em `claude.js`, usada pelas três chamadas. Folga não custa: o teto
  é limite, não reserva, e só se paga o que for gerado. Quem quiser regular o
  custo do pensamento mexe em `output_config.effort`, não neste teto.

- **O que você manda o modelo repetir de volta, você paga como saída.** O
  `job_id` da JSearch é base64 de **402 caracteres**. O ranking pedia esse id
  de volta para cada uma das 12 vagas do lote: ~1.930 tokens de saída só
  ecoando identificador, contra os 2.000 de teto. Nem com o teto correto isso
  se justificaria — é pagar preço de saída (US$ 10/1M) por lixo. Hoje o lote
  manda um `ref` posicional (0, 1, 2) e traduz de volta para o id dentro de
  `pontuarLote`; a saída encolheu **7×**. Se um dia o ref virar id de novo,
  este é o defeito que volta.

  > O `ref` é posicional **dentro do lote**, e a segunda volta remonta um lote
  > só com quem faltou — lá o ref 0 já é outra vaga. A tradução tem que ficar
  > dentro de `pontuarLote`, nunca acima dela.

- **Mock de dado pequeno esconde defeito de tamanho.** Os dois defeitos acima
  passaram por 120 testes verdes, revisão final e `npm run build`. Nenhum
  podia pegá-los: todos os testes usavam id de dois caracteres (`a1`, `v10`),
  e os dois defeitos só existem em função do tamanho real do dado. Quando o
  valor de produção tem ordem de grandeza diferente da do mock — id, texto,
  lote —, o teste com o valor pequeno não é evidência sobre o grande. O teste
  novo em `ranking.test.js` usa um id de 402 caracteres justamente por isso.

- **Um lote que falha não pode levar junto os que já foram pagos.** O
  `pontuarTodos` não tinha `try`/`catch` por lote: uma falha no segundo lote
  fazia o `ranquear` rejeitar inteiro, e as notas do primeiro — **já cobradas**
  — sumiam sem chegar à tela. O gatilho mais provável era o próprio teto de
  custo, que é conferido a cada lote. Corrigido, com teste. Ao mexer no
  `ranking.js`, mantenha isto: dinheiro já gasto tem que virar resultado na
  tela.

- **Histórico truncado não serve de base para teto.** O `custo.js` guarda as
  200 chamadas mais recentes, e o teto somava só esse anel. Com o Opus, 200
  chamadas passavam dos US$ 5 antes de o anel girar; **com o Sonnet não
  passam** — a partir da 201ª o total podia *cair* e o teto nunca disparar. A
  troca de modelo feita para economizar foi o que colocou o defeito ao
  alcance. Hoje existe um acumulado separado que não gira; o anel serve só ao
  histórico da tela.

- **Texto de tela envelhece com o código, e meia correção é pior que
  nenhuma.** O rótulo do Rank IA sem nota já mentiu duas vezes: dizia "a
  comparação ainda não roda" depois que ela passou a rodar, e depois "a
  comparação rodou" — falso sem currículo (o ranking nem dispara) e durante o
  próprio ranking. Agora ele sai do estado da tela, com três casos
  condicionados. Se acrescentar um quarto, condicione também: afirmar
  categoricamente ali é o erro que se repete.

- **Quem para a propagação é o chamador, não o componente — e embrulhar de
  novo quebra.** Quando a linha da tabela virou clicável, os quatro controles
  dentro dela (menu, Ver detalhes, Favoritar, Arquivar) precisavam parar de
  vazar o clique para a linha. Parecia trabalho a fazer dentro da `Linha`; não
  era. Os handlers já chamavam `e.stopPropagation()` **no chamador**, em
  `App.jsx`, por causa do listener de documento que fecha o menu — e em React
  parar no filho já impede o `onClick` do ancestral, então o guarda que
  existia era exatamente o que faltava.

  Embrulhar dentro da `Linha` (`onClick={(e) => { e.stopPropagation();
  onMenu() }}`) além de redundante **lança**: `onMenu`, `onFavorito` e
  `onArquivar` chamam `e.stopPropagation()` sem `?.`, e invocá-los sem evento
  dá `TypeError`. Só `onAbrir` tolera, porque tem o `?.` — posto ali para o
  caminho do título. Antes de "proteger" um handler, leia o que o chamador já
  faz com o evento.

- **Props não são conferidas por nada.** JavaScript não confere props: uma
  chamada de componente com props novas e a definição ainda com as antigas
  passa limpo em `npm test` **e** em `npm run build` — só quebra na tela.
  Aconteceu duas vezes nesta obra; o caso mais claro foi `ResultadoInteligente`
  chamado com `{vagas, ranqueando}` enquanto a definição ainda esperava
  `{cidade, bancoVazio}`. Depois de mexer na assinatura de um componente,
  confira cada chamador — visualmente, não só rodando os testes.
- **Restrição de schema Zod não chega à API como restrição.** `min`/`max` em
  número e `max` em string não são suportados pela saída estruturada da
  Claude: o `zodOutputFormat` não os descarta, **serializa** para dentro da
  `description` do campo (`z.number().int().min(0).max(100)` vira
  `{"type":"integer","description":"{minimum: 0, maximum: 100}"}`), e o SDK
  ainda revalida a resposta contra o schema do lado do cliente — de forma
  **tudo-ou-nada**. Uma nota fora da faixa derrubava o lote inteiro de notas
  boas (`ranking.js`, corrigido no commit `f152848`: a faixa foi para dentro
  de `validarNotas`, que filtra por item). `integer` **é** suportado e
  continua valendo — é imposto na geração, não revalidado depois.
- **Medir vence a documentação.** Duas vezes nesta obra o raciocínio a partir
  da doc do SDK levou à conclusão errada sobre o caso acima, e só rodar
  `zodOutputFormat` contra o SDK instalado e olhar o schema gerado mostrou o
  que realmente acontece. Se a decisão depende do comportamento de uma
  biblioteca, rode o código — não deduza da documentação.
- **Renomeou função? Procure os chamadores.** `registrarBusca` → `registrarUso`
  quebrou uma aba inteira e o lint não avisou. `grep -n "nomeAntigo" src/` antes
  de dar a mudança por encerrada.
- **Nomes de campo da API: confira, não deduza.** Já custou duas colunas
  vazias. `job_is_remote` não existe; o certo é `work_arrangement`.
- **E o nome do *parâmetro* não é o nome do *campo*.** Ao montar o filtro de
  modalidade, o palpite óbvio era mandar `work_arrangement` na requisição —
  seria 400, e 400 debita cota. A doc (`openwebninja.com/api/jsearch/docs`)
  lista o que o `/search-v2` aceita: `query`, `cursor`, `num_pages`,
  `country`, `language`, `date_posted`, **`work_from_home`**,
  `employment_types`, `job_requirements`, `radius`,
  `exclude_job_publishers`, `fields`. Não há filtro de modalidade — há um
  booleano de "só remotas".
- **Deixe a tela ter a forma que a API tem.** O filtro de modalidade nasceu com
  quatro opções (Todas/Remoto/Híbrido/Presencial) e um comentário longo
  explicando por que só uma delas virava parâmetro. Com duas — Remoto e
  Presencial —, a assimetria não precisou ser administrada: **sumiu**. O
  `modalidade.js` encolheu de dois campos que precisavam concordar (`api` e
  `local`) para um só (`remotas`), que é ao mesmo tempo o valor de
  `work_from_home` e o lado do corte local.
- **Sem um "Todas", filtro tem que particionar.** "Presencial" é definido como
  *o complemento de Remoto*, não como igualdade — senão a híbrida e a vaga sem
  `work_arrangement` não teriam opção nenhuma que as mostrasse, e sumiriam da
  tela em silêncio. O preço é uma híbrida aparecer rotulada "Presencial";
  escondê-la seria pior. O teste que trava isso é o de partição: as duas
  opções somadas devolvem a lista inteira.
- **"Base única" era o bug.** A aba Banco de Dados não acumulava porque as duas
  abas liam o mesmo estado `banco`, e `buscar()` o **substitui**. Buscar em
  Porto Alegre depois de Caxias do Sul deixava só Porto Alegre — reproduzido em
  2026-09-03: 10 linhas, depois 10 de novo, nunca 20. Corrigido separando as
  listas: `banco` é a busca corrente, `acervo.js` é a coleção. Dois efeitos
  colaterais morreram junto: o `setBanco([])` do caminho de erro esvaziava a
  tela num 504, e nada reidratava do storage.
- **Dá para oferecer uma janela que a API não tem.** "Últimos 15 dias" não
  existe no enum do `date_posted` (all, today, 3days, week, month) — mandá-lo
  seria 400, que debita cota. Funciona porque o `janela.js` sempre teve dois
  portões: pede-se `month`, a janela mais estreita que **contém** 15 dias, e o
  corte local faz o recorte real. O desenho que existia porque a API não cumpre
  a janela prometida passou a servir para estender o que ela oferece.
  Consequência: `valor` (tela) e `api` (requisição) viraram campos separados, e
  quem traduz é o `apiDaJanela`. Nenhum outro módulo pode mandar a janela crua
  para a API.
- **Duas coisas que fazem a mesma requisição dividem a mesma chave de cache.**
  Terceira vez que essa regra aparece: modalidade (só 'remoto' muda o pedido),
  janela ("Último mês" e "Últimos 15 dias" mandam ambas `month`). A chave existe
  para distinguir **requisições**, não rótulos de tela — e como `api === valor`
  nas janelas antigas, as chaves gravadas seguem sendo achadas.
- **Copiar a forma sem o motivo é cargo cult.** A barra da aba Vagas adia com
  um botão "Buscar" porque cada busca custa uma das 200 do mês. O filtro do
  acervo é local: adiar não protegeria nada. Ficou sem botão e recorta a cada
  tecla — mesma aparência, comportamento certo (`filtroAcervo.js`).
- **Dropdown de valor fechado sai do dado, não de uma lista canônica.** A cidade
  da aba Vagas é a lista do IBGE porque a API exige o rótulo exato. No acervo
  isso erraria calado: lá dentro convivem "Caxias do Sul, RS" e "Porto Alegre,
  Rio Grande do Sul" — o `job_state` da API vem ora sigla, ora por extenso —, e
  escolher "Porto Alegre, RS" no IBGE não acharia nada. Os seletores do acervo
  são montados do próprio acervo. O `CampoCidade` virou reusável para isso: a
  lista entra por prop (`cidades`), e omitida cai no IBGE — **a interação é a
  mesma nas duas abas, a fonte é que muda**. Cada item pode ser string ou
  `{ rotulo, nota }`; a nota sai entre parênteses na sugestão (o acervo põe a
  contagem de vagas) e é **só exibição**: fora do índice de busca, para digitar
  "8" não trazer as cidades com 8 vagas, e fora do `onEscolher`, para o valor
  continuar casando com o campo `cidade` do dado. O índice do IBGE continua sendo
  montado uma vez no módulo; a lista injetada é indexada sob demanda, porque
  quem injeta passa dezenas de itens e não 5.571.
- **Casar acento é filtro que erra em silêncio.** O acervo tem "Tecnico de TI" e
  "Técnico Em TI" lado a lado, de duas buscas diferentes. Normalize com
  `normalize('NFD').replace(/[̀-ͯ]/g,'')` antes de comparar — e
  escreva a faixa com escapes, porque combinantes literais grudam no colchete
  anterior em qualquer editor.
- **Antes de desenhar filtro, conte o dado.** Salário e techs pareciam campos
  óbvios para filtrar; medindo, 0 de 35 vagas têm salário e `techs` é sempre
  `[]` no `mapear.js`. Dois filtros que nunca recortariam nada, evitados por
  uma consulta ao localStorage.
- **Separou lista? Passe no `acharVaga`.** Dividir `banco` e `acervo` quebrou a
  página de detalhe da aba Banco de Dados na hora: `acharVaga` olhava só
  `banco` e `vagasIa`, então clicar em "Ver detalhes" marcava a vaga como lida
  e não abria nada — a vaga estava na tela, na frente de quem clicou. O
  `detalhe.js` é o ponto único onde "o que a tela mostra" e "o que o detalhe
  encontra" se reconciliam; **toda lista que vira linha na tela precisa passar
  por ele**, ou vira página em branco. O comentário do `App.jsx` já advertia
  disso para a `vagasIa` — e o aviso não impediu a repetição com a lista nova.
- **Cache e acervo têm tempos de vida diferentes.** Dava para derivar o acervo
  somando as chaves do `cota.cache`, mas o cache é descartável por natureza —
  "Limpar cache" é a ferramenta de quem precisa de espaço. Derivado, liberar
  espaço apagaria o histórico. Stores separados.
- **Mesclar tem que preservar o que é do usuário.** Rebuscar traz as vagas com
  `fav: false` e `rank: null`, porque é assim que saem do `mapear.js`.
  Sobrescrever cegamente apagaria favorito e nota já paga, sem erro na tela.
- **Teto no acervo não é opcional.** `localStorage` dá ~5 MB e o `gravar`
  engole `QuotaExceededError` — sem teto, o acervo pararia de crescer em
  silêncio. Medido: 2,7 KB/vaga, 66% disso é a `descricao`. Teto de 500 ≈ 1,3 MB.
- **A chave de cache sem sufixo é o que salva o que já foi pago.**
  "Presencial" não põe sufixo, então cai na mesma chave que as buscas
  gravadas antes desta funcionalidade existir. Fosse o contrário, o primeiro
  deploy transformaria todas as entradas do cache em órfãs — jogando fora, em
  silêncio, requisições já debitadas das 200.
- **Cache mascara mudanças no mapeamento.** Depois de mexer no `mapear.js`, uma
  busca repetida volta do cache **com o mapeamento antigo**. Limpe o cache na
  aba Controle ou busque outra coisa.
- **Nunca renomear `JSEARCH_API_KEY` para `VITE_JSEARCH_API_KEY`** — isso
  publica a chave em `dist/assets/*.js`.
- **Nem todo erro consome cota.** Chave ausente e 401 não; 429 e 200-sem-
  resultado sim. Quem sabe a diferença é o `tocouApi` do `ErroJSearch`.
- O protótipo já teve **58 vagas fictícias atribuídas a empresas reais** da
  Serra Gaúcha. Foram removidas, mas se voltar a inventar dados, lembre que o
  site é público.

---

## Comandos

```bash
npm run dev        # a busca e a Avaliação IA só funcionam aqui — porta 5173, caminho /vagasatalhointeligenteparati/
npm test           # vitest — 290 testes, 16 arquivos
npm run lint       # oxlint (não pega no-undef hoje; veja a pendência 6)
npm run build      # gera dist/
npm run cidades    # regenera src/data/cidades.js a partir do IBGE
```
