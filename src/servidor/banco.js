/**
 * O acervo compartilhado, em SQLite.
 *
 * Primeiro estado do app que não mora num navegador. Até aqui tudo era
 * `localStorage`, e a consequência foi o defeito que motivou este trabalho: o
 * que o `npm run dev` juntava não estava no Railway, e vice-versa.
 *
 * ## Três colunas, não vinte
 *
 * `id` e `entrouEm` saem para fora porque são os dois que o **banco** usa:
 * dedupe e ordenação/teto. A vaga inteira vai em `dados`, JSON.
 *
 * O motivo está registrado no ONDE-PARAMOS: "nomes de campo da API: confira,
 * não deduza" — `job_is_remote` não existe, o certo é `work_arrangement`, e o
 * chute custou duas colunas vazias. O `mapear.js` já mudou de forma e vai
 * mudar de novo; com colunas enumeradas, cada campo novo viraria migração de
 * schema. O preço é não filtrar em SQL, e ele é zero hoje: o
 * `filtroAcervo.js` recorta a lista inteira no navegador.
 *
 * ## Por que não conhece HTTP
 *
 * Para ser testável com `:memory:`, sem subir servidor e sem porta. As rotas
 * ficam finas o bastante para o teste delas ser sobre transporte.
 *
 * ## node:sqlite
 *
 * Embutido no Node 22.14 — zero dependência nova, que era o requisito. Emite
 * um `ExperimentalWarning` no log; é esperado, não é falha.
 */

import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import { MARCAS, agora, mesclar, sanearMarcas, temId } from '../vaga.js'

/**
 * O teto do acervo compartilhado.
 *
 * Os 500 do `acervo.js` vinham dos ~5 MB do `localStorage`, restrição que some
 * no volume. O que limita agora é a resposta do `GET`: a ~0,9 KB por vaga sem
 * descrição, 2000 dão ~1,8 MB numa aba que carrega uma vez.
 *
 * Subir daqui exige paginar, e paginar mexe no `filtroAcervo.js` e nos
 * dropdowns, que hoje leem o acervo inteiro.
 */
export const TETO = 2000

/**
 * Os únicos campos que um PATCH pode mudar.
 *
 * Sem login, esta rota é uma porta aberta. Aceitar a vaga inteira daria a
 * qualquer visitante o poder de reescrever `cargo`, `link` ou `descricao` de
 * uma vaga que outra pessoa pagou para trazer. As três marcas são o que a
 * tela de fato altera.
 *
 * É a lista do `vaga.js`, não uma cópia: filtrar por nome e coagir por tipo
 * (`sanearMarcas`) precisam falar das mesmas três chaves, senão uma marca nova
 * entraria numa lista e não na outra.
 */
export const CAMPOS_PATCH = MARCAS

/**
 * O teto da descrição guardada, em caracteres.
 *
 * Medido em 03/09/2026 sobre 88 vagas reais: 2,7 KB por vaga, dos quais 66% é a
 * descrição — ou seja, ~1,8 KB de descrição típica. 20 mil caracteres deixam
 * folga de uma ordem de grandeza para o anúncio mais prolixo e ainda assim
 * impedem que um POST despeje megabytes num campo só.
 *
 * O que motiva o corte é o volume: o que entra ali sobrevive a restart e a
 * deploy, e não há `DELETE` para desfazer.
 */
export const LIMITE_DESCRICAO = 20000

/**
 * Onde o acervo mora, para quem precisa abri-lo.
 *
 * Mora aqui, e não no `server.js`, porque agora há dois processos que abrem o
 * mesmo banco: o servidor de produção e o plugin que serve `/api/acervo` sob o
 * `npm run dev`. Dois cálculos de caminho seriam duas chances de divergirem — e
 * divergir aqui é exatamente o defeito que este trabalho veio corrigir.
 *
 * No Railway é um volume: o disco comum de lá é efêmero, e sem volume o banco
 * morre a cada deploy. Local o padrão é um arquivo ao lado do código, porque o
 * README promete que o `npm run dev` e o Railway se comportam igual e exigir
 * volume para rodar na máquina de quem desenvolve quebraria essa promessa.
 */
