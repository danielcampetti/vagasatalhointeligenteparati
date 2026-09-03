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
 *
 * ## Duas listas que já foram uma só
 *
 * `usos` é o histórico da tela e tem teto; `totais` é a contagem e não tem.
 * A separação é a correção de um defeito visto em produção: com a contagem
 * saindo do histórico cortado, o painel mostrava **3 / 200** com 50
 * requisições já gastas na conta. Cada repetição servida do cache entrava na
 * mesma lista e empurrava uma requisição paga para fora do corte — o número
 * encolhia sozinho, e encolhia quando o app acertava.
 *
 * ## E o total ainda é do navegador, não da conta
 *
 * Nem com a contagem certa este número é a cota: as 200 são da conta na
 * OpenWeb Ninja, e o `localStorage` é de um navegador e de uma origem. Buscar
 * pelo app publicado e pelo `npm run dev` debita as mesmas 200 e alimenta dois
 * contadores diferentes, nenhum dos dois sabendo do outro. Quem sabe o número
 * verdadeiro é o painel do provedor — e `ajustarContagem` é por onde ele entra.
 */

import { JANELA_PADRAO, apiDaJanela } from './janela'
import { MODALIDADE_PADRAO, soRemotas } from './modalidade'

export const LIMITE_MENSAL = 200

const CHAVE = 'vagas:cota'

/**
 * Quantas buscas o histórico da tela guarda.
 *
 * É teto de **exibição**, não de contagem: a lista existe para mostrar as
 * últimas, e guardar mil linhas para renderizar as cinquenta primeiras só
 * gastaria storage. Foi este teto que corrompeu a cota enquanto ela era
 * derivada daqui — mexer nele hoje muda o tamanho da lista e mais nada.
 */
export const TETO_HISTORICO = 50

const SEM_TOTAIS = { rede: 0, cache: 0 }

const VAZIO = { desde: null, usos: [], cache: {}, totais: SEM_TOTAIS }

/** Contagem só é contagem se for inteira e não-negativa; o resto é lixo. */
function contagemValida(n) {
  return Number.isInteger(n) && n >= 0 ? n : null
}

/**
 * Os totais gravados — ou, para cota escrita antes deles existirem, o que o
 * histórico ainda sabe.
 *
 * O histórico subconta, que é o defeito inteiro. Mas quem já tinha cota
 * gravada não pode voltar a zero no primeiro deploy: continuar de onde ele
 * parou erra menos que descartá-lo, e o botão de ajustar conserta o resto.
 */
function totaisLidos(dados, usos) {
  const gravados = dados?.totais
  const daLista = (origem) => usos.filter((u) => u?.origem === origem).length
  return {
    rede: contagemValida(gravados?.rede) ?? daLista('rede'),
    cache: contagemValida(gravados?.cache) ?? daLista('cache'),
  }
}

/** Só o que a tela precisa saber para desenhar o painel. */
export function lerCota() {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return { ...VAZIO, usos: [], cache: {}, totais: { ...SEM_TOTAIS } }
    const dados = JSON.parse(cru)
    // Um formato antigo ou adulterado não pode derrubar a página.
    const usos = Array.isArray(dados.usos) ? dados.usos : []
    return {
      desde: typeof dados.desde === 'string' ? dados.desde : null,
      usos,
      cache:
        dados.cache && typeof dados.cache === 'object' ? dados.cache : {},
      totais: totaisLidos(dados, usos),
    }
  } catch {
    return { ...VAZIO, usos: [], cache: {}, totais: { ...SEM_TOTAIS } }
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
      // O corte é da lista, e só dela. A contagem sai de `totais` justamente
      // para não morrer aqui: enquanto ela vinha daqui, cada repetição
      // servida do cache empurrava uma requisição paga para fora do teto e
      // o painel passava a mostrar menos do que a conta já tinha gasto.
    ].slice(0, TETO_HISTORICO),
    // Incremento, não recontagem: é o que faz o número sobreviver ao corte
    // acima e à troca de página.
    totais: {
      rede: cota.totais.rede + (origem === 'rede' ? 1 : 0),
      cache: cota.totais.cache + (origem === 'cache' ? 1 : 0),
    },
    cache,
  })
}

/** Zerado à mão quando o plano renova: o provedor conta pela data da
 *  assinatura, não pelo dia 1º, e adivinhar isso daria um número errado. */
export function zerarContagem(agora = new Date()) {
  const cota = lerCota()
  return gravar({
    ...cota,
    desde: agora.toISOString(),
    usos: [],
    // Os totais também. Enquanto a contagem era derivada do histórico, esvaziar
    // um zerava o outro de graça; agora são duas coisas, e esquecer esta linha
    // deixaria o painel dizendo que o ciclo novo já nasceu gasto.
    totais: { ...SEM_TOTAIS },
  })
}

/**
 * Põe a contagem no número que o provedor mostra.
 *
 * Existe porque o total verdadeiro não mora neste navegador. As 200 são da
 * conta na OpenWeb Ninja; o contador é do `localStorage` de uma origem. Abrir
 * o app publicado no celular, trocar de máquina, ou alternar entre o Railway e
 * o `npm run dev` cria contadores que se ignoram enquanto o provedor debita
 * das mesmas 200 — e não há de onde o app deduzir o que foi gasto fora dele.
 *
 * O histórico não é tocado: as linhas que estão lá aconteceram mesmo, e
 * apagá-las para casar com um número maior seria trocar um dado verdadeiro por
 * uma aparência de coerência. Pela mesma razão o cache fica: as consultas
 * guardadas continuam valendo, e são elas que evitam gastar de novo.
 *
 * Valor que não é contagem é ignorado em silêncio — o campo da tela é um
 * `number`, e um `NaN` vindo dele não pode virar o teto do painel.
 */
export function ajustarContagem(gastas) {
  const alvo = contagemValida(Math.round(Number(gastas)))
  if (alvo === null) return lerCota()

  const cota = lerCota()
  return gravar({ ...cota, totais: { ...cota.totais, rede: alvo } })
}

/** Esvazia o cache: as próximas buscas voltam a consumir cota. */
export function limparCache() {
  return gravar({ ...lerCota(), cache: {} })
}

/**
 * Quantas requisições este navegador registrou no ciclo.
 *
 * Sai de `totais`, não de `usos`. A queda para o histórico é para o caso de
 * receber uma cota montada à mão — em teste, ou por um chamador que ainda não
 * conhece o campo novo —, e não é o caminho normal: ele subconta.
 */
export function usadas(cota) {
  return contarPor(cota, 'rede')
}

/** As repetições que o cache respondeu, pelo mesmo mecanismo. */
export function servidasDoCache(cota) {
  return contarPor(cota, 'cache')
}

function contarPor(cota, origem) {
  const total = contagemValida(cota?.totais?.[origem])
  if (total !== null) return total
  const usos = Array.isArray(cota?.usos) ? cota.usos : []
  return usos.filter((u) => u?.origem === origem).length
}
