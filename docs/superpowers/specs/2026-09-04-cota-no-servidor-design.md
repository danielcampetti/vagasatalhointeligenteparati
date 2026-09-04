# A cota no servidor — o contador passa a contar a conta

**04/09/2026.** O acervo saiu do navegador ontem. A cota fica: ela ainda mora
no `localStorage`, e por isso conta um navegador quando deveria contar uma
conta. Este documento desenha a mudança — e ela é menor do que a do acervo por
um motivo específico: **o servidor já é quem faz toda requisição à JSearch**.
Contar é registrar o que ele já faz.

---

## 1. O que existe hoje

Levantado no código, não suposto.

O `cota.js` guarda quatro coisas sob a chave `vagas:cota`:

| campo | o que é | tem teto |
|---|---|---|
| `desde` | início do ciclo, posto pelo primeiro uso ou pelo "Zerar" | — |
| `totais` | `{ rede, cache }` — a contagem que o painel mostra | não |
| `usos` | histórico da tela: termo, cidade, janela, hora, origem | 50 |
| `cache` | consulta → `{ vagas, cursor, paginas, quando }` | 20 |

O painel Controle desenha três blocos a partir disso: o número `gastas / 200`
com os botões "Zerar" e "Ajustar"; o cartão do cache com "Limpar cache"; e a
lista "Últimas buscas", que hoje mistura linhas de rede e de cache.

### O defeito, e ele já está escrito no próprio módulo

O docstring do `cota.js` descreve o problema com precisão, e é dele que este
trabalho parte:

> Nem com a contagem certa este número é a cota: as 200 são da conta na OpenWeb
> Ninja, e o `localStorage` é de um navegador e de uma origem. Buscar pelo app
> publicado e pelo `npm run dev` debita as mesmas 200 e alimenta dois
> contadores diferentes, nenhum dos dois sabendo do outro.

O `ajustarContagem` existe **por causa** disso: é a ponte manual entre um
contador que não sabe e um provedor que sabe. Este desenho não elimina essa
ponte — o provedor continua sendo a única fonte da verdade absoluta —, mas
elimina a causa de o número divergir sozinho.

### O fato do desenho atual que muda tudo

Todo pedido à JSearch passa por um proxy nosso. O `jsearch.js` chama
`/api/jsearch/search-v2`, e quem atende é:

- em produção, o `reproxiar` do `server.js` (um `fetch`, resposta em buffer);
- no `npm run dev`, o `server.proxy` do vite (http-proxy, pipe).

**São duas implementações diferentes** — é a mesma divergência que o
`rotas.js` foi criado para fechar no acervo. Qualquer contagem que dependa do
interior de um dos dois vai divergir do outro.

### A regra de o que consome cota já existe

Está no `jsearch.js`, no campo `tocouApi` do `ErroJSearch`:

```js
tocouApi: !guardaLocal && res.status !== 401
```

Mais o `tocouApi: true` do caminho de 200-que-não-é-JSON. Traduzido: consome
cota tudo que a API respondeu, exceto 401; não consome o que nunca saiu da
máquina. Esta regra **não muda** neste trabalho — muda de lugar.

---

## 2. As decisões tomadas

Todas em 04/09, na conversa que precedeu este documento.

