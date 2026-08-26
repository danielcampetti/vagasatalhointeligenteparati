/**
 * Camada de rede da busca de vagas.
 *
 * O browser só conhece `/api/jsearch/...` — quem sabe a chave e a URL real é o
 * proxy do dev server (veja vite.config.js). Chamar a OpenWeb Ninja direto do
 * navegador exigiria a chave no bundle, e um bundle é público.
 *
 * Consequência que vale ter em mente: **isto só funciona em `npm run dev`**.
 * No GitHub Pages não há proxy, `/api/jsearch` responde 404 e a busca falha —
 * até existir um endpoint de produção que guarde a chave fora do navegador.
 */

const ENDPOINT = '/api/jsearch/search-v2'

/** Fixos por enquanto: o app busca vagas brasileiras, em português. */
export const PARAMS_FIXOS = {
  country: 'br',
  language: 'pt',
  num_pages: '1',
}

/**
 * `reachedApi` é o campo que importa para a cota: distingue um erro que
 * consumiu uma das 200 requisições (429, 403) de um que nunca saiu da máquina
 * (chave ausente) ou que a API recusou antes de contar (401).
 */
export class ErroJSearch extends Error {
  constructor(mensagem, { status = 0, tipo = 'api', tocouApi = false } = {}) {
    super(mensagem)
    this.name = 'ErroJSearch'
    this.status = status
    this.tipo = tipo // 'rede' | 'config' | 'api' | 'parse'
    this.tocouApi = tocouApi
  }
}

const MENSAGENS = {
  400: 'Requisição inválida (400). A API recusou os parâmetros — o campo de busca não pode ficar vazio.',
  401: 'Chave não autorizada (401). Confira o valor de JSEARCH_API_KEY no .env e reinicie o npm run dev.',
  403: 'Acesso negado (403). A chave foi aceita mas não tem permissão para este endpoint, ou a assinatura expirou.',
  429: 'Limite atingido (429). O plano gratuito são 200 requisições por mês — use o cache ou espere a renovação.',
}

export function montarUrl(consulta) {
  const params = new URLSearchParams({ query: consulta, ...PARAMS_FIXOS })
  return `${ENDPOINT}?${params.toString()}`
}

/** "Técnico de TI" + "Caxias do Sul, RS" -> "Técnico de TI em Caxias do Sul, RS" */
export function montarConsulta(cargo, cidade) {
  const partes = [cargo.trim(), cidade.trim()].filter(Boolean)
  return partes.join(' em ')
}

/**
 * A API às vezes devolve `data` como array e às vezes como `{ jobs: [...] }`.
 * Aceitar as duas formas evita uma tela vazia inexplicável.
 */
export function vagasDaResposta(bruto) {
  const data = bruto?.data
  const lista = Array.isArray(data) ? data : data?.jobs
  return Array.isArray(lista) ? lista : []
}

export async function buscarVagas(consulta) {
  const url = montarUrl(consulta)

  let res
  try {
    res = await fetch(url, { headers: { accept: 'application/json' } })
  } catch (err) {
    throw new ErroJSearch(
      `Falha de rede: não foi possível falar com o servidor de desenvolvimento. O npm run dev ainda está rodando? (${err.message})`,
      { tipo: 'rede' },
    )
  }

  // O guard do proxy marca as respostas que nunca saíram da sua máquina.
  const guardaLocal = res.headers.get('x-jsearch-proxy') === 'sem-chave'
  const texto = await res.text()

  let corpo = null
  try {
    corpo = JSON.parse(texto)
  } catch {
    // Deixa `corpo` nulo: tratado abaixo conforme o status.
  }

  if (!res.ok) {
    const detalhe = corpo?.message || corpo?.error?.message || corpo?.error || ''
    const base =
      MENSAGENS[res.status] ??
      (guardaLocal ? '' : `A API respondeu ${res.status}.`)
    throw new ErroJSearch([base, detalhe].filter(Boolean).join(' ').trim(), {
      status: res.status,
      tipo: guardaLocal ? 'config' : 'api',
      // 401 é chave inválida: a API recusa antes de debitar a cota.
      tocouApi: !guardaLocal && res.status !== 401,
    })
  }

  if (!corpo) {
    throw new ErroJSearch(
      'A resposta chegou com status 200 mas não é JSON válido.',
      { status: res.status, tipo: 'parse', tocouApi: true },
    )
  }

  return corpo
}
