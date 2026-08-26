# Avaliação IA — desenho

**26/08/2026.** Este documento fixa o desenho da Avaliação IA: como o currículo
entra, o que fica guardado, e como as vagas ganham nota. Não é plano de
implementação — é a decisão sobre o que construir e por quê.

---

## 1. Escopo

Ligar a Claude ao protótipo para preencher o **Rank IA** e a aba **Vaga
Inteligente**, hoje ambos apenas casca.

**Funciona só em `npm run dev`**, como a busca do JSearch. Decidido de propósito:
o site publicado é estático e não tem onde esconder chave. Uma função serverless
que sirva as duas chaves continua pendente e está fora deste escopo.

Consequências diretas dessa escolha, que moldam todo o resto:

- A extração do currículo acontece **no navegador**. Não há servidor para
  processar arquivo.
- **`.doc` sai da lista de formatos.** Word binário pré-2007 não tem extração
  viável no navegador. Entra uma textarea de "cole o texto do seu currículo",
  logo abaixo do dropzone na aba Avaliação IA, que cobre `.doc`, `.odt`,
  exportação do LinkedIn e qualquer outro formato.
- Formatos aceitos: **PDF**, **`.docx`** e **texto colado**. O `accept` do input
  passa a ser `.pdf,.docx`.

### As três entradas, dois caminhos

| entrada | como vira texto | o que vai para a Claude |
|---|---|---|
| `.docx` | `mammoth`, no navegador | bloco de texto |
| texto colado | já é texto | bloco de texto |
| PDF | — | bloco `document` em base64 |

`.docx` e texto colado seguem o **mesmo caminho** depois da extração, então o
`mammoth` não cria um terceiro fluxo — ele alimenta o que a textarea já usa.
Só o PDF é especial, porque a Claude o lê nativamente e isso cobre currículo
escaneado, que nenhuma biblioteca de navegador extrai.

### Fora de escopo

- Proxy de produção e o site publicado funcionando.
- Extração de tecnologias da descrição da vaga para a coluna `techs`.
- Qualquer coisa que exija servidor.

### Sem currículo, nada quebra

A busca da aba Vagas continua funcionando sem currículo nenhum: as vagas
aparecem e a coluna Rank IA mostra "—", como já mostra hoje. O ranking é um
enriquecimento, não um pré-requisito. Só a Vaga Inteligente exige currículo,
porque é dele que sai o cargo.

---

## 2. Arquitetura

### 2.1 O proxy

`vite.config.js` ganha um segundo alvo ao lado do `/api/jsearch`:

```
/api/claude/*  →  https://api.anthropic.com/v1/*
```

O `proxyReq` **sobrescreve** o header `x-api-key` com o valor de
`ANTHROPIC_API_KEY` lido do `.env` pelo `loadEnv`. O SDK já envia
`anthropic-version: 2023-06-01` por conta própria; o proxy não duplica isso.

O `guardaDeChave`, que hoje conhece uma chave só, passa a receber qual chave
guarda e qual prefixo protege — mesma função, dois usos. Como hoje: sem chave, a
requisição é cortada antes de sair da máquina e a tela diz o que fazer.

`ANTHROPIC_API_KEY` **nunca** com prefixo `VITE_`. A armadilha é a mesma já
documentada para o JSearch, com consequência pior: a chave do JSearch tem teto
de 200 requisições por mês, a da Claude é cobrada por token sem teto nenhum.

O `.env.example` ganha a variável, com o mesmo aviso.

### 2.2 Como chamar

SDK oficial `@anthropic-ai/sdk`, apontado ao proxy:

```js
new Anthropic({
  baseURL: '/api/claude',
  apiKey: 'via-proxy',        // falsa: quem injeta a real é o vite.config.js
  dangerouslyAllowBrowser: true,
})
```

`dangerouslyAllowBrowser` existe para impedir que se coloque uma chave real no
bundle. Aqui a chave não está no bundle — está no processo Node do dev server.
**Isso precisa estar comentado no código**, senão alguém "conserta" um dia.