| Decisão | Por quê |
|---|---|
| **Contar certo, sem barrar no limite** | O alvo é um número verdadeiro. Recusar requisição quando as 200 acabam é outro trabalho, e não é este |
| **Quem conta é o proxy, no servidor** | É a única contagem que não pode ser duplicada (dois cliques) nem contornada — e conta o `npm run dev` junto, que é o que finalmente une os dois contadores que hoje se ignoram. (Tem um limite: ver §10 — uma aba fechada bem no meio da resposta pode, sim, perder a contagem de uma requisição que já saiu.) |
| **Vão para o servidor: contador + histórico de rede** | O servidor vira o **único escritor** do dado compartilhado. Sem POST de contagem vindo do cliente não há dois caminhos de escrita — a lição que o acervo já pagou com o `PATCH` que apagava nota paga |
| **O cache continua local, e a contagem dele também** | Compartilhar o cache faria as 200 renderem muito mais, e é tentador. É um trabalho maior — mexe no caminho de busca inteiro — e fica para depois |
| **"Zerar" e "Ajustar" atrás de um segredo do ambiente** | São as únicas escritas que o cliente manda, e são destrutivas num app público. Zerar o contador é um estrago que ninguém desfaz: o número verdadeiro só existe no painel do provedor |
| **O gancho é um middleware que observa a resposta** | Ele vê o resultado do HTTP, que é igual nos dois stacks, em vez do interior de dois proxies que não se parecem |
| **Migração à mão, pelo "Ajustar"** | O contador local de cada navegador é um palpite; migrar de dois navegadores somaria dois palpites |

---

## 3. Onde a linha é traçada

O que passa a ser da **conta** (servidor):

- quantas requisições saíram no ciclo;
- quando o ciclo começou;
- que consultas as gastaram.

O que continua sendo do **navegador**:

- o cache das consultas e o cursor de paginação;
- quantas repetições este navegador economizou;
- o segredo do controle, se houver.

A regra que separa: **o que a conta gastou é da conta; o que um navegador
poupou é do navegador.** Misturar os dois na mesma lista foi considerado e
recusado — um fato da conta e um fato de um navegador não pertencem à mesma
coluna.

---

## 4. Os módulos

| arquivo | novo? | o que faz |
|---|---|---|
| `src/servidor/banco.js` | existe | ganha `criarCota(db)`: as tabelas e as operações |
| `src/servidor/contagem.js` | **novo** | o middleware que observa a resposta e decide se conta |
| `src/servidor/rotasCota.js` | **novo** | `GET /api/cota`, `POST /zerar`, `POST /ajustar` |
| `src/servidor/pluginServidor.js` | renomeado | era `pluginAcervo.js`; passa a montar cota e contagem também |
| `server.js` | existe | monta os dois; um handle de banco só |
| `vite.config.js` | existe | marcador `sem-resposta` no `proxy.on('error')` |
| `src/cota.js` | existe | encolhe: perde contador, `desde` e histórico |
| `src/cotaRemota.js` | **novo** | os `fetch` da cota, no molde do `acervoRemoto.js` |
| `src/App.jsx` | existe | painel Controle lê do servidor, com três estados |

### Por que o plugin é renomeado

`pluginAcervo` passaria a montar a cota e a contagem — um nome que descreve um
terço do que o arquivo faz é um nome que engana quem procura onde a cota é
servida sob o `npm run dev`. O rename é mecânico (um import no `vite.config.js`
e o nome do arquivo) e evita que o próximo estado compartilhado seja montado
num arquivo chamado "acervo" de novo.

Ele também é onde o **handle único de banco** vive no dev: um `abrirBanco` só,
passado a `criarAcervo` e a `criarCota`. Dois handles no mesmo arquivo seriam
as duas réplicas que o README proíbe, dentro de um processo só.

### Por que `contagem.js` não conhece proxy

Um `fetch` que virou `arrayBuffer` e um `http-proxy` que fez pipe não têm nada
em comum. O `res.statusCode` no evento `finish` têm. O middleware registra o
listener, chama `next()` e sai do caminho — ele não atrasa nem altera a
resposta, e roda depois que ela já foi enviada.

### A armadilha que o `pluginAcervo` já documenta

Os imports dentro do `configureServer` são **dinâmicos de propósito**. O
`src/api/claude.test.js` importa o `vite.config.js` de verdade e roda em jsdom;
um `import` estático põe `node:sqlite` no grafo daquele teste e a suíte do
cliente inteira cai com "Cannot bundle Node.js built-in `node:sqlite`".

E o banco abre **no primeiro pedido**, não ao montar: o vitest sobe um dev
server interno só para transformar módulos, e abrir o arquivo ao montar faria
`npm test` criar um `acervo.db` no repositório.