export function caminhoDoBanco() {
  const daVez = process.env.BANCO_CAMINHO?.trim()
  if (daVez) return daVez
  return path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'acervo.db')
}

/**
 * A data de entrada, quando dá para confiar nela.
 *
 * `entrouEm` é o critério de descarte do teto, e vinha do cliente sem
 * conferência: uma vaga com `9999-12-31` ordenava em primeiro para sempre e
 * nunca era aparada. 2000 delas num POST despejavam o acervo real inteiro, pela
 * única rota de escrita que existe.
 *
 * Passa o que é data válida e não está no futuro — a migração do
 * `localStorage` manda datas do passado, e é ela a razão de o campo ser aceito.
 * O resto cai na hora do servidor. Normaliza para ISO de propósito: a ordenação
 * é `ORDER BY entrouEm DESC` sobre TEXT, e formato misturado ordenaria errado.
 */
function entrouEmAceito(bruto, padrao) {
  if (typeof bruto !== 'string') return padrao
  const instante = Date.parse(bruto)
  if (!Number.isFinite(instante)) return padrao
  if (instante > Date.parse(padrao)) return padrao
  return new Date(instante).toISOString()
}

/** A descrição cortada no teto. `null` e `undefined` viram string vazia. */
function descricaoPodada(bruta) {
  if (bruta === undefined || bruta === null) return ''
  return String(bruta).slice(0, LIMITE_DESCRICAO)
}

/**
 * A vaga que chegou, com o que é de fora já domado.
 *
 * `CAMPOS_PATCH` e o filtro do POST cuidam de **quais** campos entram; isto
 * cuida de **o que** eles podem valer e pesar. Sem login as duas rotas de
 * escrita são portas abertas, e o que passa por elas fica no volume.
 */
function domada(nova) {
  const limpa = { ...nova, ...sanearMarcas(nova) }
  if ('descricao' in limpa) limpa.descricao = descricaoPodada(limpa.descricao)
  return limpa
}

/** Abre (ou cria) o banco e garante o schema. `:memory:` para teste. */
export function abrirBanco(caminho = ':memory:') {
  const db = new DatabaseSync(caminho)
  db.exec(`
    CREATE TABLE IF NOT EXISTS vagas (
      id       TEXT PRIMARY KEY,
      entrouEm TEXT NOT NULL,
      dados    TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS vagas_entrouem ON vagas(entrouEm DESC);
    CREATE TABLE IF NOT EXISTS cota (
      id    INTEGER PRIMARY KEY CHECK (id = 1),
      desde TEXT    NOT NULL,
      rede  INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS usos (
      quando TEXT NOT NULL,
      dados  TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS usos_quando ON usos(quando DESC);
  `)
  return db
}

/** A lista da tela não carrega descrição — ver o docstring de `listar`. */
function semDescricao(vaga) {
  const { descricao: _descricao, ...resto } = vaga
  return resto
}

