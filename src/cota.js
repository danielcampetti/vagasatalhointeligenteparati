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

import { JANELA_PADRAO, apiDaJanela } from './janela'
import { MODALIDADE_PADRAO, soRemotas } from './modalidade'

/**
 * O teto de requisições que o app vigia por mês.
 *
 * **Não é o limite do provedor.** A OpenWeb Ninja dá 200 no plano gratuito, e
 * continua dando — é o que a mensagem do 429 diz, e ela segue correta. Este
 * número é um orçamento auto-imposto, menor de propósito, e vive aqui para o
 * painel Controle avisar antes de o provedor cortar.
 *
 * A distinção importa para quem for mexer: subir este valor não compra
 * requisição nenhuma, e baixá-lo não impede a busca de acontecer — ele move o
 * aviso, não o portão. Quem de fato barra é o 429 da API, lá nas 200.
 */
export const LIMITE_MENSAL = 50

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

/**
 * A consulta que identifica uma requisição. Vazia dos dois lados = nenhuma.
 *
 * A janela de publicação entra na chave porque ela muda o que a API devolve:
 * sem ela aqui, trocar o dropdown para "Hoje" depois de uma busca em
 * "Qualquer data" seria servido pelo cache da consulta larga — o filtro
 * pareceria quebrado quando era o cache respondendo pela pergunta errada.
 *
 * Entra pelo `apiDaJanela`, e não crua: o que a chave precisa distinguir são
 * **requisições**. "Último mês" e "Últimos 15 dias" mandam as duas
 * `date_posted=month` — a API não tem janela de 15 dias — e portanto dividem a
 * mesma entrada. Separá-las gastaria uma das 200 do mês para rebaixar vagas
 * que já estão na tela.
 *
 * Como `api === valor` nas cinco janelas anteriores a essa, as chaves já
 * gravadas continuam sendo achadas.
 *
 * A modalidade entra pela metade, e a metade é da API. Só 'remoto' muda a
 * requisição (`work_from_home=true`); híbrido e presencial não têm parâmetro
 * no `/search-v2` e são recorte local — ver `modalidade.js`. Como a chave
 * existe para distinguir *requisições*, é o booleano que entra, não o valor de
 * quatro estados.
 *
 * O ganho vai direto para a cota: Todas, Híbrido e Presencial dividem a mesma
 * entrada, então alternar entre elas acha o cache e não gasta requisição.
 * Separar por modalidade queimaria uma das 200 do mês a cada troca de dropdown
 * para rebaixar exatamente as vagas que já estavam na tela.
 *
 * O sufixo só aparece quando é remoto — assim as chaves gravadas antes desta
 * mudança continuam sendo achadas, em vez de virarem órfãs no primeiro deploy
 * levando junto requisições que já foram pagas.
 */
export function chaveDaConsulta(
  termo,
  cidade,
  janela = JANELA_PADRAO,
  modalidade = MODALIDADE_PADRAO,
) {
  const t = termo.trim()
  const c = cidade.trim()
  if (!t && !c) return null
  const base = `${t}|${c}|${apiDaJanela(janela)}`
  return soRemotas(modalidade) ? `${base}|remoto` : base
}

/**
 * Tamanho de página assumido para entradas gravadas antes de `paginas`
 * existir. Não é adivinhação de qual era a página real — é o que impede uma
 * entrada legada de 27 vagas voltar inteira, que é justamente o defeito que
 * `paginas` veio corrigir. O erro possível é servir 10 num clique onde a
 * página original tinha 7; o erro que ele evita é a busca devolver três
 * páginas de uma vez.
 */
export const PAGINA_LEGADA = 10

/**
 * Os tamanhos das páginas guardadas nesta entrada, em ordem.
 *
 * `carregarMais` grava a lista **acumulada** sob a mesma chave da busca — do
 * contrário a próxima repetição perderia o que já foi baixado e pago. O preço
 * disso, até este campo existir, era `buscar()` restaurar tudo: quem tinha
 * clicado "Carregar mais" três vezes numa sessão anterior clicava em Buscar e
 * recebia 27 vagas de uma vez, e as 27 iam para a Claude juntas.
 *
 * Com as fronteiras registradas, a busca restaura a primeira página e o botão
 * serve as seguintes — sem rede, porque elas já custaram uma requisição cada.
 *
 * Uma soma que não fecha com `vagas.length` é tratada como ausente: `paginas`
 * só serve para fatiar essa lista, e um par inconsistente serviria vaga
 * repetida ou pularia vaga.
 */
export function paginasDoCache(entrada) {
  const vagas = Array.isArray(entrada?.vagas) ? entrada.vagas : null
  if (!vagas) return []

  const guardadas = entrada.paginas
  const valido =
    Array.isArray(guardadas) &&
    guardadas.length > 0 &&
    guardadas.every((n) => Number.isInteger(n) && n > 0) &&
    guardadas.reduce((a, b) => a + b, 0) === vagas.length
  if (valido) return guardadas

  const fatias = []
  for (let i = 0; i < vagas.length; i += PAGINA_LEGADA) {
    fatias.push(Math.min(PAGINA_LEGADA, vagas.length - i))
  }
  return fatias
}

/**
 * A próxima página guardada, para quem já mostra `jaMostradas` vagas — ou
 * `null` quando o cache acabou e só a rede tem mais.
 *
 * `jaMostradas` precisa cair exatamente numa fronteira de página. Fora dela a
 * função devolve `null` em vez de fatiar por conta própria: a tela e o cache
 * teriam divergido (uma vaga arquivada, por exemplo), e uma fatia arbitrária
 * daria vaga repetida ou vaga pulada — os dois piores que uma requisição.
 */
export function proximaPagina(entrada, jaMostradas) {
  const paginas = paginasDoCache(entrada)
  let inicio = 0
  for (const tamanho of paginas) {
    if (inicio === jaMostradas) return entrada.vagas.slice(inicio, inicio + tamanho)
    inicio += tamanho
  }
  return null
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
export function consultarCache(
  termo,
  cidade,
  janela = JANELA_PADRAO,
  modalidade = MODALIDADE_PADRAO,
) {
  const chave = chaveDaConsulta(termo, cidade, janela, modalidade)
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
  {
    vagas = null,
    cursor = null,
    janela = JANELA_PADRAO,
    modalidade = MODALIDADE_PADRAO,
    paginas = null,
  } = {},
  agora = new Date(),
) {
  const chave = chaveDaConsulta(termo, cidade, janela, modalidade)
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
    cache = { ...cache, [chave]: { quando, vagas, cursor, paginas } }
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
      {
        chave,
        termo: termo.trim(),
        cidade: cidade.trim(),
        janela,
        quando,
        origem,
      },
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
