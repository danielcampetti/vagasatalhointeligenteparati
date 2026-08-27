# Avaliação IA — camada de tela — plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ligar os oito módulos já prontos ao `App.jsx`, para o app fazer de verdade o que hoje só encena.

**Architecture:** Primeiro o recorte mecânico de dois painéis para arquivos próprios, sem mudar comportamento. Depois oito ligações independentes, uma por commit, cada uma verificável no navegador em uma frase.

**Tech Stack:** React 19, Vite 8. Nenhuma dependência nova — tudo que a tela precisa já existe.

**Spec:** `docs/superpowers/specs/2026-08-27-avaliacao-ia-tela-design.md`, que complementa `docs/superpowers/specs/2026-08-26-avaliacao-ia-design.md`.

**Substitui** as Tasks 9, 10 e 11 do plano `2026-08-26-avaliacao-ia.md`. As Tasks 0-8 daquele plano estão feitas; a Task 12 (ONDE-PARAMOS) vira a Tarefa 10 aqui.

## Global Constraints

- **Os oito módulos prontos não mudam.** `claude.js`, `perfil.js`, `ranking.js`, `justificativa.js`, `curriculo.js`, `custo.js`, `docx.js`, `mapear.js` estão testados e revisados. Se a tela precisar de algo diferente deles, **pare e diga** — é defeito de plano.
- **Nenhuma chamada direta ao SDK.** A tela chama `extrairPerfil`, `ranquear`, `justificar`; esses módulos chamam o invólucro.
- **Erros dos módulos vão para a tela verbatim**, via `mensagemDoErro`. Não reescreva mensagem de erro na camada de tela.
- Código e comentários em português, no tom do arquivo: explicar *por quê*.
- **Nenhuma chamada de rede durante a implementação.** A chave da Claude do usuário está ativa e o gasto não tem teto do lado do provedor. O endpoint do JSearch tem limite duro de 200 requisições/mês na chave real dele. Verificação manual que exija busca fica reservada ao usuário.
- `npm test` deve seguir em 111/111 (atualizado em 27/08: era 112/112 quando
  este plano foi escrito; `texto_extraido` saiu do perfil por custo e levou
  um teste de regressão junto — ver `progress-modelo.md` na pasta de
  acompanhamento). Nenhuma tarefa aqui quebra teste existente.

## Contra as quedas de transporte

Catorze agentes foram perdidos nesta execução, e o padrão correlaciona com geração longa. Todo despacho deste plano:

- Recorte de bloco de código é feito por **comando de shell**, nunca reescrevendo as linhas.
- Commit em cada ponto verde coerente, não só no fim.
- Relatório curto, apensado ao longo do caminho.
- **Derive os números de linha na hora**, com `grep -n`; nunca reutilize os deste documento, que envelhecem a cada edição.

---

## Tarefa 1: Recorte dos painéis, sem mudar comportamento

Mecânica pura. O objetivo é que a tela fique **idêntica** — se alguma coisa mudar visualmente, o recorte errou.

**Files:**
- Create: `src/paineis/comuns.jsx`, `src/paineis/PainelIA.jsx`, `src/paineis/PainelVagaInteligente.jsx`
- Modify: `src/App.jsx` (remove os blocos, acrescenta imports)

**Interfaces:**
- Produces: `<PainelIA>` e `<PainelVagaInteligente>` com as **mesmas props de hoje**; `AvisoErro` e `Carregando` exportados de `comuns.jsx`.

### A armadilha, já levantada

`Carregando` é usado dentro do `PainelVagaInteligente` **e** no `App`. `AvisoErro` é usado só no `App`, apesar de morar no meio do bloco do painel. Levá-los junto com o painel faz o `App` importar do painel; deixá-los faz o painel importar do `App`. Nos dois casos, import circular.

Por isso os dois vão para `comuns.jsx`, que não importa ninguém.

