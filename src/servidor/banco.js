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

import { DatabaseSync } from 'node:sqlite'
import { agora, mesclar, temId } from '../vaga.js'

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
 */
export const CAMPOS_PATCH = ['fav', 'seen', 'rank']

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
   */
  function guardar(novas) {
    const lista = Array.isArray(novas) ? novas : []
    const quando = agora()

    for (const nova of lista) {
      if (!temId(nova)) continue
      const velha = bruta(nova.id)
      const final = velha
        ? mesclar(velha, nova)
        : { ...nova, entrouEm: nova.entrouEm ?? quando }
      gravarUma.run(String(final.id), final.entrouEm, JSON.stringify(final))
    }

    aparar.run(teto)
    return listar()
  }

  /**
   * Liga uma das três marcas. `null` quando o id não existe.
   *
   * Não inventa vaga: o acervo guarda o que a busca trouxe, não o que se pediu
   * para atualizar. E `id`/`entrouEm` são reafirmados depois do espalhamento
   * para um patch não conseguir movê-los nem por engano.
   */
  function atualizar(id, campos = {}) {
    const atual = bruta(id)
    if (!atual) return null

    const aceitos = {}
    for (const campo of CAMPOS_PATCH) {
      if (campo in campos) aceitos[campo] = campos[campo]
    }

    const final = { ...atual, ...aceitos, id: atual.id, entrouEm: atual.entrouEm }
    gravarUma.run(String(final.id), final.entrouEm, JSON.stringify(final))
    return final
  }

  /**
   * Fecha o banco.
   *
   * Existe por dois motivos, e o segundo é o que não pode ser removido: além
   * de ser a saída limpa para um banco em memória de teste, este método é a
   * única coisa no objeto devolvido que fecha sobre o `db`.
   *
   * Sem ele, o objeto só referencia os *prepared statements*, e o
   * `DatabaseSync` fica sem nenhuma referência viva. O GC então o coleta, o
   * `node:sqlite` finaliza os statements junto, e toda operação passa a
   * lançar "statement has been finalized" — em produção, 500 em todas as
   * rotas até o processo reiniciar. Reproduzido em 03/09/2026 com
   * `node --expose-gc`.
   */
  function fechar() {
    db.close()
  }

  return { listar, buscarPorId, guardar, atualizar, fechar }
}
