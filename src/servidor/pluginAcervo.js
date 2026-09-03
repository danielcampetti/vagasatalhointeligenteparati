/**
 * O acervo sob o `npm run dev`.
 *
 * O `vite.config.js` proxiava `/api/jsearch` e `/api/claude`, e mais nada
 * servia `/api/acervo`: nenhum processo rodava o `server.js` ao lado do vite.
 * O README promete que o `npm run dev` e o Railway se comportam igual, e é essa
 * promessa que faz defeito de produção aparecer antes de publicar. O acervo
 * nasceu quebrando-a, e passou despercebido porque toda verificação foi feita
 * com `node server.js` contra um `dist/` pronto.
 *
 * As duas caras do defeito, medidas em 03/09/2026:
 *
 * - com a `base` padrão (`/vagasatalhointeligenteparati/`), `/api/acervo`
 *   respondia **404 `text/plain`** — "The server is configured with a public
 *   base URL of ..." — e a aba mostrava falha permanente;
 * - com `BASE_PATH=/`, o fallback de HTML do vite respondia **200 com o
 *   `index.html`**, e o cliente lia isso como acervo vazio, oferecendo o
 *   conselho de fazer uma busca que não ajudaria em nada.
 *
 * ## Um plugin, e não um segundo processo
 *
 * Rodar o `server.js` ao lado do vite exigiria concorrência no `npm run dev`,
 * duas portas e um proxy entre elas — três coisas novas para quem desenvolve
 * errar. O `configureServer` roda **antes** dos middlewares internos do vite,
 * inclusive do proxy e do de `base`, e é exatamente a propriedade em que o
 * `guardaDeChave` do `vite.config.js` já se apoia e já documenta.
 *
 * As rotas são as **mesmas** do `server.js` — o `criarRotasAcervo` é
 * importado, não copiado. Duas cópias seriam duas chances de divergirem, e
 * divergir aqui é o defeito, não o risco.
 */

/**
 * ## Os imports são dinâmicos de propósito — não os promova a estáticos
 *
 * O `src/api/claude.test.js` importa o `vite.config.js` de verdade para testar
 * o `guardaDeChave`, e ele roda no ambiente jsdom. Um `import` estático daqui
 * põe `node:sqlite` e o `express` no grafo do módulo que aquele teste puxa, e o
 * vite recusa a transformação com "Cannot bundle Node.js built-in
 * `node:sqlite`" — a suíte inteira do cliente cai por um módulo que só o
 * servidor usa.
 *
 * Dentro do `configureServer` o import acontece no Node, no momento em que um
 * dev server de fato sobe, e nada disso chega ao ambiente do navegador.
 */
export function pluginAcervo({ acervo } = {}) {
  return {
    name: 'acervo-no-dev',
    async configureServer(server) {
      const { abrirBanco, caminhoDoBanco, criarAcervo } = await import('./banco.js')
      const { criarRotasAcervo } = await import('./rotas.js')

      /**
       * O banco abre no primeiro pedido, não ao montar.
       *
       * Nem todo dev server que carrega este config é o `npm run dev`: o
       * vitest sobe um servidor interno, com os plugins do config, só para
       * transformar módulos. Abrir o arquivo ao montar fazia `npm test` criar
       * um `acervo.db` no repositório e segurá-lo aberto — efeito colateral de
       * rodar teste, num arquivo que nenhum teste queria.
       *
       * Quem não pede `/api/acervo` não abre banco nenhum.
       */
      let rotas = null

      // O connect corta o prefixo do `req.url` antes de chamar, igual ao
      // `app.use('/api/acervo', ...)` do express — por isso as rotas lá dentro
      // são `/` e `/:id` nos dois lados, sem nenhuma adaptação.
      server.middlewares.use('/api/acervo', (req, res, next) => {
        rotas ??= criarRotasAcervo(acervo ?? criarAcervo(abrirBanco(caminhoDoBanco())))
        rotas(req, res, next)
      })
    },
  }
}
