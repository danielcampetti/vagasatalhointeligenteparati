import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const UPSTREAM = 'https://api.openwebninja.com'
const PREFIXO = '/api/jsearch'
const UPSTREAM_CLAUDE = 'https://api.anthropic.com'
const PREFIXO_CLAUDE = '/api/claude'

/**
 * Corta a requisição antes do proxy quando não há chave, para o erro na tela
 * dizer o que fazer em vez de devolver um 401 genérico — e, principalmente,
 * para não contar como requisição gasta: nada saiu da máquina.
 *
 * `configureServer` roda antes dos middlewares internos do Vite, então este
 * tem prioridade sobre o proxy.
 */
export function guardaDeChave({ nome, prefixo, chave, variavel }) {
  return {
    name: `guarda-de-chave-${nome}`,
    configureServer(server) {
      server.middlewares.use(prefixo, (req, res, next) => {
        if (chave) return next()
        res.statusCode = 500
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.setHeader(`x-${nome}-proxy`, 'sem-chave')
        // Sem chave é um fato do ambiente, não uma falha passageira: tentar de
        // novo não acha a chave. O SDK da Claude obedece este header antes de
        // olhar o status — sem ele, o 5xx daqui vira ~1,4s de espera morta em
        // três tentativas antes do aluno ver a mensagem. Inerte do lado do
        // JSearch: jsearch.js usa fetch puro e só lê x-jsearch-proxy.
        res.setHeader('x-should-retry', 'false')
        res.end(
          JSON.stringify({
            message: `${variavel} não encontrada. Copie .env.example para .env, cole sua chave e reinicie o npm run dev.`,
          }),
        )
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  // Prefixo '' faz o loadEnv ler variáveis sem VITE_ também. O valor fica
  // apenas neste processo Node: só `import.meta.env.VITE_*` chega ao browser.
  const env = loadEnv(mode, process.cwd(), '')
  const chave = env.JSEARCH_API_KEY?.trim()

  if (!chave) {
    console.warn(
      '\n[jsearch] JSEARCH_API_KEY ausente. Copie .env.example para .env, cole sua chave e reinicie.\n',
    )
  }

  const chaveClaude = env.ANTHROPIC_API_KEY?.trim()

  if (!chaveClaude) {
    console.warn(
      '\n[claude] ANTHROPIC_API_KEY ausente. A Avaliação IA não vai funcionar.\n',
    )
  }

  return {
    // O caminho onde o app é servido, e ele difere por destino — por isso
    // virou variável em vez de constante.
    //
    // No GitHub Pages o site fica em
    // https://<usuario>.github.io/vagasatalhointeligenteparati/, e `base`
    // precisa ser exatamente "/<nome-do-repositorio>/": sem isso o HTML pede
    // /assets/... na raiz do domínio, o CSS e o JS retornam 404 e a página
    // abre sem estilo nenhum. É o padrão porque é o caso que quebra calado.
    //
    // No Railway o app tem o domínio inteiro para si, então lá vai `/` —
    // definido em BASE_PATH no ambiente do build. Manter o subcaminho ali
    // produziria o mesmo 404 de assets, só que na outra direção.
    base: process.env.BASE_PATH ?? '/vagasatalhointeligenteparati/',
    plugins: [
      react(),
      tailwindcss(),
      guardaDeChave({
        nome: 'jsearch',
        prefixo: PREFIXO,
        chave,
        variavel: 'JSEARCH_API_KEY',
      }),
      guardaDeChave({
        nome: 'claude',
        prefixo: PREFIXO_CLAUDE,
        chave: chaveClaude,
        variavel: 'ANTHROPIC_API_KEY',
      }),
    ],
    server: {
      // O React chama /api/jsearch/search-v2 (mesma origem, sem CORS).
      // Aqui vira https://api.openwebninja.com/jsearch/search-v2 + o header.
      //
      // Isto só existe no dev server. No GitHub Pages não há proxy nenhum:
      // o site publicado fica sem busca real até haver um endpoint que
      // guarde a chave fora do navegador.
      proxy: {
        [PREFIXO]: {
          target: UPSTREAM,
          changeOrigin: true,
          rewrite: (caminho) => caminho.replace(PREFIXO, '/jsearch'),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              if (chave) proxyReq.setHeader('x-api-key', chave)
              console.log(`[jsearch] -> ${UPSTREAM}${proxyReq.path}`)
            })
            proxy.on('proxyRes', (proxyRes, req) => {
              console.log(`[jsearch] <- ${proxyRes.statusCode} ${req.url}`)
            })
            proxy.on('error', (err) => {
              console.error('[jsearch] erro de proxy:', err.message)
            })
          },
        },
        [PREFIXO_CLAUDE]: {
          target: UPSTREAM_CLAUDE,
          changeOrigin: true,
          // O SDK já manda `/v1/messages` — a baseURL dele é a origem da
          // própria página com `/api/claude` na frente (src/api/claude.js),
          // então o pedido que chega aqui é `/api/claude/v1/messages`. Só
          // tira o prefixo; não troca por '/v1', que duplicaria e viraria
          // `/v1/v1/messages` -> 404 na Anthropic.
          rewrite: (caminho) => caminho.replace(PREFIXO_CLAUDE, ''),
          configure: (proxy) => {
            proxy.on('proxyReq', (proxyReq) => {
              // Sobrescreve: o SDK manda uma chave falsa, a real entra aqui.
              // O `anthropic-version` o próprio SDK já envia.
              if (chaveClaude) proxyReq.setHeader('x-api-key', chaveClaude)
              console.log(`[claude] -> ${UPSTREAM_CLAUDE}${proxyReq.path}`)
            })
            proxy.on('proxyRes', (proxyRes, req) => {
              console.log(`[claude] <- ${proxyRes.statusCode} ${req.url}`)
            })
            proxy.on('error', (err) => {
              console.error('[claude] erro de proxy:', err.message)
            })
          },
        },
      },
    },
    // jsdom porque os testes de perfil (tasks seguintes) leem e escrevem no
    // localStorage — o ambiente padrão do vitest ('node') não tem essa API.
    test: { environment: 'jsdom' },
  }
})
