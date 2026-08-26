# Onde paramos — 26/08/2026

Retomada rápida do protótipo VAGAS. O **README.md** explica *como as coisas
funcionam*; este arquivo diz *em que pé estão* e *o que fazer a seguir*.

> **Revisado em 26/08/2026, à tarde.** Cada afirmação abaixo foi conferida
> contra o código, não contra a memória. O que mudou nesta revisão está
> marcado com ✎ — são três correções e um bug consertado.

---

## ⚠️ Primeiro: nada está commitado

Todo o trabalho está no diretório, sem um único commit. O último commit é
`4bcff94 Aba Vagas vira busca sobre o banco de vagas`, **anterior a tudo isto**:

```
 M .gitignore          .env fora do git
 M README.md           reescrito
 M package.json        script "cidades"
 M src/App.jsx         a maior parte das mudanças (+2.399 / -~800)
 M src/data/vagas.js   esvaziado (as 58 vagas de mock saíram)
 M src/index.css       keyframe do spinner
 M vite.config.js      proxy da API
?? .env.example
?? ONDE-PARAMOS.md     ✎ este arquivo também está fora do git
?? scripts/            gerador da lista de cidades
?? src/api/            jsearch.js + mapear.js
?? src/cota.js         cota + cache
?? src/data/cidades.js 5.571 municípios do IBGE (gerado)
```

**Commitar deveria ser a primeira coisa amanhã.** Um `git checkout` acidental
apaga um dia inteiro de trabalho.

O `.env` existe na máquina, tem chave real e está corretamente ignorado. O
`.env.example` tinha sumido — foi renomeado para `.env` em vez de copiado — e
foi recriado. Ao configurar em outra máquina, use `cp`, não `mv`.

---

## Como testar agora

```bash
npm run dev
```

Sobe em **http://localhost:5173/vagasatalhointeligenteparati/** — repare no
caminho: o `base` do Vite aponta para o nome do repositório, então a raiz
(`localhost:5173/`) devolve 404. Verificado nesta revisão: a página abre, as
cinco abas navegam e o console fica limpo.

---

## O que funciona hoje

- **Busca real na JSearch** (OpenWeb Ninja), só em `npm run dev`. A chave vive
  no `.env` e apenas o proxy do Vite a enxerga.
- **Cache que economiza cota de verdade**: repetir uma consulta serve do
  `localStorage` e **não faz requisição**. Teto de 20 consultas guardadas.
- **Aba Controle** com o consumo das 200/mês, buscas servidas do cache,
  histórico e os botões de zerar contagem e limpar cache.
- **Página de detalhe da vaga**, com a descrição completa e o link externo.
  Voltar funciona pelo botão e pelo navegador.
- **Combobox de cidade** com as 5.571 do IBGE (conferido: `CIDADES.length`
  é 5571), sem acento e com casamento exato no topo.
- **Aba Vaga Inteligente** — a casca, sem nenhuma IA ligada, mas agora sem
  quebrar. ✎ Veja abaixo.

## O que não funciona

- **A busca no site publicado.** GitHub Pages é estático, não há proxy, e
  `/api/jsearch` responde 404. Só funciona local.
- **Rank IA** — depende da etapa da Claude, que não existe.
- **Vaga Inteligente** — encena uma espera e explica o que falta.

### ✎ Consertado nesta revisão

O botão **"Buscar vagas compatíveis"** da aba Vaga Inteligente **quebrava a
página**: `App.jsx` chamava `registrarBusca(...)`, uma função que não existe.
Ela virou `registrarUso` no `cota.js` e este chamador ficou para trás.

```
ReferenceError: registrarBusca is not defined
  > buscarInteligente App.jsx:3324
```

O React derrubava a árvore e a tela ficava presa em "Buscando..." para
sempre. Corrigido para `registrarUso('Vaga Inteligente', cidadeIa, 'rede')` —
o terceiro argumento é obrigatório, e `'rede'` é o que o comentário da própria
função pede. Testado no navegador depois: o estado "Nada a ranquear ainda"
aparece e a busca entra no histórico do Controle.

**Como passou batido:** `npm run lint` **não pega isto**. O `.oxlintrc.json`
liga só `react/rules-of-hooks` e `react/only-export-components`; sem `no-undef`
e sem `env`, uma variável inexistente passa em silêncio. Veja a pendência 6.

---

## Próximo passo imediato

**Rodar uma busca nova** (não uma que esteja em cache) e conferir se
**modalidade** e **data de publicação** preenchem.

Contexto: as duas vinham vazias em toda vaga porque o mapeamento lia campos que
não existem. Corrigido para `work_arrangement` e uma cadeia de três campos de
data, mas **a correção continua sem teste contra a API real** — só contra casos
montados à mão.

O `mapearVagas` imprime no console os campos da primeira vaga de cada resposta.
Se algo ainda vier vazio, essa linha do console diz o nome verdadeiro do campo.

