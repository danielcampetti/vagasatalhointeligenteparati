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
function guardaDeChave({ nome, prefixo, chave, variavel }) {
  return {
    name: `guarda-de-chave-${nome}`,
    configureServer(server) {
      server.middlewares.use(prefixo, (req, res, next) => {
        if (chave) return next()
        res.statusCode = 500
        res.setHeader('content-type', 'application/json; charset=utf-8')
        res.setHeader(`x-${nome}-proxy`, 'sem-chave')
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
    // `base` precisa ser exatamente "/<nome-do-repositorio>/".
    // O site é servido em https://<usuario>.github.io/vagasatalhointeligenteparati/,
    // então sem isso o HTML pede /assets/... na raiz do domínio, o CSS e o JS
    // retornam 404 e a página abre sem estilo nenhum.
    base: '/vagasatalhointeligenteparati/',
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
          rewrite: (caminho) => caminho.replace(PREFIXO_CLAUDE, '/v1'),
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
