/**
 * O acervo, a cota e a contagem sob o `npm run dev`.
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
 * A cota entra pelo mesmo motivo: sem este plugin contando também sob o
 * `npm run dev`, quem desenvolve local gastaria requisições da JSearch sem
 * nenhum número subindo, e só descobriria a cota estourada em produção — o
 * mesmo defeito de "dev e Railway divergem", numa porta diferente.
 *
 * ## Um plugin, e não um segundo processo
 *
 * Rodar o `server.js` ao lado do vite exigiria concorrência no `npm run dev`,
 * duas portas e um proxy entre elas — três coisas novas para quem desenvolve
 * errar. O `configureServer` roda **antes** dos middlewares internos do vite,
 * inclusive do proxy e do de `base`, e é exatamente a propriedade em que o
 * `guardaDeChave` do `vite.config.js` já se apoia e já documenta.
 *
 * As rotas e o middleware de contagem são os **mesmos** do `server.js` — o
 * `criarRotasAcervo`, o `criarRotasCota` e o `contarJSearch` são importados,
 * não copiados. Duas cópias seriam duas chances de divergirem, e divergir
 * aqui é o defeito, não o risco.
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
export function pluginServidor({ acervo, cota } = {}) {
  return {
    name: 'servidor-no-dev',
    async configureServer(server) {
      const { abrirBanco, caminhoDoBanco, criarAcervo, criarCota } = await import('./banco.js')
      const { criarRotasAcervo } = await import('./rotas.js')
      const { criarRotasCota } = await import('./rotasCota.js')
      const { contarJSearch } = await import('./contagem.js')

      /**
       * O banco abre no primeiro pedido, não ao montar.
       *
       * Nem todo dev server que carrega este config é o `npm run dev`: o
       * vitest sobe um servidor interno, com os plugins do config, só para
       * transformar módulos. Abrir o arquivo ao montar fazia `npm test` criar
       * um `acervo.db` no repositório e segurá-lo aberto — efeito colateral de
       * rodar teste, num arquivo que nenhum teste queria.
       *
       * Quem não pede `/api/acervo` nem `/api/cota` não abre banco nenhum.
       */
      let db = null
      const oBanco = () => (db ??= abrirBanco(caminhoDoBanco()))
      let rotasAcervo = null
      let rotasCota = null
      let aCota = null
      // A cota tem um handle só, reaproveitado entre a rota `/api/cota` e o
      // middleware de contagem em `/api/jsearch` — é o mesmo `db` dos dois, e
      // é o mesmo objeto `cota` das duas montagens, para não haver dois
      // contadores em memória divergindo entre si.
      const cotaDaVez = () => (aCota ??= cota ?? criarCota(oBanco()))

      // O connect corta o prefixo do `req.url` antes de chamar, igual ao
      // `app.use('/api/acervo', ...)` do express — por isso as rotas lá dentro
      // são `/` e `/:id` nos dois lados, sem nenhuma adaptação.
      server.middlewares.use('/api/acervo', (req, res, next) => {
        rotasAcervo ??= criarRotasAcervo(acervo ?? criarAcervo(oBanco()))
        rotasAcervo(req, res, next)
      })

      server.middlewares.use('/api/cota', (req, res, next) => {
        rotasCota ??= criarRotasCota(cotaDaVez())
        rotasCota(req, res, next)
      })

      // A contagem vem antes do proxy do vite na pilha, e é o mesmo
      // middleware que o `server.js` monta: ele só registra um listener em
      // `res` e chama `next()` na mesma linha, então vale mesmo que o proxy
      // que vem depois falhe ou nunca responda.
      server.middlewares.use('/api/jsearch', (req, res, next) => {
        contarJSearch(cotaDaVez())(req, res, next)
      })
    },
  }
}
