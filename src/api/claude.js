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
 * simplesmente para de funcionar no navegador.
 */
import Anthropic from '@anthropic-ai/sdk'
import { dolares, excedeuTeto, lerCusto, registrarChamada } from '../custo'

/** O modelo mora aqui e em nenhum outro lugar. */
export const MODELO = 'claude-opus-5'

export const claude = new Anthropic({
  baseURL: '/api/claude',
  apiKey: 'via-proxy', // falsa de propósito: veja o comentário do topo
  dangerouslyAllowBrowser: true,
})

export class ErroClaude extends Error {
  constructor(mensagem, { tipo = 'api', status = 0 } = {}) {
    super(mensagem)
    this.name = 'ErroClaude'
    this.tipo = tipo // 'config' | 'teto' | 'rede' | 'api' | 'recusa' | 'vazio'
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

/** Checa antes de ler `content` — uma recusa vem com HTTP 200. */
export function conferirResposta(resposta) {
  if (resposta.stop_reason === 'refusal') {
    throw new ErroClaude(
      'A Claude recusou esta requisição. Se o currículo tiver algo fora do comum, tente colar só o texto profissional.',
      { tipo: 'recusa' },
    )
  }
  if (resposta.stop_reason === 'max_tokens') {
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

export function mensagemDoErro(err) {
  if (err instanceof ErroClaude) return err.message
  if (err instanceof Anthropic.RateLimitError) {
    return 'Limite de requisições da Claude atingido (429). Espere um instante e tente de novo.'
  }
  if (err instanceof Anthropic.AuthenticationError) {
    return 'Chave da Claude não autorizada (401). Confira ANTHROPIC_API_KEY no .env e reinicie o npm run dev.'
  }
  if (err instanceof Anthropic.BadRequestError) {
    return `A Claude recusou os parâmetros (400): ${err.message}`
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return 'Não foi possível falar com o servidor de desenvolvimento. O npm run dev ainda está rodando?'
  }
  if (err instanceof Anthropic.APIError) {
    return `A Claude respondeu ${err.status}: ${err.message}`
  }
  return `Erro inesperado: ${err.message}`
}