O que o SDK entrega e que não vale reescrever à mão: erros tipados
(`RateLimitError`, `BadRequestError`, `APIError`), retry, e `messages.parse()`,
que valida a saída estruturada contra o schema. Custo: ~100 KB no bundle.

**Modelo:** `claude-opus-5`, num só lugar (`src/api/claude.js`). Pensamento
adaptativo é o padrão nesse modelo e fica como está. `output_config.effort`
começa no padrão (`high`); baixar para `medium` é uma linha, mas só depois de
medir se as notas mudam.

Sem streaming: as saídas são pequenas. `max_tokens` de 2.000 no ranking e 8.000
na extração — esta última precisa de folga por causa do `texto_extraido`
(seção 3).

### 2.3 Módulos

| arquivo | trabalho | depende de |
|---|---|---|
| `src/api/claude.js` | cliente apontado ao proxy, modelo e effort num lugar só, erros | SDK |
| `src/api/perfil.js` | PDF ou texto → perfil estruturado | `claude.js` |
| `src/docx.js` | `.docx` → texto, no navegador | `mammoth` |
| `src/api/ranking.js` | perfil + N vagas → `[{id, nota, motivo}]`, com validação | `claude.js` |
| `src/curriculo.js` | perfil, texto, correções e instrução persistidos | — |
| `src/custo.js` | medidor de tokens e dólares, e o teto | — |

`custo.js` é separado do `cota.js` de propósito: unidades diferentes (200
requisições que zeram pela data da assinatura × dólares por token) e ciclos de
vida diferentes. Juntar faria o `cota.js` ter três trabalhos. A aba Controle lê
os dois.

### 2.4 Fluxo

```
upload / colar  ──►  perfil.js      1 chamada Claude
                     extrai + estrutura + deduz o cargo
                            │
                            ▼
                     tela de conferência (o aluno corrige)
                            │
                            ▼
                     localStorage  vagas:cv
                            │
busca           ──►  ranking.js     1 chamada Claude
                     perfil + 10 vagas → 10 notas
                            │
abrir uma vaga  ──►  justificativa  1 chamada Claude, sob demanda
```

**Duas chamadas no caminho normal**, e uma terceira só quando o usuário abre uma
vaga. A dedução do cargo sai junto da extração, sem chamada extra — é a
pendência 4 do ONDE-PARAMOS fechada de graça.

A **Vaga Inteligente** passa a ser: cargo do perfil → JSearch → ranking. Uma
requisição JSearch e uma Claude, não três.

### 2.5 Cache de prompt: não vai funcionar, e está tudo bem

O prefixo estável (instrução ~300 tokens + perfil ~500) dá ~800 tokens, abaixo
do mínimo de ~1.024 que a API exige para cachear. O cache simplesmente não
dispara — em silêncio, sem erro.

Registrado aqui para ninguém arquitetar em volta disso nem investigar depois por
que `cache_read_input_tokens` vem zero. O prefixo é pequeno porque o perfil
estruturado substituiu o texto cru, que era o objetivo.

---

## 3. Contrato 1 — o perfil

Saída da chamada de upload, via `output_config.format` com todos os campos
`required`:

```js
{
  cargo_deduzido: "Técnico de Suporte de TI",
  senioridade: "junior",              // junior|pleno|senior|especialista|null
  cidade: "Caxias do Sul, RS",        // do currículo, não da busca
  aceita_remoto: true,                // true|false|null
  pretensao_min: null,                // R$ mil — mesma unidade da tabela
  tecnologias: [
    { nome: "Python", profundidade: "producao", anos: 3 },
    { nome: "Docker", profundidade: "contato",  anos: null }
  ],
  formacao: "Tecnólogo em ADS (cursando)",
  resumo: "Suporte técnico migrando para desenvolvimento backend.",
  texto_extraido: "..."               // só quando a entrada foi PDF; null nos outros
}
```

`profundidade`: `producao` | `projeto` | `contato`.

