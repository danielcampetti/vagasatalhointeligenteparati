# Onde paramos — 28/08/2026

Retomada rápida do protótipo VAGAS. O **README.md** explica *como as coisas
funcionam*; este arquivo diz *em que pé estão* e *o que fazer a seguir*.

> **Revisado em 27/08/2026.** Cada afirmação abaixo foi conferida contra o
> código — `wc -l`, `npm test`, `git log` — não contra a memória. Este arquivo
> foi escrito quando a Avaliação IA não existia; ela existe agora, então quase
> tudo abaixo mudou. Onde algo mudou de rumo, o texto registra o que era antes
> e por que mudou, não só o estado novo.

---

## Estado do repositório

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

**Nada disso está no remoto, e este é o risco mais fácil de eliminar aqui.** O
`main` local está **57 commits à frente do `origin/main`**
(`git rev-list --count origin/main..main` — número com o comando ao lado, para
não envelhecer calado). O que está publicado no GitHub é anterior até à
integração da busca real da JSearch: o site de lá não conhece nem a busca, nem
a Avaliação IA, nem nada de 28/08.

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
- **"Carregar mais vagas" na aba Vagas**, que traz a próxima página da JSearch
  e a acrescenta à lista. A paginação local que já existia no rodapé passa a
  ter o que paginar. O botão só aparece enquanto houver próxima página, e
  escreve o próprio custo: 1 das 200 requisições + ~US$ 0,03 de reavaliação.
- **Cache que economiza cota de verdade**: repetir uma consulta serve do
  `localStorage` e **não faz requisição**. Teto de 20 consultas guardadas.
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
    esse perfil: um lote de até 12 vagas por chamada, nota relativa ao
    conjunto daquele lote.
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

| Decisão | Por quê |
|---|---|
| Cargo é texto livre; cidade é lista fechada | Cargo errado devolve resultado ruim; cidade errada não devolve nada |
| **Nenhum recorte local: nem cargo, nem cidade** | Quem filtra é a API. O recorte por cidade saiu junto com o mock: a JSearch escreve "Caxias Do Sul" ou devolve municípios vizinhos, e nada disso bate com o rótulo exato do IBGE — comparar de novo derrubava vaga legítima. Sobrou ordenação e paginação |
| Sem filtros sobre o resultado (tecnologia, empresa, modalidade, status) | Removidos de propósito |
| Status entra como "Ativa" | Veio de uma busca agora. "Em análise"/"Encerrada" são estados do processo seletivo, sem fonte na API |
| Sem router | Abas são estado local. A página de detalhe usa `pushState` sem trocar a URL — recarregar em `/vaga/123` daria 404 no Pages |
| Cota no `localStorage` | Uma cota mensal que zera no F5 não controla nada |
| As 58 vagas de mock foram apagadas | Com mock dentro não dá para saber se a API está funcionando |
| Modelo é `claude-sonnet-5`, não `claude-opus-5` | Custo questionado depois de decidido: US$ 2/US$ 10 por 1M de tokens contra US$ 5/US$ 25 do Opus. `src/custo.js` guarda os dois preços — o do Opus fica de referência histórica, não é mais usado |
| Ranking em lote (perfil + N vagas, uma chamada) | Decisão antiga (era a pendência 3), agora implementada em `ranking.js`: currículo viaja uma vez, a saída cara encolhe para `{id, nota, motivo}`. Lote de 12 (`TAMANHO_LOTE`); nota **relativa ao conjunto** do lote, não porcentagem absoluta |
| `.doc` não é mais aceito no upload | Sem servidor não há como abrir Word binário (formato OLE) no navegador. Uma textarea de colar texto cobre `.doc`, `.odt`, exportação do LinkedIn e qualquer outro formato — `.pdf` e `.docx` continuam indo por upload de arquivo |
| `TAMANHO_LOTE` é 30, e "Carregar mais" reranqueia tudo | Lote menor que a lista a partiria em escalas independentes — medido: 9,1 pontos de diferença média e troca de primeiro lugar. Reranquear junto custa quase o mesmo (continua uma chamada) e devolve uma coluna Rank IA que de fato ordena |
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
11. **`App.jsx` encolheu, mas ficou parcial.** Eram 3.628 linhas; são
    **3.013** agora (`wc -l src/App.jsx`, conferido). Dois painéis
    (`PainelIA.jsx`, `PainelVagaInteligente.jsx`), um campo de cidade
    (`CampoCidade.jsx`) e dois avisos compartilhados (`AvisoErro`,
    `Carregando`, em `comuns.jsx`) saíram para `src/paineis/`. Sobrou o
    resto: a página de detalhe da vaga e a maior parte do estado de topo
    continuam no arquivo principal.

---

## Armadilhas conhecidas

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
npm test           # vitest — 152 testes, 11 arquivos
npm run lint       # oxlint (não pega no-undef hoje; veja a pendência 6)
npm run build      # gera dist/
npm run cidades    # regenera src/data/cidades.js a partir do IBGE
```
