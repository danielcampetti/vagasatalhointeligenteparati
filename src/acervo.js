/**
 * O acervo: as vagas que a busca já trouxe, guardadas para valer.
 *
 * ## O defeito que este módulo veio corrigir
 *
 * A aba Banco de Dados não acumulava nada. As duas abas liam o mesmo estado
 * `banco` do `App.jsx` — "base única", como dizia o comentário — e `buscar()`
 * o **substituía**. Reproduzido em 2026-09-03: buscar em Caxias do Sul dava 10
 * linhas, buscar em Porto Alegre em seguida dava 10 de novo, nunca 20. As de
 * Caxias não tinham para onde ir.
 *
 * Dois agravantes vinham junto: o caminho de erro fazia `setBanco([])`, então
 * uma busca que falhava (um 504 da API basta) esvaziava a tela inteira; e
 * `banco` nascia do `BANCO_DE_VAGAS`, que está vazio, sem nunca reidratar —
 * recarregar a página perdia tudo.
 *
 * A correção é separar as duas listas. `banco` continua sendo o resultado da
 * busca corrente, que é a aba Vagas. O acervo é isto aqui, e é o que a aba
 * Banco de Dados passa a ler.
 *
 * ## Por que um store próprio, e não uma leitura do `cota.cache`
 *
 * O cache já guarda as vagas, por consulta, e daria para somar suas chaves.
 * Mas o cache é **descartável por natureza**: existe para poupar as 200
 * requisições do mês, e "Limpar cache" na aba Controle é a ferramenta de quem
 * precisa de espaço. Se o acervo fosse derivado dele, liberar espaço apagaria
 * o histórico — e uma vaga cadastrada à mão, que não pertence a consulta
 * nenhuma, não teria onde morar.
 *
 * São coisas com tempos de vida diferentes, então são dois stores.
 *
 * ## O teto, e por que ele não é opcional
 *
 * `localStorage` dá ~5 MB por origem, e o `gravar` abaixo **engole** o
 * QuotaExceededError — como o do `cota.js`, e pelo mesmo motivo: o contador
 * não pode derrubar a página. A consequência é que um acervo sem teto falharia
 * do pior jeito possível: pararia de crescer em silêncio, sem nada na tela.
 *
 * Medido em 2026-09-03, nas 88 vagas que 5 consultas reais deixaram no cache:
 * 2,7 KB por vaga, dos quais 66% é a `descricao`. O teto de 500 dá ~1,3 MB —
 * folgado, e com a descrição preservada, que é o que a página de detalhe
 * mostra e o que o reranking manda para a Claude.
 */

import { agora, mesclar, temId } from './vaga'

export const TETO = 500

const CHAVE = 'vagas:acervo'

const VAZIO = { vagas: [], semeado: false, migrado: false }

/**
 * O acervo inteiro, ou vazio quando ilegível.
 *
 * Defensiva como a do `cota.js`: em aba anônima, com storage bloqueado ou com
 * o valor corrompido por uma versão anterior, o acesso lança. Um acervo que
 * não abre é ruim; uma tela que não abre por causa dele seria pior.
 */
export function lerAcervo() {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return { ...VAZIO, vagas: [] }
    const dados = JSON.parse(cru)
    return {
      vagas: Array.isArray(dados?.vagas) ? dados.vagas : [],
      semeado: dados?.semeado === true,
      migrado: dados?.migrado === true,
    }
  } catch {
    return { ...VAZIO, vagas: [] }
  }
}

function gravar(acervo) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(acervo))
  } catch {
    // Storage cheio ou bloqueado: o acervo vira volátil nesta sessão. O valor
    // devolvido continua correto, então a tela mostra a verdade mesmo quando
    // ela não chegou ao disco.
  }
  return acervo
}

/**
 * Acrescenta as vagas de uma busca ao acervo e devolve o resultado.
 *
 * Acrescenta, nunca substitui — é o defeito inteiro que este módulo corrige.
 *
 * As novas entram na frente porque a ordem natural de um histórico é a mais
 * recente primeiro, e é a mesma ponta que o teto preserva: o corte é no fim
 * da lista, que é onde estão as mais antigas.
 *
 * Vaga sem `id` é recusada. Ela não teria como ser desduplicada nem
 * atualizada depois — entraria como lixo que nenhuma operação alcança.
 */