### `texto_extraido`: a lacuna do PDF

O texto cru do currículo fica guardado para alimentar a justificativa detalhada.
Com `.docx` e texto colado isso é trivial — o texto já existe antes da chamada.
**Com PDF não existe:** quem leu o arquivo foi a Claude, e o navegador nunca viu
o conteúdo.

A saída: a chamada de extração devolve o texto junto, transcrito literalmente,
no mesmo passo. Custa ~3.000 tokens de saída, ~US$ 0,075, **uma vez por
currículo** — a extração vai de ~US$ 0,04 para ~US$ 0,11.

As alternativas, e por que não:

- **`pdfjs-dist` no navegador** — mais ~300 KB de bundle, e devolve *vazio* para
  currículo escaneado, que é justamente o caso que a Claude resolve. Trocaria um
  custo de uma vez por um modo de falha permanente.
- **Guardar o PDF em base64** — 5 MB de arquivo viram ~6,7 MB de base64 e
  estouram o `localStorage` inteiro.

Para PDF escaneado, a transcrição da Claude é a **única** forma de obter texto.
O que era o modo de falha "PDF que é foto" vira caso atendido — e a checagem de
`tecnologias` vazio continua pegando o scan realmente ilegível.

`max_tokens` da chamada de extração sobe para 8.000 por causa desse campo.

### Regras

**`null` é valor, não campo ausente.** Todo campo é `required`; `null` significa
"o currículo não diz". É isso que conserta a `INSTRUCAO_PADRAO`: hoje a cláusula
da pretensão salarial pontua contra silêncio e o modelo não distingue *não tem*
de *ninguém perguntou*. Com `pretensao_min: null` explícito, a instrução pode
mandar ignorar a cláusula em vez de chutar.

**`profundidade` em vez de anos.** A instrução pede quantas tecnologias o
candidato "operou em produção, e em que profundidade". Currículo raramente diz
anos por tecnologia, mas quase sempre deixa distinguir *usou em produção* de
*fez um curso*. `anos` fica como extra nullable.

**Salário em R$ mil**, igual ao `min`/`max` do `mapear.js` (4.5 = R$ 4.500).
Unidade diferente entre os dois lados vira lixo silencioso.

**`resumo` é uma frase livre.** Campos estruturados perdem nuance — "está
migrando de suporte para dev" não cabe em enum nenhum e muda o julgamento de
senioridade. Custa ~40 tokens.

### PDF

Bloco `document` em base64, antes do bloco de texto, sem beta header. O base64
não pode ter quebras de linha. O dropzone limita a 5 MB, bem abaixo do teto de
32 MB da requisição.

### A tela de conferência

Depois de extrair, o perfil aparece para o aluno conferir e corrigir. Não é
enfeite: é o que transforma uma nota inexplicável em uma nota auditável, e é
onde a **pretensão salarial** é digitada — dado que o aluno sabe e o currículo
quase nunca traz.

---

## 4. Contrato 2 — o ranking

```js
{ notas: [ { id: "SXbc9…", nota: 87, motivo: "Domina o stack; senioridade acima" }, … ] }
```

`id` é o `job_id` do JSearch ecoado de volta. É a âncora de validação — ordem de
array não é garantia de nada.

`nota` é inteiro de 0 a 100. `motivo` tem no máximo 10 palavras.

### Validação na volta, obrigatória

1. Todo id devolvido está no conjunto enviado. Id inventado é descartado.
2. Todo id enviado voltou com nota. Os que faltarem vão numa segunda chamada,
   menor, só com eles.
3. Sem duplicatas. A primeira ocorrência vence.

Se ainda faltar nota depois da segunda chamada, aquela vaga mostra "—" e a lista
aparece mesmo assim. Tela em branco por causa de um item faltando é pior que
ranking parcial.

**Lotes de 10 a 15 vagas**, não 50.

### Por que o `motivo` entra