> Esta revisão **não** gastou requisição nenhuma de propósito. O navegador
> automatizado tem `localStorage` próprio, então uma busca feita por ele
> consumiria uma das 200 de verdade **sem** aparecer no contador do seu
> Chrome — o painel de Controle passaria a mentir para menos. Faça a busca
> você, no seu navegador.

---

## Decisões já tomadas (não relitigar)

| Decisão | Por quê |
|---|---|
| Cargo é texto livre; cidade é lista fechada | Cargo errado devolve resultado ruim; cidade errada não devolve nada |
| ✎ **Nenhum recorte local: nem cargo, nem cidade** | Quem filtra é a API. O recorte por cidade saiu junto com o mock: a JSearch escreve "Caxias Do Sul" ou devolve municípios vizinhos, e nada disso bate com o rótulo exato do IBGE — comparar de novo derrubava vaga legítima. Sobrou ordenação e paginação |
| Sem filtros sobre o resultado (tecnologia, empresa, modalidade, status) | Removidos de propósito |
| Status entra como "Ativa" | Veio de uma busca agora. "Em análise"/"Encerrada" são estados do processo seletivo, sem fonte na API |
| Sem router | Abas são estado local. A página de detalhe usa `pushState` sem trocar a URL — recarregar em `/vaga/123` daria 404 no Pages |
| Cota no `localStorage` | Uma cota mensal que zera no F5 não controla nada |
| As 58 vagas de mock foram apagadas | Com mock dentro não dá para saber se a API está funcionando |

---

## Pendências acumuladas

**Da integração:**

1. **Proxy de produção.** Sem isso o site publicado nunca busca. Uma função
   serverless (Cloudflare Workers, Vercel, Netlify) guardando a chave.
2. **Conferir os demais campos** contra dado real — salário e `job_salary_period`
   ainda não foram vistos numa resposta de verdade.

**Da próxima etapa (a IA):**

3. **Comparação currículo × vaga** para preencher o Rank IA. Já foi decidido o
   desenho: **uma chamada com as N vagas de uma vez, devolvendo só os
   percentuais** — ~4× mais barato que uma chamada por vaga, porque o currículo
   viaja uma vez só e a saída (que custa 5× a entrada) encolhe.
   - Usar `output_config.format` para forçar um array e **validar ids e
     tamanho**; re-rodar individualmente o que faltar.
   - Blocos de 10 a 15 vagas, não 50.
   - Justificativa detalhada só para a vaga que o usuário abrir.
   - A nota vira **relativa ao conjunto** — bom para ranquear, instável como
     "% absoluto" entre buscas diferentes.
4. **Dedução do cargo a partir do currículo**, para a Vaga Inteligente.
5. **Medidor de consumo da Claude.** A aba Controle só conta JSearch. Uma busca
   inteligente custa 1 JSearch + 1 Claude + 1 por vaga comparada — é a parte
   cara e não tem medidor.

**Dívidas menores:**

6. ✎ **`npm run lint` não pega variável inexistente.** Foi o que deixou o
   `registrarBusca` passar. Ligar `no-undef` no `.oxlintrc.json` resolve, e
   **hoje o projeto passa limpo com ele** (conferido — zero erros depois da
   correção):

   ```json
   "env": { "browser": true, "es2024": true },
   "rules": { "no-undef": "error" }
   ```

7. ✎ **O cabeçalho do `cota.js` está desatualizado.** Ele afirma que "o
   protótipo ainda não gasta nenhuma — o `buscar()` não chega à rede". Chega:
   `buscar()` chama a JSearch de verdade desde a integração. O comentário
   descreve o mundo anterior.
8. ✎ **A Vaga Inteligente registra `'rede'` sem tocar a API.** É o que o
   comentário da função manda, mas contradiz a disciplina do `tocouApi`, que
   existe justamente para só contar o que saiu da máquina. Hoje cada clique no
   botão consome uma das 200 no painel sem consumir nada de verdade. Decidir:
   ou o contador espera a chamada existir, ou vira dois números separados
   (gasto real × gasto previsto).
9. `docs/print.png` está muitas mudanças desatualizado — é de 21/08, anterior
   a toda a integração.
10. `ModalNovaVaga` existe no `App.jsx` e **nenhum botão o abre**. Confirmado:
    `setModalAberto(true)` não aparece em lugar nenhum, só os dois `false`.
11. ✎ `App.jsx` está com **3.628 linhas**. A página de detalhe, o combobox e os
    painéis são candidatos naturais a sair para arquivos próprios.

---

## Armadilhas conhecidas

- ✎ **Renomeou função? Procure os chamadores.** `registrarBusca` → `registrarUso`
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
npm run dev        # a busca só funciona aqui — porta 5173, caminho /vagasatalhointeligenteparati/
npm run lint       # oxlint (não pega no-undef hoje; veja a pendência 6)
npm run build      # gera dist/
npm run cidades    # regenera src/data/cidades.js a partir do IBGE
```
