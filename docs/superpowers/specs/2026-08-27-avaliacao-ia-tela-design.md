# Avaliação IA — a camada de tela

**27/08/2026.** Complementa `2026-08-26-avaliacao-ia-design.md`, que fixou o
desenho das chamadas. Aquele documento continua valendo inteiro; este só
detalha o que ficou implícito nele: **o que o aluno vê**, e como os oito
módulos já prontos se ligam ao `App.jsx`.

---

## 1. Por que este documento existe

A camada de lógica está pronta e testada — 111 testes, oito módulos.
(Atualizado em 27/08: eram 112 quando este documento foi escrito;
`texto_extraido` saiu do perfil por custo e levou um teste de regressão
junto — ver `progress-modelo.md` na pasta de acompanhamento.) E **nada disso
está ligado**: o `App.jsx` não importa um único módulo novo. O app hoje se
comporta exatamente como antes de a integração começar.

O plano original tratava a tela como três tarefas grandes. Duas coisas obrigam a
refazer isso:

**Elas são grandes demais para o ambiente.** Catorze agentes foram perdidos nesta
execução por erro de transporte, e o padrão correlaciona com geração longa. As
tarefas de tela envolvem recortar ~280 linhas por painel e escrever interface
nova. Do jeito que estavam, cada uma exigiria várias tentativas.

**Elas escondiam decisões não tomadas.** "Tela de conferência do perfil" cabe numa
linha de plano e não diz que campos aparecem, o que acontece ao corrigir, nem o
que o aluno vê enquanto a extração roda. Isso é desenho, não implementação, e
tem que estar decidido antes.

---

## 2. O mapa do recorte

Levantado no código, não suposto:

| componente | linhas hoje | destino |
|---|---|---|
| `PainelIA` | 1860–2138 | `src/paineis/PainelIA.jsx` |
| `PainelVagaInteligente` | 2530–2789 | `src/paineis/PainelVagaInteligente.jsx` |
| `ResultadoInteligente` | 2859–2920 | junto, mesmo arquivo |
| `AvisoErro` | 2790–2825 | `src/paineis/comuns.jsx` |
| `Carregando` | 2826–2858 | `src/paineis/comuns.jsx` |
| `CampoCidade` | 797–1019 | `src/paineis/CampoCidade.jsx` |

`CampoCidade` leva junto dois consts de módulo que só ele usa —
`CIDADES_INDEXADAS` e `TETO_SUGESTOES` — e o helper `semAcento` (linha 123),
que também não tinha nenhum outro chamador no arquivo.

### A armadilha que o levantamento revelou

`Carregando` é usado **dentro** do `PainelVagaInteligente` (linha 2749) **e** no
`App` (3464). `AvisoErro` é usado só no `App` (3454), apesar de morar no meio do
bloco do painel.

Recortar o painel levando esses dois junto faria o `App` importar do painel;
deixá-los no `App` faria o painel importar do `App`. Nos dois casos, import
circular.

Por isso os dois vão para um terceiro arquivo, `src/paineis/comuns.jsx`, que não
importa ninguém. `ResultadoInteligente` não tem esse problema — só o painel o
usa — e vai junto com ele.

`PainelIA` não usa nada de fora: recorte limpo.

**Correção pós-execução (Tarefa 1):** este mapa saiu de grep dirigido aos
componentes já suspeitos — não cruzou o conteúdo de cada bloco contra *todos*
os símbolos do arquivo. Por isso `CampoCidade` escapou: é o mesmo padrão do
`Carregando`, um componente usado tanto por quem fica (`ConsultaDestaque`,
linha 1097, permanece no `App`) quanto por quem sai (`PainelVagaInteligente`,
linha 2693). Só apareceu quando a Tarefa 1 rodou a verificação cruzada completa
antes de cortar. Ele não foi para `comuns.jsx` — é um combobox com indexação
própria sobre 5.571 municípios, não um aviso pequeno — e ganhou arquivo
próprio, `src/paineis/CampoCidade.jsx`. Quem levantar um mapa parecido para uma
tarefa futura deve cruzar contra a lista completa de símbolos do arquivo, não
só contra os componentes já sob suspeita.

---

## 3. Os estados da aba Avaliação IA

Cinco, e o aluno só vê um por vez.

**Vazio.** Dropzone + textarea de colar texto. É o estado inicial e o estado
depois de remover o currículo.

**Lendo.** Enquanto a extração roda. Botões desabilitados, e uma frase que diz o
que está acontecendo — a chamada leva alguns segundos e o silêncio parece
travamento.

**Conferência.** O perfil extraído, editável. É o estado normal de quem já
enviou o currículo.

**Erro.** A mensagem lançada pelo módulo, verbatim, acima do dropzone — que
continua visível, porque toda mensagem de erro do sistema oferece a textarea
como saída, e ela precisa estar ali.

**Perfil oco.** Caso especial do erro: a extração devolveu perfil sem tecnologia
nenhuma. O módulo já lança com mensagem própria; a tela não ranqueia.

---

## 4. A tela de conferência

O que aparece, nesta ordem:

