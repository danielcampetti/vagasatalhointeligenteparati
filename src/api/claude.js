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
export const MODELO = 'claude-opus-5'

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
    // Só os quatro que este módulo de fato produz. 'config' e 'rede' (ver
    // ErroJSearch) ficariam pro chamador só se o invólucro passasse a
    // capturar e reclassificar erro do SDK — não há necessidade disso hoje:
    // mensagemDoErro já trata Anthropic.APIConnectionError e
    // AuthenticationError direto, sem precisar de um ErroClaude no meio.
    this.tipo = tipo // 'teto' | 'recusa' | 'vazio' | 'api'
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
  // cortada no meio, JSON pela metade para quem chamou. Plausível aqui: a
  // Task 6 manda um currículo em PDF inteiro para dentro do contexto.
  if (
    resposta?.stop_reason === 'max_tokens' ||
    resposta?.stop_reason === 'model_context_window_exceeded'
  ) {
    throw new ErroClaude(
      'A resposta foi cortada por tamanho. Se o currículo for muito longo, cole só a parte profissional.',
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
  if (err instanceof Anthropic.APIError) {
    return `A Claude respondeu ${err.status}: ${detalheDoErro(err) || err.message}`
  }
  return `Erro inesperado: ${err.message}`
}