export function guardarVagas(novas) {
  const acervo = lerAcervo()
  const lista = Array.isArray(novas) ? novas : []

  const porId = new Map(acervo.vagas.map((v) => [v.id, v]))
  const entrantes = []
  const quando = agora()

  for (const nova of lista) {
    if (!temId(nova)) continue
    const velha = porId.get(nova.id)
    if (velha) {
      porId.set(nova.id, mesclar(velha, nova))
    } else {
      const entrante = { ...nova, entrouEm: nova.entrouEm ?? quando }
      porId.set(nova.id, entrante)
      entrantes.push(entrante)
    }
  }

  const jaEstavam = acervo.vagas.map((v) => porId.get(v.id))
  const todas = [...entrantes, ...jaEstavam].slice(0, TETO)

  return gravar({ ...acervo, vagas: todas })
}

/**
 * Aplica `fn` à vaga de `id`, se ela estiver no acervo.
 *
 * É por aqui que favoritar e marcar como lida chegam ao disco. Id ausente não
 * inventa vaga: o acervo guarda o que a busca trouxe, não o que se pediu para
 * atualizar.
 */
export function atualizarNoAcervo(id, fn) {
  const acervo = lerAcervo()
  return gravar({
    ...acervo,
    vagas: acervo.vagas.map((v) => (v.id === id ? fn(v) : v)),
  })
}

export function removerDoAcervo(id) {
  const acervo = lerAcervo()
  return gravar({ ...acervo, vagas: acervo.vagas.filter((v) => v.id !== id) })
}

/** Esvazia o acervo, mas não desarma a semeadura — ver `semear`. */
export function limparAcervo() {
  return gravar({ ...lerAcervo(), vagas: [] })
}

/**
 * A carga inicial, uma vez só.
 *
 * Quando o acervo entrou em cena havia 88 vagas paradas no `cota.cache`, já
 * baixadas e já debitadas das 200 do mês. Estrear a aba vazia seria jogar fora
 * o que a cota comprou, então a primeira execução se serve do que o cache
 * guardou.
 *
 * O que torna isso seguro é a marca `semeado`, e ela é a parte que importa:
 * sem ela, quem apagasse uma vaga do acervo a veria voltar no recarregamento
 * seguinte — porque ela continua no cache — e o "apagar" não apagaria nada.
 *
 * Cache vazio marca como semeado assim mesmo. Do contrário a semeadura ficaria
 * armada para disparar mais tarde, despejando um cache antigo dentro de um
 * acervo que já tem vida própria.
 */
export function semear(doCache) {
  const acervo = lerAcervo()
  if (acervo.semeado) return acervo

  gravar({ ...acervo, semeado: true })
  return guardarVagas(doCache)
}

/**
 * O que ainda não subiu para o servidor.
 *
 * Depois de `marcarMigrado`, devolve vazio para sempre — sem isso o acervo
 * local voltaria a subir a cada carga, e qualquer coisa que o servidor fizesse
 * com aquelas vagas seria desfeita na sessão seguinte. É o mesmo mecanismo do
 * `semeado`, pelo mesmo motivo.
 */
export function lerParaMigrar() {
  const acervo = lerAcervo()
  return acervo.migrado ? [] : acervo.vagas
}

/**
 * Fecha a migração.
 *
 * **Não apaga o acervo local**, só o marca. Se a subida der errado do outro
 * lado, o dado ainda está aqui para ser reenviado à mão — e apagá-lo seria
 * trocar um backup de graça por nada.
 *
 * Acervo vazio marca assim mesmo, senão a migração ficaria armada para
 * disparar mais tarde, despejando um acervo velho dentro de um servidor que já
 * tem vida própria.
 */
export function marcarMigrado() {
  return gravar({ ...lerAcervo(), migrado: true })
}