export function criarAcervo(db, { teto = TETO } = {}) {
  const lerUma = db.prepare('SELECT dados FROM vagas WHERE id = ?')
  const gravarUma = db.prepare(
    `INSERT INTO vagas (id, entrouEm, dados) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET dados = excluded.dados`,
  )
  const listarTodas = db.prepare('SELECT dados FROM vagas ORDER BY entrouEm DESC')
  // `LIMIT -1 OFFSET ?` é o idioma do SQLite para "tudo depois dos N
  // primeiros". Como a ordem é `entrouEm DESC`, o que sobra do offset são
  // exatamente as mais antigas.
  const aparar = db.prepare(
    `DELETE FROM vagas WHERE id IN (
       SELECT id FROM vagas ORDER BY entrouEm DESC LIMIT -1 OFFSET ?
     )`,
  )

  function bruta(id) {
    const linha = lerUma.get(String(id))
    return linha ? JSON.parse(linha.dados) : null
  }

  /**
   * A lista da tela: tudo menos `descricao`.
   *
   * Medido em 03/09/2026 sobre 88 vagas reais: 2,7 KB por vaga, e 66% disso é
   * a descrição. A tabela não a mostra — quem precisa dela é a página de
   * detalhe, e ela busca por id. Mandar tudo seria triplicar a resposta para
   * um campo que ninguém lê nesta tela.
   */
  function listar() {
    return listarTodas.all().map((l) => semDescricao(JSON.parse(l.dados)))
  }

  /** A vaga inteira, com descrição. `null` quando não existe. */
  function buscarPorId(id) {
    return bruta(id)
  }

  /**
   * Acrescenta as vagas de uma busca. Acrescenta, nunca substitui.
   *
   * O merge é o `mesclar` de `vaga.js`, em JS, lendo o JSON antigo — e não um
   * `ON CONFLICT DO UPDATE` que reescrevesse as regras em SQL. O `ON CONFLICT`
   * daqui só troca `dados`; `entrouEm` fica de fora do `SET` de propósito,
   * porque ele é o critério de descarte do teto e precisa ser estável.
   *
   * ## A leva é uma transação só
   *
   * Cada `run` era a sua própria transação implícita, e uma vaga que falhasse
   * no meio deixava as anteriores gravadas e as seguintes de fora, calado.
   * Ficar pela metade é pior que não gravar: metade de uma busca é um acervo
   * que ninguém sabe que está incompleto. E o `dados` em JSON existe
   * justamente porque o `mapear.js` já mudou de forma e vai mudar de novo — o
   * risco de uma vaga inesperada vem junto com essa liberdade.
   *
   * De quebra, N fsyncs viram um, o que num volume atrás da rede não é detalhe.
   */
  function guardar(novas) {
    const lista = Array.isArray(novas) ? novas : []
    const quando = agora()

    db.exec('BEGIN')
    try {
      for (const bruta_ of lista) {
        if (!temId(bruta_)) continue
        const nova = domada(bruta_)
        const velha = bruta(nova.id)
        const fundida = velha ? mesclar(velha, nova) : nova
        // Confere também na mescla, e não só na inserção: uma linha gravada
        // antes desta trava carrega a data do futuro no JSON, e é a próxima
        // escrita dela que a conserta.
        const final = { ...fundida, entrouEm: entrouEmAceito(fundida.entrouEm, quando) }
        gravarUma.run(String(final.id), final.entrouEm, JSON.stringify(final))
      }

      aparar.run(teto)
      db.exec('COMMIT')
    } catch (err) {
      // O `ROLLBACK` vai em try próprio para o erro dele — banco já fechado,
      // transação já desfeita — não substituir o erro de verdade, que é o que
      // diz qual vaga derrubou a leva.
      try {
        db.exec('ROLLBACK')
      } catch {
        // Desfazer já falhou; quem manda é o erro original.
      }
      throw err
    }

    return listar()
  }

  /**
   * Liga uma das três marcas. `null` quando o id não existe.
   *
   * Não inventa vaga: o acervo guarda o que a busca trouxe, não o que se pediu
   * para atualizar. E `id`/`entrouEm` são reafirmados depois do espalhamento
   * para um patch não conseguir movê-los nem por engano.
   *
   * ## Por que passa pelo `mesclar`
   *
   * Este é o **segundo** caminho de escrita, e por um tempo ele atribuía os
   * campos como vieram — as quatro regras do `mesclar` valiam só no POST. O
   * estrago não era hipotético, era o caso normal: A roda a Avaliação IA e a
   * vaga ganha `rank: 87` no servidor; a aba de B carregou antes disso; B abre
   * a vaga para ler, o que liga `seen`, e o PATCH leva junto a cópia velha de B
   * — `rank: null`, `fav: false`. Um clique apagava a nota que A pagou.
   *
   * A afirmação central do desenho é que essas quatro regras moram num lugar
   * só. Passar por `mesclar` com as marcas no papel de "vaga nova" é o que
   * torna isso verdade em vez de intenção: `fav` e `seen` só ligam, `rank`
   * ausente não apaga o antigo, e `descricao` — que o PATCH nunca manda —
   * sobrevive por construção.
   *
   * A consequência a saber de cor: **o PATCH não desliga marca**. Hoje não
   * custa nada, porque o único chamador é o `seen` de `abrirVaga` e o
   * "Favoritar" saiu do menu. Mas se um dia existir "Desfavoritar", ele não
   * funciona por aqui — o desligar teria que ser uma operação própria, e
   * decidir se desligar o favorito de todo mundo é o comportamento desejado
   * num acervo compartilhado é uma pergunta para o dono do projeto.
   */
  function atualizar(id, campos = {}) {
    const atual = bruta(id)
    if (!atual) return null

    const final = {
      ...mesclar(atual, sanearMarcas(campos)),
      id: atual.id,
      entrouEm: atual.entrouEm,
    }
    gravarUma.run(String(final.id), final.entrouEm, JSON.stringify(final))
    return final
  }

  /** Fecha o banco. A saída limpa de um banco em memória de teste. */
  function fechar() {
    db.close()
  }

  /**
   * O `db` sai no objeto, e isso não é vazamento de detalhe — é a trava.
   *
   * Sem nenhuma referência viva ao `DatabaseSync`, o V8 é livre para coletá-lo
   * a qualquer momento; o `node:sqlite` finaliza os *prepared statements*
   * junto, e toda operação passa a lançar "statement has been finalized". Em
   * produção isso é 500 em todas as rotas até o processo reiniciar. Reproduzido
   * em 03/09/2026 com `node --expose-gc`.
   *
   * Por um tempo a única coisa que segurava o `db` era o `fechar` fechar sobre
   * ele — um export sem chamador em produção, com um comentário pedindo para
   * não ser apagado. Comentário não é trava: é exatamente o tipo de coisa que
   * uma limpeza futura remove "porque ninguém usa". Nomeado no objeto, sumir
   * dele exige apagar um campo que o teste cobre. (O `guardar` também o
   * referencia agora, pelo `BEGIN`/`COMMIT` — duas amarras, não uma.)
   */
  return { db, listar, buscarPorId, guardar, atualizar, fechar }
}

