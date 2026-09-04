/**
 * A contagem da cota, presa ao HTTP e não a um proxy.
 *
 * ## Por que observar, e não chamar de dentro
 *
 * Há dois proxies para a JSearch: o `reproxiar` do `server.js`, que faz um
 * `fetch` e devolve um buffer, e o `server.proxy` do vite, que faz pipe. Eles
 * não têm nada em comum por dentro — mas produzem a mesma resposta HTTP.
 * Enganchar no `res` é enganchar no que é igual nos dois; enganchar no interior
 * de cada um seriam duas implementações, e duas chances de divergirem. É a
 * mesma razão que tirou as rotas do acervo de dentro do `server.js`.
 *
 * ## A regra veio do cliente, e não mudou de significado
 *
 * Estava no `tocouApi` do `ErroJSearch`: `!guardaLocal && res.status !== 401`.
 * Consome cota tudo que a API respondeu, exceto 401; não consome o que nunca
 * saiu da máquina. Aqui ela é decidida pelo status e por dois marcadores.
 *
 * ## O middleware não atrasa nem altera a resposta
 *
 * Ele registra um listener e chama `next()` na mesma linha. O trabalho acontece
 * no `finish`, quando a resposta já foi enviada — por construção, **a busca
 * não pode falhar por causa do contador**. Um erro de banco aqui vira uma
 * linha no log e nada mais.
 */

const MARCADOR = 'x-jsearch-proxy'

/**
 * Esta resposta debitou uma das 200?
 *
 * `sem-chave` é o ambiente sem `JSEARCH_API_KEY`: a requisição não saiu.
 * `sem-resposta` é o upstream inalcançável — sem ele, o 502 que o `reproxiar`
 * inventa seria indistinguível de um 502 vindo da própria JSearch, e um dos
 * dois não gastou nada.
 */
export function consomeCota(res) {
  const marcador = res.getHeaders?.()[MARCADOR]
  if (marcador === 'sem-chave' || marcador === 'sem-resposta') return false
  return res.statusCode !== 401
}

/**
 * O que a linha do histórico guarda, tirado da própria requisição.
 *
 * Nada é inferido e nada vem do cliente por outro caminho: é a URL que o proxy
 * acabou de usar. `continuacao` distingue "Carregar mais" de busca nova, que é
 * a diferença entre duas linhas que pareceriam iguais na tela.
 */
function daRequisicao(req, res) {
  const url = req.originalUrl ?? req.url ?? ''
  const params = new URLSearchParams(url.slice(url.indexOf('?') + 1))
  return {
    consulta: params.get('query') ?? '',
    janela: params.get('date_posted') ?? '',
    remotas: params.get('work_from_home') === 'true',
    continuacao: params.has('cursor'),
    status: res.statusCode,
  }
}

export function contarJSearch(cota) {
  return (req, res, next) => {
    res.on('finish', () => {
      try {
        if (!consomeCota(res)) return
        cota.registrar(daRequisicao(req, res))
      } catch (err) {
        console.error('[cota] não consegui registrar a requisição:', err.message)
      }
    })
    next()
  }
}