O ONDE-PARAMOS registrou "justificativa detalhada só para a vaga que o usuário
abrir", e isso continua valendo para justificativa **longa** — ~150 tokens por
vaga. Um motivo de dez palavras são ~12 tokens: as dez vagas custam **US$ 0,003
a mais**. Resolve o problema que o perfil estruturado existe para resolver, que
é a nota sem explicação. A justificativa detalhada segue sendo uma terceira
chamada, sob demanda.

### A nota é relativa ao conjunto

O modelo calibra dentro das vagas que vê. As mesmas 10 vagas comparadas contra
10 outras dariam números diferentes. Como ranking, funciona; como "87% de
compatibilidade", é uma afirmação que não se sustenta entre duas buscas.

**A tela escreve "Rank IA 87 · Excelente" e continua assim.** Não trocar por
"%".

### Custo estimado

Com descrição de vaga em ~1.000 tokens, perfil em ~500 e instrução em ~300, no
`claude-opus-5` (US$ 5 / US$ 25 por 1M):

| | por vaga (10 chamadas) | **lote de 10** |
|---|---|---|
| entrada | ~43.000 tk | ~13.300 tk |
| saída | ~1.500 tk | ~270 tk |
| custo | ~US$ 0,25 | **~US$ 0,07** |

A extração do perfil custa ~US$ 0,11 por PDF (a transcrição do `texto_extraido`
é a maior parte) e ~US$ 0,02 por `.docx` ou texto colado, uma vez por currículo.

### O que cada chamada recebe

| chamada | recebe | devolve |
|---|---|---|
| perfil | PDF em base64 **ou** texto (do `mammoth` ou colado) | o perfil estruturado, mais `texto_extraido` quando a entrada foi PDF |
| ranking | instrução + perfil efetivo + as N vagas (título, empresa, cidade, modalidade, faixa, dias, descrição) | `[{id, nota, motivo}]` |
| justificativa | instrução + perfil efetivo + **texto cru do currículo** + uma vaga | prosa, alguns parágrafos |

A justificativa é a única que recebe o texto cru — é para isso que ele fica
guardado. Nas outras duas o perfil basta, e é justamente o que torna o ranking
barato.

Ela é **sob demanda**, quando o usuário abre a página de detalhe da vaga, e o
resultado fica em memória enquanto a vaga estiver aberta. Não persiste: reabrir
a mesma vaga refaz a chamada. Custa ~US$ 0,02 e evita mais um cache para
invalidar quando o perfil mudar.

---

## 5. Persistência

Chave `vagas:cv`, separada de `vagas:cota`:

```js
{
  versao: 1,
  arquivo:   { nome, tamanho, quando },
  texto:     "...",        // cru, 3-8 KB
  perfil:    { ... },      // o que a IA extraiu
  correcoes: { ... },      // só os campos que o usuário mudou
  instrucao: "..."         // só se diferente do padrão
}
```

O perfil efetivo é `{...perfil, ...correcoes}`.

**`correcoes` separado, não sobrescrevendo.** A correção do aluno sobrevive a uma
re-extração: se o schema melhorar ou o prompt mudar, re-extrai e reaplica por
cima em vez de perder o que ele digitou. E permite "voltar ao que a IA
entendeu", impossível se a correção sobrescrever.

**`versao: 1` porque o schema vai mudar.** Versão desconhecida → descarta e pede
o currículo de novo. Não tentar migrar.

**O texto cru fica guardado** para a justificativa detalhada e para re-derivar o
perfil quando o schema mudar. Vem do `mammoth` (`.docx`), da textarea (colado)
ou do `texto_extraido` da própria chamada (PDF) — três origens, um campo só.

**A instrução entra aqui.** Hoje é `useState(INSTRUCAO_PADRAO)` e some no F5 — o
aluno escreve 150 palavras de critério, aperta F5, perdeu. Mesmo argumento que
colocou a cota no `localStorage`.

**Leitura e escrita defensivas**, como no `cota.js`: em aba anônima, com storage
bloqueado ou com valor corrompido, o acesso lança. A tela não pode quebrar por
causa disso — no pior caso o currículo volta a não existir.