/**
 * Quantas buscas o histórico guarda.
 *
 * É teto de **exibição**, o mesmo 50 que o `cota.js` usava. Ele pode cortar à
 * vontade porque a contagem não sai daqui: mora na coluna `rede` da tabela
 * `cota`. Era exatamente a contagem derivada de uma lista com teto que fazia o
 * painel mostrar 3/200 com 50 gastas — cada repetição empurrava uma requisição
 * paga para fora do corte, e o número encolhia sozinho.
 */
export const TETO_USOS = 50

/**
 * A cota da conta, no mesmo banco do acervo.
 *
 * Quem escreve aqui é o proxy, e ninguém mais: o `contagem.js` chama
 * `registrar` depois de cada requisição que de fato saiu. O navegador só lê —
 * fora `zerar` e `ajustar`, que são operação do dono e passam pelo segredo.
 *
 * ## Uma linha, garantida pelo schema
 *
 * `CHECK (id = 1)` é o que faz a tabela `cota` ser um singleton. Sem ele, um
 * `INSERT` distraído criaria um segundo contador e nada avisaria qual dos dois
 * o painel lê.
 */
export function criarCota(db, { teto = TETO_USOS } = {}) {
  const abrirCiclo = db.prepare(
    'INSERT INTO cota (id, desde, rede) VALUES (1, ?, 0) ON CONFLICT(id) DO NOTHING',
  )
  const lerLinha = db.prepare('SELECT desde, rede FROM cota WHERE id = 1')
  const incrementar = db.prepare('UPDATE cota SET rede = rede + 1 WHERE id = 1')
  const porNumero = db.prepare('UPDATE cota SET rede = ? WHERE id = 1')
  const reiniciar = db.prepare('UPDATE cota SET desde = ?, rede = 0 WHERE id = 1')
  const gravarUso = db.prepare('INSERT INTO usos (quando, dados) VALUES (?, ?)')
  const listarUsos = db.prepare('SELECT quando, dados FROM usos ORDER BY quando DESC')
  const limparUsos = db.prepare('DELETE FROM usos')
  // `LIMIT -1 OFFSET ?` é o idioma do SQLite para "tudo depois dos N
  // primeiros" — o mesmo do `aparar` do acervo. Com a ordem `quando DESC`, o
  // que sobra do offset são as linhas mais antigas.
  const apararUsos = db.prepare(
    `DELETE FROM usos WHERE rowid IN (
       SELECT rowid FROM usos ORDER BY quando DESC LIMIT -1 OFFSET ?
     )`,
  )

  function ler() {
    abrirCiclo.run(agora())
    const linha = lerLinha.get()
    return {
      desde: linha.desde,
      rede: Number(linha.rede),
      usos: listarUsos.all().map((l) => ({ quando: l.quando, ...JSON.parse(l.dados) })),
    }
  }

  /**
   * Uma requisição que saiu: o número sobe e a linha entra.
   *
   * As duas na **mesma transação**. Separadas, existiria a janela em que a
   * requisição foi contada e não aparece na lista — e uma lista que não
   * explica o número é o defeito de 03/09 voltando por outra porta.
   *
   * **Depende de nunca intercalar com o `BEGIN`/`COMMIT` do `guardar`.** Os
   * dois usam transação crua no mesmo `DatabaseSync`, e um `ROLLBACK` daqui no
   * meio da leva do `guardar` desfaria a busca inteira que ela está gravando.
   * Hoje isso não acontece porque os dois são inteiramente síncronos — o
   * `node:sqlite` é síncrono e o Node não tem como entregar o `finish` do
   * `contarJSearch` no meio de nenhum dos dois. No dia em que um dos dois
   * ganhar um `await` ou virar savepoint, essa garantia some, e o
   * `contagem.js` engole o estrago como `console.error`.
   */
  function registrar(dados = {}, quando = agora()) {
    db.exec('BEGIN')
    try {
      abrirCiclo.run(quando)
      incrementar.run()
      gravarUso.run(quando, JSON.stringify(dados))
      apararUsos.run(teto)
      db.exec('COMMIT')
    } catch (err) {
      // O erro do ROLLBACK não pode substituir o erro de verdade — mesma
      // razão do `guardar` do acervo.
      try {
        db.exec('ROLLBACK')
      } catch {
        // Desfazer já falhou; quem manda é o original.
      }
      throw err
    }
    return ler()
  }

  /**
   * Ciclo novo: zera o número, a data e o histórico.
   *
   * À mão, e não por calendário: o provedor conta pela data da assinatura, não
   * pelo dia 1º, e adivinhar isso daria um número errado.
   */
  function zerar(quando = agora()) {
    db.exec('BEGIN')
    try {
      abrirCiclo.run(quando)
      reiniciar.run(quando)
      limparUsos.run()
      db.exec('COMMIT')
    } catch (err) {
      try {
        db.exec('ROLLBACK')
      } catch {
        // idem
      }
      throw err
    }
    return ler()
  }

  /**
   * Põe o contador no número que o provedor mostra.
   *
   * **O histórico não é tocado.** As linhas que estão lá aconteceram mesmo, e
   * apagá-las para casar com um número maior seria trocar dado verdadeiro por
   * aparência de coerência.
   *
   * Valor que não é contagem é ignorado em silêncio: o campo da tela é um
   * `number`, e um `NaN` vindo dele não pode virar o teto do painel.
   */
  function ajustar(gastas) {
    const alvo = Math.round(Number(gastas))
    if (!Number.isInteger(alvo) || alvo < 0) return ler()
    abrirCiclo.run(agora())
    porNumero.run(alvo)
    return ler()
  }

  // `db` sai no objeto pela razão que o `criarAcervo` documenta: sem uma
  // referência viva ao `DatabaseSync`, o GC o coleta, o `node:sqlite` finaliza
  // os statements, e toda rota passa a dar 500 até o processo reiniciar.
  return { db, ler, registrar, zerar, ajustar }
}