As duas valem igual para a cota.

---

## 5. As tabelas

```sql
CREATE TABLE IF NOT EXISTS cota (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  desde TEXT    NOT NULL,
  rede  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS usos (
  quando TEXT NOT NULL,
  dados  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS usos_quando ON usos (quando DESC);
```

Duas colunas e um JSON, pela regra que o `banco.js` já documenta: coluna para o
que o **banco** usa — aqui `quando`, que ordena e corta —, JSON para o resto.

O `dados` sai inteiro da requisição que o proxy acabou de fazer. Nada é
inferido, e nada vem do cliente por outro caminho:

| campo | de onde sai |
|---|---|
| `consulta` | o parâmetro `query` da URL, verbatim |
| `janela` | o `date_posted` — já é o valor de API, traduzido pelo `apiDaJanela` |
| `remotas` | o `work_from_home` está presente? (`presencial` é a ausência dele) |
| `continuacao` | o `cursor` está presente? Distingue "Carregar mais" de busca nova |
| `status` | o status da resposta, o mesmo que decidiu se conta |

**Uma escrita, não duas.** O middleware incrementa o contador e insere a linha
do histórico na **mesma transação**. Separá-las abriria a janela em que uma
requisição foi contada e não aparece na lista, ou aparece e não foi contada — e
uma lista que não explica o número é o defeito de 03/09 voltando por outra
porta.

`CHECK (id = 1)` é o que faz a tabela `cota` ser uma linha só. Sem ele, um
`INSERT` distraído criaria um segundo contador e nada avisaria qual dos dois o
painel lê.

**O incremento é uma instrução:** `UPDATE cota SET rede = rede + 1 WHERE id = 1`.
Sem leitura antes, sem corrida. A premissa de uma réplica só, que o README já
registra, continua valendo e continua não sendo opcional.

**O teto do histórico é 50**, o mesmo `TETO_HISTORICO` de hoje, e pelo mesmo
motivo: é teto de exibição. Aplicado no `DELETE` depois de cada inserção. E
como a contagem vive na tabela `cota`, e não é derivada desta lista, o corte
não pode corromper o número — que é exatamente o defeito de 03/09 e é o que
esta separação existe para tornar impossível.

---

## 6. A regra do que conta

| Situação | Conta? | Como o middleware sabe |
|---|---|---|
| 200 | sim | status, sem marcador |
| 400, 403, 429 | sim | idem — a API respondeu, e cobrou |
| 401 | **não** | a chave é recusada antes do débito |
| Chave ausente no ambiente | **não** | header `x-jsearch-proxy: sem-chave` |
| Upstream inalcançável | **não** | header `x-jsearch-proxy: sem-resposta` |

O marcador `sem-resposta` **não existe hoje** e precisa ser acrescentado aos
dois caminhos de erro: o `catch` do `reproxiar` (que hoje responde 502 nu) e o
`proxy.on('error')` do vite.

Sem ele a regra não é decidível: o 502 que o `server.js` inventa quando não
alcança a JSearch é byte a byte indistinguível de um 502 vindo da JSearch — e
um deles não gastou cota nenhuma. É uma linha em cada lado, e ela é o que
separa "não consegui perguntar" de "perguntaram e deu erro".

---

## 7. As rotas

| Rota | Devolve / faz | Segredo |
|---|---|---|
| `GET /api/cota` | `{ desde, rede, usos: [...], protegido }` | não |
| `POST /api/cota/zerar` | ciclo novo: `desde` = agora, `rede` = 0, histórico vazio | sim |
| `POST /api/cota/ajustar` | corpo `{ gastas }` → põe `rede` no número do provedor | sim |

Sem `DELETE`, como no acervo: o que não existe não é chamado por engano.

O `ajustar` **não toca o histórico**, mantendo a razão que o `cota.js` já
escreve: as linhas que estão lá aconteceram mesmo, e apagá-las para casar com
um número maior seria trocar dado verdadeiro por aparência de coerência.

