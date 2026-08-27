/**
 * Camada de rede da Avaliação IA.
 *
 * O browser só conhece `/api/claude/...`; quem sabe a chave é o proxy do dev
 * server (veja vite.config.js). Consequência: **isto só funciona em
 * `npm run dev`**, igual ao JSearch.
 *
 * Sobre o `dangerouslyAllowBrowser` abaixo: o flag existe para impedir que se
 * coloque uma chave de verdade num bundle, que é público. Aqui a chave **não
 * está no bundle** — a que vai daqui é falsa, e o proxy a sobrescreve com a
 * real antes de sair da máquina. Não "conserte" isto removendo o flag: o SDK
 * simplesmente para de funcionar no navegador. Este raciocínio vale enquanto
 * `baseURL` apontar para o proxy de mesma origem, logo abaixo — se um dia ela
 * apontar direto para api.anthropic.com, a chave deixa de ser falsa e este
 * argumento desaba junto.
 */
import Anthropic from '@anthropic-ai/sdk'
import { dolares, excedeuTeto, lerCusto, registrarChamada } from '../custo'

/** O modelo mora aqui e em nenhum outro lugar. */
export const MODELO = 'claude-sonnet-5'

/**
 * Os três valores de `tipo` que `contabilizar` grava — centralizados para
 * que um typo não vire, em silêncio, uma linha que nunca aparece na aba
 * Controle. Perfil (Task 6), ranking (Task 7), justificativa (Task 8).
 */
export const TIPOS = {
  PERFIL: 'perfil',
  RANKING: 'ranking',
  JUSTIFICATIVA: 'justificativa',
}

const PREFIXO = '/api/claude'

export const claude = new Anthropic({
  // Precisa ser absoluta. O SDK monta a URL da requisição com
  // `new URL(baseURL + path)` de um argumento só (ver client.buildURL no
  // pacote instalado) — isso exige URL absoluta. Uma baseURL relativa como
  // '/api/claude' faz *qualquer* chamada estourar `TypeError: Invalid URL`
  // antes até do fetch sair, porque `new URL('/api/claude' + '/v1/messages')`
  // de um argumento só não é uma URL válida. `location.origin` é a origem da
  // própria página — exatamente onde o proxy escuta.
  baseURL: new URL(PREFIXO, globalThis.location.origin).toString(),
  apiKey: 'via-proxy', // falsa de propósito: veja o comentário do topo
  dangerouslyAllowBrowser: true,
})

export class ErroClaude extends Error {
  constructor(mensagem, { tipo = 'api', status = 0 } = {}) {
    super(mensagem)
    this.name = 'ErroClaude'
    // 'rede' ficaria pro chamador só se o invólucro passasse a capturar e
    // reclassificar Anthropic.APIConnectionError — não há necessidade disso
    // hoje, mensagemDoErro já trata esse caso direto. 'config' É produzido:
    // ver o ramo do header x-claude-proxy em mensagemDoErro, que cobre a
    // guarda local de chave ausente (vite.config.js, guardaDeChave) — sem
    // isso, o 500 dela seria indistinguível de um 500 real da Anthropic.
    this.tipo = tipo // 'config' | 'teto' | 'recusa' | 'vazio' | 'api'
    this.status = status
  }
}

/**
 * O JSearch tem teto imposto pelo provedor; a Claude não tem nenhum. Este é o
 * nosso, e ele bloqueia **antes** da chamada — depois já custou.
 */
export function conferirTeto() {
  const custo = lerCusto()
  if (excedeuTeto(custo)) {
    const gasto = dolares(custo.chamadas).toFixed(2)
    throw new ErroClaude(
      `Teto de custo atingido: US$ ${gasto} de US$ ${custo.teto.toFixed(2)} neste ciclo. Zere a contagem na aba Controle ou aumente o teto.`,
      { tipo: 'teto' },
    )
  }
}

/**
 * Checa antes de ler `content` — uma recusa vem com HTTP 200. `?.` porque
 * `contabilizar`, ao lado, já guarda contra resposta ausente; este guarda
 * do mesmo jeito.
 */
export function conferirResposta(resposta) {
  if (resposta?.stop_reason === 'refusal') {
    throw new ErroClaude(
      'A Claude recusou esta requisição. Se o currículo tiver algo fora do comum, tente colar só o texto profissional.',
      { tipo: 'recusa' },
    )
  }
  // `model_context_window_exceeded` tem o mesmo efeito de `max_tokens` — saída
  // cortada no meio, JSON pela metade para quem chamou.
  if (
    resposta?.stop_reason === 'max_tokens' ||
    resposta?.stop_reason === 'model_context_window_exceeded'
  ) {
    // Esta mensagem é compartilhada pelas três chamadas do invólucro
    // (perfil, ranking, justificativa) — "cole só a parte profissional"
    // mandaria o aluno mexer no currículo quando quem cortou foi um lote de
    // vagas ou uma justificativa em prosa, nenhum dos dois culpa do
    // currículo. Uma frase por tipo foi cogitada, mas só perfil tem causa
    // certa: o tamanho do lote de ranking é uma constante do código
    // (TAMANHO_LOTE), não algo que o aluno escolhe, e a justificativa não
    // tem entrada do aluno que controle o tamanho da saída — nos dois casos
    // a frase específica seria inventada, não mais certa que esta.
    throw new ErroClaude(
      'A resposta foi cortada por tamanho. Tente novamente com menos vagas de uma vez ou um texto mais curto.',
      { tipo: 'vazio' },
    )
  }
}