Sem TTL, sem expiração automática.

### Dado pessoal

1. **"Remover currículo" limpa o `localStorage`**, não só a memória. Hoje é
   `setCv(null)` e pronto; com persistência isso vira um botão que mente.
2. **"Limpar cache" não toca em `vagas:cv`.** Chave diferente resolve, mas é
   teste explícito — é o tipo de coisa que quebra num refactor.
3. **A tela diz onde o currículo está**: neste navegador, nesta máquina, e sai
   daqui só na hora de ranquear. É um app para aluno, que pode estar em máquina
   compartilhada.

---

## 6. Custo e teto

`custo.js` registra, por chamada:

```js
{ quando, tipo: 'perfil'|'ranking'|'justificativa', entrada, saida, modelo }
```

`entrada` e `saida` vêm de `response.usage.input_tokens` e `output_tokens`.

**Guarda token, calcula dólar na leitura.** Preço muda; dólar gravado vira
mentira no dia do reajuste. Token é fato. A tabela de preço por modelo fica no
`custo.js`.

Na aba Controle, ao lado das 200 do JSearch: gasto do ciclo em **US$** — não em
R$, porque converter exigiria cotação que o app não tem e o número seria
inventado — quebrado por tipo de chamada.

**Teto mensal configurável, US$ 5 de partida**, que **bloqueia** a próxima
chamada com mensagem clara e é zerável como a contagem do JSearch. As 200 do
JSearch são impostas pelo provedor; a Claude só para quando o cartão para. É
seguro barato contra um bug de laço.

Isso fecha a pendência 5 do ONDE-PARAMOS.

**A pendência 8 sai no mesmo commit em que o ranking real entra:** hoje a Vaga
Inteligente chama `registrarUso(..., 'rede')` sem tocar a API. Quando a chamada
real existir, o registro falso tem que sair junto, senão conta dobrado.

---

## 7. Erros

| situação | tratamento |
|---|---|
| PDF escaneado | Atendido: a Claude transcreve. Só falha se o scan for ilegível — e aí cai na linha abaixo |
| Currículo ilegível / perfil oco | Se `tecnologias` vier vazio, avisar e não ranquear. Silêncio aqui produz dez notas plausíveis e sem fundamento |
| `.docx` corrompido ou protegido | O `mammoth` lança; a mensagem oferece a textarea como saída |
| `stop_reason: "refusal"` | Checar antes de ler `content`. Currículo é dado pessoal; improvável, mas é uma linha |
| 429, 5xx, rede | Erro tipado do SDK, mensagem na tela. Sem cota estourada — o limite da Claude é dinheiro, não contagem |
| Chave ausente | Cortado pelo `guardaDeChave` antes de sair da máquina, como no JSearch |
| Teto de custo atingido | Bloqueia a chamada, diz quanto foi gasto e onde zerar |
| Ids faltando na volta | Segunda chamada só com eles; o que sobrar mostra "—" |

---

## 8. Testes

O projeto não tem teste nenhum hoje. Para esta feature isso não serve: os modos
de falha são todos silenciosos — um id que não voltou, um campo nulo, um
`localStorage` corrompido. Nada disso grita; tudo isso produz uma nota plausível
e errada.

Entra `vitest` (nativo do Vite, configuração quase zero) e o script `npm test`,
cobrindo as funções puras:

- **`ranking.js`** — id faltando, id inventado, duplicata, resposta vazia, lote
  parcial, montagem do lote
- **`curriculo.js`** — leitura defensiva, versão desconhecida, correções
  sobrepostas ao perfil, remoção completa, "Limpar cache" não apagando o
  currículo
- **`custo.js`** — soma de tokens, cálculo de dólar, teto que bloqueia
- **`docx.js`** — contra um `.docx` de verdade em `src/__fixtures__/`, não um
  mock do `mammoth`. Mais um arquivo corrompido, que deve lançar