```
Isto é o que a IA entendeu do seu currículo.
Corrija o que estiver errado — é contra isto que as vagas são comparadas.

Cargo          [Técnico de Suporte de TI        ]
Senioridade    [junior ▾]
Cidade         [Caxias do Sul, RS               ]
Pretensão      [        ] R$ mil    ← vazio: "não informada"
Aceita remoto  [sim ▾]

Tecnologias: Python (produção), Docker (contato), Linux (projeto)

Formação: Tecnólogo em ADS (cursando)

[Voltar ao que a IA entendeu]  [Remover currículo]

Seu currículo fica guardado só neste navegador, nesta máquina.
Ele sai daqui apenas na hora de comparar com as vagas.
```

### Decisões dentro dela

**Os cinco campos editáveis são os que a instrução de ranking usa.** Cargo,
senioridade, cidade, pretensão e remoto entram nas cláusulas de pontuação.
Tecnologias e formação aparecem como texto, sem edição: são listas, editá-las
exigiria interface de lista, e o ganho não paga — quem discorda do que a IA leu
reenvia o currículo.

**A pretensão vazia é o caso comum e precisa parecer um convite.** Quase nenhum
currículo traz pretensão salarial. O campo vazio mostra "não informada" e uma
linha curta dizendo que preencher faz as vagas serem pesadas por salário. É o
único dado que o aluno tem e o documento não.

**Corrigir grava na hora**, sem botão de salvar. O `curriculo.js` já guarda
correções separadas do perfil extraído, então "voltar ao que a IA entendeu"
apaga só as correções.

**"Remover currículo" apaga do `localStorage` de verdade**, não só do estado da
tela.

---

## 5. O que persiste, e quando

| o quê | quando grava |
|---|---|
| perfil extraído + texto cru, quando existe | ao terminar a extração |
| cada correção | ao editar o campo |
| instrução de ranking | ao editar o textarea |

Tudo em `vagas:cv`, pelo `curriculo.js` que já existe. O `App` lê uma vez na
inicialização (`useState(() => lerCurriculo())`) — hoje ele começa com `null` e
`INSTRUCAO_PADRAO`, e perde tudo no F5.

**Atualizado em 27/08:** "quando existe" carrega peso. `.docx` e texto colado
sempre têm texto cru — o navegador já extraiu antes da chamada. PDF não tem
mais: havia um campo `texto_extraido` que a Claude preenchia junto com o
perfil, e ele saiu do schema por custo (~US$ 0,075 a mais por upload de PDF —
ver `2026-08-26-avaliacao-ia-design.md`, seção 3, "A lacuna do PDF"). Para
PDF, `curriculo.js` grava `texto: ''`, e a página de detalhe da vaga
("Por que esta nota?", seção 6) cai no fallback de `justificativa.js` — a
prosa que o aluno lê sai mais pobre para PDF do que para `.docx` ou texto
colado.

---

## 6. O ranking nas duas abas

**Aba Vagas.** Depois que a busca do JSearch volta, se houver currículo, chama
`ranquear` e repõe o banco com as vagas pontuadas. Enquanto isso, a lista já
está na tela — as notas chegam depois.

Sem currículo, nada muda: as vagas aparecem e o Rank IA mostra "—". O ranking é
enriquecimento, não pré-requisito.

Erro no ranking **não derruba a busca**: as vagas continuam, com um aviso acima
da tabela.

**Aba Vaga Inteligente.** Cargo do perfil → JSearch → ranking. Uma requisição
JSearch e uma Claude. O registro falso de cota que existe hoje sai no mesmo
commit em que a chamada real entra, senão conta dobrado.

**Página de detalhe.** Botão "Por que esta nota?", visível só quando a vaga tem
nota. Chama sob demanda, mostra a prosa. Não persiste.

---

## 7. O medidor na aba Controle

Um cartão ao lado das 200 requisições do JSearch: gasto do ciclo em US$,
quebrado por tipo de chamada, com botão de zerar. O teto de US$ 5 aparece junto,
com a frase que explica que ele é local — a Claude não tem teto do lado de lá.

O `App` relê o custo depois de cada chamada. O `PainelIA` recebe um callback
para isso, porque o estado é do `App`.

---

## 8. Fora de escopo

- Proxy de produção. O site publicado continua vitrine.
- Editar tecnologias e formação na tela de conferência.
- Guardar a justificativa entre aberturas da mesma vaga.
- Qualquer mudança nos oito módulos já prontos — se a tela precisar de algo
  diferente deles, isso é defeito de plano e volta para decisão.

---

## 9. Como isto vira tarefas

O princípio da decomposição, dado o ambiente: **cada tarefa gera pouco código
novo e é verificável sozinha.**

O recorte dos painéis é mecânico e vai por comando de shell movendo blocos, não
regenerando linhas — é o passo que mais geraria texto e o que menos precisa de
julgamento.

Depois dele, cada ligação entra separada: estado persistido, upload real,
textarea, conferência, ranking na aba Vagas, Vaga Inteligente, justificativa,
medidor. Oito passos pequenos, cada um com um commit e uma verificação no
navegador que cabe em uma frase.

O plano está em `docs/superpowers/plans/2026-08-27-avaliacao-ia-tela.md`.
