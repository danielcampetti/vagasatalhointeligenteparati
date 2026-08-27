# Onde paramos — 27/08/2026

Retomada rápida do protótipo VAGAS. O **README.md** explica *como as coisas
funcionam*; este arquivo diz *em que pé estão* e *o que fazer a seguir*.

> **Revisado em 27/08/2026.** Cada afirmação abaixo foi conferida contra o
> código — `wc -l`, `npm test`, `git log` — não contra a memória. Este arquivo
> foi escrito quando a Avaliação IA não existia; ela existe agora, então quase
> tudo abaixo mudou. Onde algo mudou de rumo, o texto registra o que era antes
> e por que mudou, não só o estado novo.

---

## Estado do repositório

Tudo commitado, `git status` limpo. 44 commits ao todo, na branch
`avaliacao-ia`. Os 27 mais recentes — de `6faefd7 Desenho e plano da
Avaliação IA` a `4dc6e63 Mostra o gasto com a Claude na aba Controle`, todos
de 27/08 — são a Avaliação IA inteira, do desenho ao medidor de custo.

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

111 testes, 7 arquivos, todos verdes (conferido nesta revisão). Não existia
teste nenhum na revisão anterior.

---

## O que funciona hoje

- **Busca real na JSearch** (OpenWeb Ninja), só em `npm run dev`. A chave vive
  no `.env` e apenas o proxy do Vite a enxerga.
- **Cache que economiza cota de verdade**: repetir uma consulta serve do
  `localStorage` e **não faz requisição**. Teto de 20 consultas guardadas.
- **Página de detalhe da vaga**, com a descrição completa e o link externo.
  Voltar funciona pelo botão e pelo navegador.
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

## Próximo passo imediato

Três candidatos, sem obrigação de fazer todos:

1. **Verificar no navegador o ranking, a Vaga Inteligente e a justificativa
   contra a API real.** Nenhuma das três foi testada com uma chamada de
   verdade — foi decisão de não gastar crédito durante a implementação. Cada
   uma custa centavos: suba um currículo, rode uma busca, ranqueie, abra uma
   vaga e peça "Por que esta nota?".
2. **O proxy de produção.** Era a pendência 1 desde a revisão anterior; agora
   é mais urgente, porque bloqueia duas features publicadas em vez de uma.
3. **O caso do currículo trocado.** Registrado e deliberadamente não
   corrigido: o aluno ranqueia com um currículo, troca de currículo sem
   remover o antigo, e clica em "Por que esta nota?". A nota (`vaga.rank`)
   veio do perfil **antigo**; a justificativa compara a vaga com o perfil
   **novo**. Dois perfis por trás de uma única tela, sem aviso. Corrigir
   direito exigiria carimbar cada nota com o identificador do perfil que a
   gerou (ou re-ranquear ao trocar de currículo) — é decisão de desenho, não
   um ajuste pequeno, por isso ficou de fora.

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
| A faixa da nota (`min`/`max`) saiu do schema Zod e foi para `validarNotas` | A saída estruturada da Claude não suporta essas restrições — ver "Armadilhas conhecidas" |

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
npm test           # vitest — 111 testes, 7 arquivos
npm run lint       # oxlint (não pega no-undef hoje; veja a pendência 6)
npm run build      # gera dist/
npm run cidades    # regenera src/data/cidades.js a partir do IBGE
```