Valor que não é contagem é ignorado em silêncio, como hoje — o campo da tela é
um `number`, e um `NaN` vindo dele não pode virar o teto do painel.

### O segredo

`CONTROLE_SEGREDO`, variável de ambiente do Railway.

- **Ausente** → os dois POSTs funcionam abertos. O `npm run dev` não passa a
  exigir senha, e quem já roda local não quebra.
- **Definida** → os POSTs exigem o header `x-controle-segredo`; ausente ou
  errado é **403** com o motivo em português.
- O `GET` **nunca** exige. Ler o número não estraga nada, e trancar a leitura
  esconderia a informação de quem o painel existe para informar.

O `protegido` do GET é um booleano — diz à tela se deve pedir a senha, e não
revela nada. O painel guarda o que o dono digitar em `vagas:controle`.

---

## 8. O que muda na tela

O número grande e "Últimas buscas" passam a vir do servidor. O cartão do cache
continua local e passa a dizer o que de fato é: *as repetições que **este
navegador** economizou*.

A bolinha de cada linha do histórico deixa de separar rede/cache — agora toda
linha é rede — e passa a mostrar o **status**: verde no 200, vermelho no 4xx.
Mais informação no mesmo pixel.

### O painel deixa de ser síncrono

Ganha os três estados que a aba Banco de Dados já tem: `carregando`, `pronto`,
`falhou`, com "Tentar de novo".

**Falha de rede não pode virar `0 / 200`.** Seria a falha silenciosa que o
`acervoRemoto.js` inteiro existe para impedir, e aqui ela é pior que no acervo:
diria "você tem as 200 inteiras" para quem já gastou 180, e o conselho
implícito — pode buscar à vontade — custa dinheiro.

### O `cota.js` encolhe

Ficam: `chaveDaConsulta`, `consultarCache`, `paginasDoCache`, `proximaPagina`,
`limparCache`, `TETO_CACHE`, e a contagem de repetições.

Saem: `totais.rede`, `desde`, `usos`, `zerarContagem`, `ajustarContagem`,
`usadas`, `TETO_HISTORICO`.

O `registrarUso` encolhe junto: continua gravando o cache, para de contar rede
e de acumular histórico. **Cuidado registrado no ONDE-PARAMOS:** renomear ou
encolher função sem procurar os chamadores já quebrou uma aba inteira aqui
(`registrarBusca` → `registrarUso`), e o lint não avisou. `grep -n` antes de
dar por encerrado.

---

## 9. Migração

**À mão, pelo "Ajustar", uma vez.** Não há passo automático.

O contador local de cada navegador é um palpite — o próprio módulo diz que
subconta e que só o provedor sabe. Migrar automaticamente somaria os palpites
de cada navegador que abrisse o app. O número certo já tem dono, e o "Ajustar"
é a porta que existe para trazê-lo.

O `vagas:cota` local **não é apagado** de propósito, mesma escolha do
`marcarMigrado` do acervo — apagar seria trocar um backup de graça por nada.
Mas os campos órfãos (`totais.rede`, `usos`, `desde`) não sobrevivem sozinhos:
`registrarUso` sempre grava no formato novo (`{ totais: { cache }, cache }`),
então a primeira busca depois do deploy — não uma limpeza deliberada — já
reescreve o `localStorage` sem eles. `src/cota.js` documenta isso honestamente
no próprio código; esta seção estava descrevendo um comportamento que nunca
chegou a existir.

---

## 10. O que quebra, e como avisa

**A busca nunca pode falhar por causa do contador.** O middleware roda no
`finish`, depois de a resposta ter saído — ele não tem como afetá-la nem se
quiser. Um erro de banco ali vira `console.error` e nada mais.

**Um `GET /api/cota` que falha** vira o estado `falhou` do painel, com a
mensagem em português e o botão de tentar de novo. Nunca zero.

