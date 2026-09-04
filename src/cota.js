/**
 * O cache das consultas da JSearch — e a única contagem que sobrou aqui.
 *
 * Este módulo já foi o controle da cota inteiro: contava as requisições,
 * guardava o histórico da tela e mantinha o cache, tudo no `localStorage`. A
 * contagem saiu — mora no servidor agora, em `servidor/contagem.js`, e chega
 * à tela pelo `cotaRemota.js`. Ficou o cache, e o único número derivado dele:
 * quantas repetições ele respondeu sem ir à rede.
 *
 * Toda leitura e escrita é defensiva: em aba anônima, com storage bloqueado ou
 * com o valor corrompido por uma versão anterior, o acesso lança. A tela não
 * pode quebrar por causa do cache — no pior caso ele volta a vazio, e o preço
 * é uma requisição a mais.
 *
 * ## Por que o cache continua sendo do navegador
 *
 * A contagem foi para o servidor porque ela é **da conta**: as 200 do mês são
 * debitadas na OpenWeb Ninja venha o pedido de onde vier, e um contador por
 * origem — um no app publicado, outro no `npm run dev` — nunca sabia do
 * outro. Errar esse número custa dinheiro.
 *
 * O cache é o contrário em todos os pontos que importam. Ele existe para uma
 * pessoa não pagar duas vezes pela mesma pergunta, e "a mesma pergunta" é uma
 * ideia de sessão, não de conta: o que está em cache é o recorte exato de uma
 * consulta, com o cursor de paginação dela, e isso não se reaproveita entre
 * pessoas que perguntaram coisas diferentes. Errá-lo custa, no pior caso, uma
 * requisição repetida.
 *
 * E compartilhá-lo seria caro: são as vagas inteiras, com descrição — o mesmo
 * peso que o `GET /api/acervo` já evita não mandando `descricao`. O que havia
 * de aproveitável entre duas pessoas o acervo compartilhado já cobre: tudo
 * que qualquer busca trouxe fica lá, para todo mundo.
 *
 * Daí a assimetria que o painel Controle mostra na cara: o número lá em cima é
 * da conta, o contador de repetições logo abaixo é deste navegador, e os dois
 * dizem isso na tela — porque quem lê precisa saber qual dos dois muda quando
 * outra pessoa busca.
 */

import { JANELA_PADRAO, apiDaJanela } from './janela'
import { MODALIDADE_PADRAO, soRemotas } from './modalidade'

/**
 * As 200 do plano gratuito.
 *
 * Continua aqui, e não no `cotaRemota.js`, porque é um fato do contrato com o
 * provedor e não um dado que o servidor devolve: a rota `/api/cota` manda
 * quantas foram gastas, nunca quantas cabem. O painel importa as duas coisas
 * de lugares diferentes de propósito — o teto é conhecido, o gasto é lido.
 */
export const LIMITE_MENSAL = 200

const CHAVE = 'vagas:cota'

/**
 * Uma função e não uma constante compartilhada: quem recebe isto pode gravar
 * em cima, e duas leituras que devolvessem o *mesmo* objeto vazio ficariam
 * ligadas uma à outra sem ninguém pedir.
 */
const vazia = () => ({ cache: {}, totais: { cache: 0 } })

/** Contagem só é contagem se for inteira e não-negativa; o resto é lixo. */
function contagemValida(n) {
  return Number.isInteger(n) && n >= 0 ? n : null
}

/**
 * O que ficou no `localStorage`: o cache e o contador de repetições.
 *
 * `usos` e `desde` saíram do formato gravado, e o que já estiver escrito com
 * eles é lido normalmente — os campos antigos são simplesmente ignorados, e a
 * primeira gravação os descarta. Ninguém perde cache por causa disso, que é o
 * único conteúdo caro aqui dentro.
 *
 * O contador de repetições de uma cota antiga volta a zero, e é de propósito:
 * ele é uma estatística de economia, não dinheiro. Derivá-lo do `usos` legado
 * obrigaria este módulo a continuar conhecendo um formato que ele deixou de
 * escrever, para acertar um número que não paga nada.
 */
export function lerCota() {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return vazia()
    const dados = JSON.parse(cru)
    // Um formato antigo ou adulterado não pode derrubar a página.
    return {
      cache: dados.cache && typeof dados.cache === 'object' ? dados.cache : {},
      totais: { cache: contagemValida(dados?.totais?.cache) ?? 0 },
    }
  } catch {
    return vazia()
  }
}

function gravar(cota) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(cota))
  } catch {
    // Storage cheio ou bloqueado: o cache vira volátil nesta sessão — as
    // repetições voltam a custar cota —, mas a busca em si não tem por que
    // falhar por causa disso.
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
 * Registra uma busca e devolve o cache atualizado.
 *
 * `origem` é decidida por quem chamou: 'rede' se a requisição saiu, 'cache' se
 * foi servida do que já estava guardado. Consulta vazia não registra nada —
 * não haveria requisição a fazer.
 *
 * O que ele **não** faz mais é contar requisições de rede nem acumular
 * histórico: as duas coisas são da conta e passaram para o servidor, que as
 * observa no HTTP e não depende de o cliente lembrar de avisar. Sobrou o que
 * é deste navegador — gravar a resposta no cache, e somar as vezes em que o
 * cache dispensou uma requisição. Por isso `origem` continua importando aqui:
 * 'rede' escreve o cache, 'cache' incrementa o contador.
 *
 * **A assinatura não muda, e não é acidente.** São dez chamadores no
 * `App.jsx`, e este módulo já quebrou uma aba inteira ao ser renomeado sem
 * que o lint dissesse nada (`registrarBusca` → `registrarUso`). Quem mexer
 * nela de novo tem dez lugares para acertar à mão.
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
    // Incremento, e não recontagem a partir de uma lista: é o que faz o número
    // sobreviver à troca de página e ao esvaziamento do cache. A contagem de
    // rede não está aqui de propósito — quem conta requisição é quem a faz, e
    // isso é o servidor.
    totais: { cache: cota.totais.cache + (origem === 'cache' ? 1 : 0) },
    cache,
  })
}

/** Esvazia o cache: as próximas buscas voltam a consumir cota. */
export function limparCache() {
  return gravar({ ...lerCota(), cache: {} })
}

/**
 * As repetições que o cache respondeu sem ir à rede.
 *
 * Sai de `totais`, e só de `totais`. Havia aqui uma queda para contar
 * filtrando `usos`, para o caso de uma cota montada à mão: ela morreu com o
 * `usos`, que não é mais escrito nem lido. Um fallback que não pode rodar é
 * pior que nenhum — quem ler depois gasta o tempo de descobrir que era
 * inalcançável.
 */
export function servidasDoCache(cota) {
  return contagemValida(cota?.totais?.cache) ?? 0
}