**As chamadas à Claude não são mockadas.** Mock de API dá sensação de cobertura
e não prova nada sobre a resposta real — foi exatamente o que deixou
`modalidade` e `data` vazias no JSearch, testadas contra caso montado à mão. A
rede se verifica no `npm run dev`, com o console mostrando a resposta crua, como
o `mapearVagas` já faz.

---

## 9. O que muda no código existente

| arquivo | mudança |
|---|---|
| `vite.config.js` | segundo proxy `/api/claude`; `guardaDeChave` genérico para duas chaves |
| `.env.example` | `ANTHROPIC_API_KEY`, com o aviso do prefixo `VITE_` |
| `package.json` | `@anthropic-ai/sdk`, `mammoth`, `vitest`, script `test` |
| `src/data/vagas.js` | `INSTRUCAO_PADRAO` ajustada: como tratar campo `null` |
| `src/App.jsx` | `PainelIA` e `PainelVagaInteligente` saem para `src/paineis/`; fiação das três chamadas; `accept` vira `.pdf,.docx`; textarea de colar texto; remoção do registro falso de cota; `PainelControle` passa a ler o `custo.js` |
| `src/paineis/PainelIA.jsx` | extraído, mais a tela de conferência do perfil |
| `src/paineis/PainelVagaInteligente.jsx` | extraído, mais o fluxo real |

`PainelIA` e `PainelVagaInteligente` saem do `App.jsx` porque são exatamente os
componentes que esta feature reescreve, num arquivo de 3.628 linhas. Os outros
painéis ficam onde estão — isso é a pendência 11, não este trabalho.

---

## 10. Decisões, e por quê

| Decisão | Por quê |
|---|---|
| Dev-only, sem proxy de produção | Escolha explícita. O publicado continua vitrine |
| Perfil estruturado, não texto cru | ~2.500 tokens a menos por busca; campos `null` explícitos dão à instrução onde se apoiar; dedução do cargo de graça; e o aluno pode conferir |
| Texto cru guardado junto | Fonte para a justificativa detalhada e para re-derivar quando o schema mudar |
| `.doc` fora, textarea no lugar | Sem servidor não há extração de Word binário. A textarea cobre `.doc`, `.odt`, LinkedIn e o que vier |
| `.docx` com `mammoth` | É o formato mais comum de currículo. Alimenta o mesmo caminho da textarea, então não cria um terceiro fluxo |
| PDF pela Claude, não por `pdfjs` | `pdfjs` devolve vazio para currículo escaneado. A Claude lê o scan, e isso são ~300 KB de bundle a menos |
| `texto_extraido` vem na mesma chamada | Com PDF o navegador nunca vê o texto. ~US$ 0,075 uma vez por currículo, contra 300 KB de bundle e um modo de falha permanente |
| Justificativa não persiste | Reabrir a vaga refaz a chamada, ~US$ 0,02. Guardar exigiria mais um cache para invalidar quando o perfil mudar |
| Um lote de 10, não 10 chamadas | ~3,5× mais barato: o perfil viaja uma vez e a saída, que custa 5× a entrada, encolhe |
| `motivo` curto no lote | ~12 tokens por vaga, US$ 0,003 nas dez. Resolve a nota sem explicação |
| Nota é "Rank IA", não "%" | É relativa ao conjunto da busca. Como ranking serve; como porcentagem, mente entre buscas |
| `custo.js` separado do `cota.js` | Unidades e ciclos diferentes. Juntar daria três trabalhos a um módulo |
| Guarda token, calcula dólar na leitura | Preço muda; token é fato |
| Teto de custo próprio | O JSearch tem teto do provedor; a Claude não tem nenhum |
| `correcoes` separado do `perfil` | A correção do aluno sobrevive à re-extração |
| SDK, não `fetch` cru | `parse()` valida a saída estruturada; erros tipados; retry. Vale os ~100 KB |
| Sem mock das chamadas Claude | Mock mede o mock. Já custou duas colunas vazias no JSearch |