/** Toda chamada passa por aqui na volta, senão o medidor mente. */
export function contabilizar(tipo, resposta) {
  if (!resposta?.usage) return
  registrarChamada(tipo, resposta.usage, MODELO)
}

/**
 * As duas únicas portas de entrada para chamar o SDK — Task 6 e 7 usam
 * `chamarEstruturado` (schema via `messages.parse`), Task 8 usa `chamarTexto`
 * (prosa via `messages.create`). A ordem abaixo é fixa e não é escolha de
 * quem chama:
 *
 *   1. conferirTeto()     — antes da rede: depois de sair, já custou.
 *   2. chamada ao SDK      — `model` é sempre MODELO, nunca o que vier em
 *      `params` (o spread de `params` vem primeiro só por isso).
 *   3. contabilizar()      — antes de conferirResposta: uma recusa já gastou
 *      tokens, e `conferirTeto` lê esse mesmo livro-caixa depois — uma
 *      chamada não contada enfraqueceria todo teto futuro. Contar depois de
 *      um throw nunca aconteceria, então a ordem tem que ser esta.
 *   4. conferirResposta()  — pode lançar; contabilizar já rodou.
 *
 * `conferirTeto`, `contabilizar` e `conferirResposta` continuam exportados
 * avulsos — algo pode precisar deles fora desta ordem.
 */
export async function chamarEstruturado(tipo, params) {
  conferirTeto()
  const resposta = await claude.messages.parse({ ...params, model: MODELO })
  contabilizar(tipo, resposta)
  conferirResposta(resposta)
  return resposta
}

export async function chamarTexto(tipo, params) {
  conferirTeto()
  const resposta = await claude.messages.create({ ...params, model: MODELO })
  contabilizar(tipo, resposta)
  conferirResposta(resposta)
  return resposta
}

/**
 * O corpo de erro da Anthropic é `{type, error: {type, message}}` — mesma
 * ideia do `corpo?.message || corpo?.error?.message || corpo?.error` do
 * jsearch.js. Sem isto, `err.message` do SDK já vem com o status colado na
 * frente (`"400 ..."`) e, como o corpo da Anthropic nunca tem `.message` no
 * topo, `APIError.makeMessage` cai em `JSON.stringify` do corpo inteiro — a
 * tela do aluno mostraria JSON cru, em inglês, com o status duplicado.
 */
function detalheDoErro(err) {
  const corpo = err?.error
  return corpo?.error?.message || corpo?.message || ''
}

export function mensagemDoErro(err) {
  if (err instanceof ErroClaude) return err.message
  if (err instanceof Anthropic.RateLimitError) {
    return 'Limite de requisições da Claude atingido (429). Espere um instante e tente de novo.'
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return 'Chave da Claude não autorizada (401). Confira ANTHROPIC_API_KEY no .env e reinicie o npm run dev.'
  }
  if (err instanceof Anthropic.BadRequestError) {
    return `A Claude recusou os parâmetros (400): ${detalheDoErro(err) || err.message}`
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return 'Não foi possível falar com o servidor de desenvolvimento. O npm run dev ainda está rodando?'
  }
  // A guarda local (vite.config.js, guardaDeChave) devolve 500 quando falta
  // ANTHROPIC_API_KEY — a requisição nunca saiu da máquina. Olhando só o
  // status isso é indistinguível de um 500 de verdade da Anthropic; o header
  // `x-claude-proxy: sem-chave` existe exatamente para separar os dois, e sem
  // lê-lo aqui a tela diria "A Claude respondeu 500" para um pedido que a
  // Claude nunca viu. Embrulhado em ErroClaude porque o `tipo: 'config'` é
  // real — ver o comentário do construtor.
  if (err?.headers?.get?.('x-claude-proxy') === 'sem-chave') {
    return new ErroClaude(detalheDoErro(err) || err.message, {
      tipo: 'config',
      status: err.status,
    }).message
  }
  if (err instanceof Anthropic.APIError) {
    return `A Claude respondeu ${err.status}: ${detalheDoErro(err) || err.message}`
  }
  return `Erro inesperado: ${err.message}`
}