- [ ] **Step 1: Levantar os limites atuais**

```bash
grep -n "^function PainelIA\|^function PainelVagaInteligente\|^function AvisoErro\|^function Carregando\|^function ResultadoInteligente\|^function ModalNovaVaga\|^function PainelControle" src/App.jsx
```

Cada bloco vai da sua linha `function X(` até a linha antes do próximo `function`. Confira o fim de cada um olhando o arquivo — não confie na aritmética.

- [ ] **Step 2: Criar `comuns.jsx` com `AvisoErro` e `Carregando`**

Mova os dois blocos com `sed -n 'INICIO,FIMp' src/App.jsx >> src/paineis/comuns.jsx`, trocando `function` por `export function` nos dois. Nenhum import é necessário: eles não usam nada de fora.

- [ ] **Step 3: Criar `PainelVagaInteligente.jsx`**

Mova o bloco do painel e o de `ResultadoInteligente` (não são contíguos). No topo: `import { Carregando } from './comuns'`. `export default function PainelVagaInteligente`.

- [ ] **Step 4: Criar `PainelIA.jsx`**

Recorte limpo — não usa nada de fora. `export default function PainelIA`.

- [ ] **Step 5: Limpar o `App.jsx` e importar**

Apague os cinco blocos movidos (de baixo para cima, para os números de linha não se deslocarem) e acrescente:

```jsx
import { AvisoErro, Carregando } from './paineis/comuns'
import PainelIA from './paineis/PainelIA'
import PainelVagaInteligente from './paineis/PainelVagaInteligente'
```

- [ ] **Step 6: Verificar que nada mudou**

`npm test` → 111/111. `npm run lint` limpo. `npm run build` sem erro — é o que pega import circular ou símbolo perdido.

