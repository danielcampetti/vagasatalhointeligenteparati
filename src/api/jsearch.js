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

import { JANELAS, JANELA_PADRAO } from '../janela'

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

/**
 * `cursor` é como o `search-v2` pagina: cada resposta traz o cursor da página
 * seguinte, e devolvê-lo pede a próxima. Não existe "cursor anterior" — a
 * navegação só anda para frente, e é por isso que a tela acumula resultados
 * ("Carregar mais") em vez de trocar de página.
 *
 * Cursor vazio não vira parâmetro: `cursor=` seria pedir a próxima página de
 * nada, e uma requisição malformada debita uma das 200 do mês igual.
 *
 * `janela` vira `date_posted`. Antes o parâmetro não era enviado, o que para
 * a API é o mesmo que `all` — e `all` foi medido como a origem dos dois
 * defeitos que a busca tinha: metade das vagas voltava sem data de
 * publicação, e era essa metade que trazia anúncio já encerrado. O padrão
 * agora é `month`, que na mesma consulta devolveu 10 vagas todas datadas.
 *
 * Valor desconhecido cai no padrão em vez de seguir para a API: `date_posted`
 * inválido é 400, e um 400 debita cota igual.
 */
export function montarUrl(consulta, cursor = null, janela = JANELA_PADRAO) {
  const conhecida = JANELAS.some((j) => j.valor === janela)
  const params = new URLSearchParams({
    query: consulta,
    ...PARAMS_FIXOS,
    date_posted: conhecida ? janela : JANELA_PADRAO,
  })
  if (cursor) params.set('cursor', cursor)
  return `${ENDPOINT}?${params.toString()}`
}

/**
 * O cursor da próxima página, ou `null` quando não há mais.
 *
 * Aceita o campo no topo e dentro de `data`. A documentação nomeia o campo
 * (`cursor`) mas não fixa onde ele mora, e esta API já obriga `vagasDaResposta`
 * a aceitar `data: []` e `data: { jobs: [] }` — variar de nível é plausível
 * pelo mesmo motivo. Aceitar os dois custa uma linha; errar o lugar custaria
 * uma paginação que nunca avança, sem erro nenhum na tela.
 *
 * `null` é a resposta certa também para lixo: sem cursor, a tela some com o
 * botão de carregar mais, que é o comportamento seguro.
 */
export function cursorDaResposta(bruto) {
  const achado = bruto?.cursor ?? bruto?.data?.cursor
  return typeof achado === 'string' && achado ? achado : null
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

export async function buscarVagas(
  consulta,
  cursor = null,
  janela = JANELA_PADRAO,
) {
  const url = montarUrl(consulta, cursor, janela)

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