**Um 403 nos POSTs** aparece como um aviso vermelho no painel, com o motivo
escrito — e não desabilitando os dois botões. É melhor assim: a senha errada é
o caso comum, e "Zerar"/"Ajustar" continuam clicáveis para digitar de novo e
tentar, sem precisar recarregar a página para reativá-los.

### Um limite conhecido: aba fechada no meio da resposta

`res.on('finish')` **não** dispara quando o socket do cliente cai antes de a
resposta terminar de sair — verificado, não suposto. O `fetch` do `reproxiar`
para a JSearch não está amarrado à conexão do cliente: ele já saiu e a conta
já foi debitada na OpenWeb Ninja antes de o `finish` ter chance de disparar —
então uma aba fechada bem nesse instante gasta uma das 200 sem que o
contador se mova. É raro — a janela é os poucos milissegundos entre a
resposta do upstream e o fim do envio ao cliente —, mas existe, e a decisão
de mudar isso é do dono do projeto, não deste documento.

O conserto óbvio, `res.on('close')`, **sempre** dispara — inclusive num
pedido normal, depois do `finish` — mas trocar um pelo outro não é de graça:
`close` também dispara num abort **antes** do `fetch` ao upstream sair, e
contaria uma requisição que talvez nunca tenha sido feita; e dispara antes de
o marcador `sem-chave` estar necessariamente gravado no `res`, o que
quebraria a distinção da §6 bem no caso que ela existe para decidir.

---

## 11. Fora de escopo, de propósito

- **Barrar a requisição no limite.** Decidido: o alvo é contar certo.
- **Cache compartilhado.** É onde está o maior ganho sobre as 200, e é um
  trabalho próprio.
- **Autenticação de verdade.** O segredo do ambiente fecha a porta destrutiva;
  o resto do app continua público, como o README já avisa.
- **Renovação automática do ciclo.** O provedor conta pela data da assinatura,
  não pelo dia 1º, e adivinhar isso daria um número errado — a razão já está
  escrita no `zerarContagem`.
- **Unificar os dois proxies.** Atraente e desnecessário para contar.

---

## 12. Testes

Na forma do `rotas.test.js`: express de verdade na porta 0, `fetch` de verdade,
banco `:memory:`.

- **`contagem.test.js`** — a tabela da §6, linha por linha: 200 conta, 429
  conta, 400 conta, 401 não, `sem-chave` não, `sem-resposta` não.
- **`rotasCota.test.js`** — GET num banco vazio devolve zero e não 404; zerar
  reinicia ciclo e histórico; ajustar muda o número e **não** toca o histórico;
  403 com segredo definido e header ausente; aberto quando a variável não
  existe; `protegido` reflete o ambiente.
- **`banco.test.js`** — incremento; teto de 50; `fechar()` segurando o handle,
  pelo defeito de 03/09.
- **O middleware não derruba a busca**: com o banco quebrado, a resposta da
  busca chega intacta.
- **Navegador, nos dois modos.** `npm run dev` e `node server.js` contra o
  `dist/`. "Verificar num modo não verifica no outro" já custou um dia aqui, e
  este trabalho mexe justamente no que difere entre os dois.

Cada teste de regressão precisa ser visto falhando com o defeito presente antes
de valer — a regra de 03/09, que já pegou dois testes que passavam com e sem o
defeito.

---

## 13. Ordem sugerida

1. `banco.js`: tabelas e `criarCota` — testável sozinho, sem HTTP.
2. `contagem.js`: o middleware e a regra — testável sozinho, sem banco real.
3. O marcador `sem-resposta` nos dois proxies.
4. `rotasCota.js` e o segredo.
5. Montagem: `server.js` e o plugin do vite, com um handle de banco só.
6. `cotaRemota.js`.
7. O painel Controle e o encolhimento do `cota.js`.
8. Verificação nos dois modos, e deploy.

Os passos 1 e 2 não dependem um do outro e não tocam nada que já funciona — é
por onde começa.
