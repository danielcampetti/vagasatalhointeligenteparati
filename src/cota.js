/**
 * Controle da cota de requisições da JSearch.
 *
 * O plano gratuito dá 200 chamadas por mês, e o protótipo ainda não gasta
 * nenhuma — o `buscar()` não chega à rede. Este módulo registra o que *seria*
 * gasto, para o número já estar de pé quando a chamada real entrar.
 *
 * É a única coisa do protótipo que sobrevive ao recarregamento. Uma cota
 * mensal que zera a cada F5 não controla nada, então aqui vale `localStorage`
 * — que continua sendo só a máquina de quem abre, sem servidor no meio.
 *
 * Toda leitura e escrita é defensiva: em aba anônima, com storage bloqueado ou
 * com o valor corrompido por uma versão anterior, o acesso lança. A tela não
 * pode quebrar por causa do contador — no pior caso ele volta a zero.
 */

export const LIMITE_MENSAL = 200

const CHAVE = 'vagas:cota'

const VAZIO = { desde: null, usos: [], cache: {} }

/** Só o que a tela precisa saber para desenhar o painel. */
export function lerCota() {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return { ...VAZIO, usos: [], cache: {} }
    const dados = JSON.parse(cru)
    // Um formato antigo ou adulterado não pode derrubar a página.
    return {
      desde: typeof dados.desde === 'string' ? dados.desde : null,
      usos: Array.isArray(dados.usos) ? dados.usos : [],
      cache:
        dados.cache && typeof dados.cache === 'object' ? dados.cache : {},
    }
  } catch {
    return { ...VAZIO, usos: [], cache: {} }
  }
}

function gravar(cota) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(cota))
  } catch {
    // Storage cheio ou bloqueado: o contador vira volátil nesta sessão, mas a
    // busca em si não tem por que falhar.
  }
  return cota
}

/** A consulta que identifica uma requisição. Vazia dos dois lados = nenhuma. */
export function chaveDaConsulta(termo, cidade) {
  const t = termo.trim()
  const c = cidade.trim()
  if (!t && !c) return null
  return `${t}|${c}`
}

/** Quantas consultas o cache guarda. Cada uma carrega as vagas inteiras, com
 *  descrição — o localStorage tem uns 5 MB e não vale enchê-lo de histórico. */
const TETO_CACHE = 20

/**
 * O resultado já guardado para esta consulta, ou `null`.
 *
 * Consultar não registra nada: quem registra é `registrarUso`, depois que o
 * chamador decidiu o que fazer. Separar os dois é o que permite **não chamar a
 * API** quando há cache — antes o cache só contabilizava, agora ele evita a
 * requisição, que era o ponto.
 */
export function consultarCache(termo, cidade) {
  const chave = chaveDaConsulta(termo, cidade)
  if (!chave) return null
  const entrada = lerCota().cache[chave]
  if (!entrada || !Array.isArray(entrada.vagas)) return null
  return entrada
}

/**
 * Registra uma busca e devolve a cota atualizada.
 *
 * `origem` é decidida por quem chamou: 'rede' se a requisição saiu, 'cache' se
 * foi servida do que já estava guardado. Consulta vazia não registra nada —
 * não haveria requisição a fazer.
 *
 * O quarto argumento é um objeto (`{ vagas, cursor }`) e não a lista solta que
 * era antes: com a paginação por cursor passaram a ser duas coisas a guardar,
 * e dois parâmetros posicionais seguidos, ambos opcionais, seriam trocados um
 * pelo outro na primeira chamada distraída. Só as buscas de rede que voltaram
 * com resultado o passam — é o que o cache guarda para a próxima repetição não
 * custar cota.
 */
export function registrarUso(
  termo,
  cidade,
  origem,
  { vagas = null, cursor = null } = {},
  agora = new Date(),
) {
  const chave = chaveDaConsulta(termo, cidade)
  if (!chave) return lerCota()

  const cota = lerCota()
  const quando = agora.toISOString()

  let cache = cota.cache
  if (origem === 'rede' && Array.isArray(vagas)) {
    // `cursor` é o ponto de continuação da paginação do `search-v2`, guardado
    // ao lado das vagas porque pertence à mesma consulta: sem ele, repetir a
    // busca devolveria tudo o que já foi carregado mas perderia o direito de
    // pedir a próxima página, e o botão "Carregar mais" sumiria sem motivo
    // visível. `null` aqui significa última página, e é diferente de ausente.
    cache = { ...cache, [chave]: { quando, vagas, cursor } }
    // Descarta as entradas mais antigas quando passa do teto.
    const chaves = Object.keys(cache)
    if (chaves.length > TETO_CACHE) {
      const ordenadas = chaves.sort(
        (a, b) => (cache[b].quando ?? '').localeCompare(cache[a].quando ?? ''),
      )
      cache = Object.fromEntries(
        ordenadas.slice(0, TETO_CACHE).map((k) => [k, cache[k]]),
      )
    }
  }

  return gravar({
    desde: cota.desde ?? quando,
    usos: [
      { chave, termo: termo.trim(), cidade: cidade.trim(), quando, origem },
      ...cota.usos,
    ].slice(0, 50), // o histórico da tela mostra as últimas; não é um log
    cache,
  })
}

/** Zerado à mão quando o plano renova: o provedor conta pela data da
 *  assinatura, não pelo dia 1º, e adivinhar isso daria um número errado. */
export function zerarContagem(agora = new Date()) {
  const cota = lerCota()
  return gravar({ ...cota, desde: agora.toISOString(), usos: [] })
}

/** Esvazia o cache: as próximas buscas voltam a consumir cota. */
export function limparCache() {
  return gravar({ ...lerCota(), cache: {} })
}

export function usadas(cota) {
  return cota.usos.filter((u) => u.origem === 'rede').length
}

export function servidasDoCache(cota) {
  return cota.usos.filter((u) => u.origem === 'cache').length
}