Confira que `src/App.jsx` encolheu ~700 linhas: `wc -l src/App.jsx`.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "Move PainelIA, PainelVagaInteligente e os avisos comuns para arquivos próprios"
```

---

## Tarefa 2: Estado persistido no App

O currículo e a instrução passam a sobreviver ao F5. Sem interface nova.

**Files:** Modify `src/App.jsx`

- [ ] **Step 1: Ler na inicialização**

Trocar `useState(null)` do `cv` por `useState(() => lerCurriculo())`, e `useState(INSTRUCAO_PADRAO)` da `instrucao` por `useState(() => lerCurriculo()?.instrucao ?? INSTRUCAO_PADRAO)`.

Importar de `./curriculo`.

- [ ] **Step 2: Gravar a instrução ao editar**

Nos dois handlers (`onInstrucao` e `onRestaurar`), chamar `definirInstrucao` junto do `setInstrucao`.

- [ ] **Step 3: Verificar**

`npm test` 111/111. No navegador: a aba Avaliação IA abre; editar a instrução e dar F5 mantém o texto editado. (O currículo ainda não persiste porque nada o grava — isso é a Tarefa 3.)

- [ ] **Step 4: Commit**

---

## Tarefa 3: Upload real no PainelIA

O arquivo passa a ser lido de verdade.

**Files:** Modify `src/paineis/PainelIA.jsx`, `src/App.jsx`

**Interfaces:**
- Consumes: `extrairPerfil` de `../api/perfil`, `extrairDocx` de `../docx`, `gravarCurriculo` de `../curriculo`, `mensagemDoErro` de `../api/claude`.

- [ ] **Step 1: `accept` passa a `.pdf,.docx`**

Nos dois inputs. `.doc` sai: sem servidor não há como abrir Word binário no navegador.

- [ ] **Step 2: Estado local de leitura e erro**

`const [lendo, setLendo] = useState(false)` e `const [erro, setErro] = useState(null)`.

- [ ] **Step 3: PDF vira base64 sem quebra de linha**

```jsx
function paraBase64(arquivo) {
  return new Promise((ok, falha) => {
    const leitor = new FileReader()
    leitor.onload = () => ok(String(leitor.result).split(',')[1])
    leitor.onerror = () => falha(new Error('Não foi possível ler o arquivo.'))
    leitor.readAsDataURL(arquivo)
  })
}
```

- [ ] **Step 4: `enviarArquivo`**

PDF → `{ base64 }`. `.docx` → `extrairDocx` → `{ texto }`. Chama `extrairPerfil`, grava com `gravarCurriculo`, avisa o `App` pelo callback. Para `.docx`, o texto guardado é o que o `mammoth` devolveu; **para PDF, `texto` fica vazio (`''`)** — o navegador nunca viu o conteúdo, e `gravarCurriculo` já trata `texto` ausente como `''`.

**Atualizado em 27/08:** esta instrução dizia originalmente para guardar
`perfil.texto_extraido` no caminho de PDF. Esse campo saiu do `PerfilSchema`
por custo — pedir à Claude que transcrevesse o documento inteiro junto com o
perfil custava ~US$ 0,075 a mais por upload, mais que o dobro do resto da
extração (ver `2026-08-26-avaliacao-ia-design.md`, seção 3, "A lacuna do
PDF"). A consequência é aceita: para currículo em PDF, a justificativa
detalhada (Tarefa 8) cai no fallback testado de `justificativa.js` — "use só
o perfil" — e sai mais pobre do que para `.docx` ou texto colado.

Erro: `setErro(mensagemDoErro(err))`, e a mensagem aparece acima do dropzone, que continua visível.

- [ ] **Step 5: Verificar**

`npm test` 111/111. No navegador, com a chave no `.env`: subir um PDF de currículo → a tela mostra "lendo", depois o currículo aparece; F5 mantém. Subir um `.docx` → mesmo resultado. Subir um arquivo corrompido → mensagem em português com saída.

> Esta é a primeira verificação que gasta dinheiro de verdade (~US$ 0,01–0,02
> por PDF — estimativa, não medição). **Atualizado em 27/08:** era ~US$ 0,11
> antes de `texto_extraido` sair do schema e do modelo trocar para Sonnet 5
> (ver Step 4 acima). Uma por formato basta.

- [ ] **Step 6: Commit**

---

## Tarefa 4: Textarea de colar texto

Cobre `.doc`, `.odt`, LinkedIn e o que mais aparecer.

**Files:** Modify `src/paineis/PainelIA.jsx`

- [ ] **Step 1: Campo abaixo do dropzone**

Textarea + botão "Usar este texto", desabilitado enquanto vazio ou lendo. Uma linha explicando para que serve.

- [ ] **Step 2: `enviarTexto`**

Mesmo caminho do `.docx`: `extrairPerfil({ texto })`. O nome do "arquivo" guardado é "texto colado".

- [ ] **Step 3: Verificar**

Colar um currículo em texto e enviar → mesmo resultado do arquivo. Custa
~US$ 0,01 (atualizado em 27/08 pelo preço do Sonnet 5; era ~US$ 0,02 no
Opus 5 — estimativa, não medição).

- [ ] **Step 4: Commit**

---

## Tarefa 5: Tela de conferência do perfil

A maior peça de interface do plano. Layout e decisões na seção 4 da spec.

**Files:** Modify `src/paineis/PainelIA.jsx`

**Interfaces:**
- Consumes: `perfilEfetivo`, `corrigirPerfil`, `limparCorrecoes`, `removerCurriculo` de `../curriculo`.

- [ ] **Step 1: Componente `Campo`**

Rótulo + input controlado, no mesmo arquivo. Aceita `vazio` — o texto mostrado quando o valor é `null`.

- [ ] **Step 2: A tela, quando `cv?.perfil` existe**

Cinco campos editáveis (cargo, senioridade, cidade, pretensão, remoto). Tecnologias e formação como texto, sem edição. Cada edição chama `corrigirPerfil` e avisa o `App`.

- [ ] **Step 3: Os dois botões e o aviso de privacidade**

"Voltar ao que a IA entendeu" → `limparCorrecoes`. "Remover currículo" → `removerCurriculo` **e** limpa o estado do `App`. Abaixo, as duas linhas dizendo que o currículo fica só neste navegador.

- [ ] **Step 4: A pretensão vazia convida**

Quando `pretensao_min` é `null`, mostrar "não informada" e a linha curta explicando que preencher faz as vagas serem pesadas por salário.

- [ ] **Step 5: Verificar**

Sem gastar chamada nova, com um currículo já enviado: corrigir a cidade → F5 → correção mantida. "Voltar ao que a IA entendeu" → a correção some, o resto fica. "Remover currículo" → F5 → dropzone de volta.

- [ ] **Step 6: Commit**

---

## Tarefa 6: Ranking na aba Vagas

**Files:** Modify `src/App.jsx`

- [ ] **Step 1: Estado**

`const [ranqueando, setRanqueando] = useState(false)` e `const [erroRanking, setErroRanking] = useState(null)`.

- [ ] **Step 2: Ranquear depois da busca**

No `buscar()`, depois de `setBanco(vagas)` e do registro de cota: se `perfilEfetivo(cv)` existir e houver vagas, chamar `ranquear` e repor o banco com o resultado. A lista já está na tela; as notas chegam depois.

Erro do ranking **não derruba a busca**: `setErroRanking(mensagemDoErro(err))`, as vagas continuam.

- [ ] **Step 3: Aviso na tela**

`erroRanking` vira um `<AvisoErro>` acima da tabela, sem tirar as vagas.

- [ ] **Step 4: Verificar**

Com currículo: uma busca **em cache** (não gasta JSearch) → as vagas aparecem e depois recebem nota; ordenar por Rank IA muda a ordem. Sem currículo: a mesma busca aparece com "—" e nenhum erro.

> Use consulta já em cache. O JSearch tem 200/mês na chave real do usuário.

- [ ] **Step 5: Commit**

---

## Tarefa 7: Vaga Inteligente de verdade

**Files:** Modify `src/App.jsx`

- [ ] **Step 1: Trocar o `buscarInteligente`**

Cargo do perfil → cache ou JSearch → `ranquear`. Sem currículo, mensagem pedindo o currículo antes.

- [ ] **Step 2: Tirar o registro falso de cota**

A linha `setCota(registrarUso('Vaga Inteligente', cidadeIa, 'rede'))` some. Ela contava uma requisição que nunca acontecia; agora a requisição é real e é registrada com o termo verdadeiro. **No mesmo commit**, senão conta dobrado.

- [ ] **Step 3: Verificar**

Com currículo, escolher cidade e buscar → vagas ranqueadas. A aba Controle mostra **uma** requisição JSearch, não duas. No console, `[jsearch] ->` e `[claude] ->` uma vez cada.

- [ ] **Step 4: Commit**

---

## Tarefa 8: Justificativa na página de detalhe

**Files:** Modify `src/App.jsx` (o `PaginaVaga`)

- [ ] **Step 1: Botão e estado**

"Por que esta nota?", visível só quando `vaga.rank !== null`. Estado local para o texto e o carregando.

- [ ] **Step 2: A chamada**

`justificar(perfilEfetivo(cv), cv.texto, instrucao, vaga)`. Erro vira o próprio texto mostrado, via `mensagemDoErro`.

- [ ] **Step 3: Verificar**

Abrir uma vaga com nota → botão → parágrafos coerentes com o currículo. Custa
~US$ 0,01 (atualizado em 27/08 pelo preço do Sonnet 5; era ~US$ 0,02 no
Opus 5 — estimativa, não medição). Para currículo enviado como PDF, sem
texto cru guardado, a resposta sai do fallback de perfil-só de
`justificativa.js` — mais pobre que para `.docx` ou texto colado (ver Tarefa
3, Step 4).

- [ ] **Step 4: Commit**

---

## Tarefa 9: Medidor de custo na aba Controle

**Files:** Modify `src/App.jsx`

- [ ] **Step 1: Estado e releitura**

`const [custo, setCusto] = useState(() => lerCusto())`. O `PainelIA` recebe um callback `onCusto` para o `App` reler depois de cada chamada; o mesmo no `finally` de `buscar` e `buscarInteligente`.

- [ ] **Step 2: O cartão**

Gasto do ciclo em US$, quebrado por tipo de chamada, botão de zerar, e a frase explicando que o teto é local — a Claude não tem teto do lado de lá.

- [ ] **Step 3: Verificar**

Uma busca com currículo → o valor sobe. "Zerar" → volta a US$ 0,00 e o teto continua. Baixar o teto pelo console e tentar buscar → mensagem de teto, e **nenhum** `[claude] ->` no terminal.

- [ ] **Step 4: Commit**

---

## Tarefa 10: Atualizar o ONDE-PARAMOS

**Files:** Modify `ONDE-PARAMOS.md`

- [ ] **Step 1: Fechar o que foi feito**

Pendências 4 (dedução do cargo), 5 (medidor da Claude) e 8 (registro falso de cota) estão resolvidas. A 11 (App.jsx grande) ficou parcial — atualizar a contagem com `wc -l src/App.jsx`.

- [ ] **Step 2: Registrar o que este trabalho criou**

A Avaliação IA funciona **só em `npm run dev`**, como a busca: o site publicado agora tem duas features mortas em vez de uma, e a pendência 1 (proxy de produção) ficou mais cara de adiar. `.doc` não é mais aceito. Existe teste (`npm test`), que antes não existia.

- [ ] **Step 3: Commit**

---

## Auto-revisão deste plano

**Cobertura da spec:** seção 2 (mapa do recorte) → Tarefa 1; seção 3 (estados) → Tarefas 3, 4, 5; seção 4 (conferência) → Tarefa 5; seção 5 (persistência) → Tarefa 2; seção 6 (ranking) → Tarefas 6, 7, 8; seção 7 (medidor) → Tarefa 9.

**Ordem obrigatória:** 1 antes de tudo (todas as outras editam os arquivos que ela cria). 2 antes de 3 e 5. 3 antes de 4 e 5. 6 antes de 7 e 8. 9 depois de 3. 10 por último.

**Sem teste automatizado nas Tarefas 2-9.** São componentes de tela, e o projeto não tem infraestrutura de teste de React — montá-la agora seria um plano próprio. A verificação é manual, no navegador, e cada tarefa traz a sua em uma frase. `npm test` continua rodando a cada passo para garantir que nada dos módulos quebrou.

**Custo em dinheiro real das verificações:** ~US$ 0,02 (PDF) + ~US$ 0,01 (texto colado) + ~US$ 0,03 (ranking) + ~US$ 0,01 (justificativa) ≈ **US$ 0,07 no total**, se cada uma for feita uma vez. Estimativa, não medição.

**Atualizado em 27/08:** o total original, escrito quando este plano ainda
previa `claude-opus-5` e a transcrição do PDF via `texto_extraido`, era
~US$ 0,22 (~US$ 0,11 PDF + ~US$ 0,02 texto colado + ~US$ 0,07 ranking +
~US$ 0,02 justificativa). Duas mudanças de custo, decididas pelo usuário
depois deste plano ter sido escrito, derrubaram o total de verificação a
menos de um terço: a troca de modelo para Sonnet 5 (~0,4× o preço do Opus 5
nos dois lados) e a retirada de `texto_extraido` (que sozinha respondia por
~US$ 0,075 do custo do PDF). Ver `progress-modelo.md` na pasta de
acompanhamento e a seção 3 de `2026-08-26-avaliacao-ia-design.md`.
