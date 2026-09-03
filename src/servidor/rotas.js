/**
 * As rotas do acervo, num lugar só.
 *
 * Elas nasceram dentro do `criarApp` do `server.js`, e ali ficariam se
 * houvesse um servidor só. Há dois: o `server.js` no Railway e o dev server do
 * vite no `npm run dev`. O README promete que os dois se comportam igual, e
 * essa promessa é o que faz defeito de produção aparecer antes de publicar —
 * duas cópias das mesmas quatro rotas seriam duas chances de divergirem, e
 * divergir é o defeito, não o risco.
 *
 * ## Por que um sub-app do express, e não um `Router`
 *
 * Do lado do vite, isto é montado no `server.middlewares`, que é uma pilha
 * connect: o `res` que chega ali é um `http.ServerResponse` cru, sem `json`
 * nem `status`. Quem instala esses métodos é o middleware `init` que todo app
 * do express roda antes das suas rotas — um `Router` sozinho não o traz, e as
 * rotas quebrariam em `res.json is not a function`.
 *
 * Um app do express também é uma função `(req, res, next)`, então serve nas
 * duas pilhas sem adaptador. E o connect corta o prefixo do `req.url` antes de
 * chamar, que é a mesma coisa que o `app.use('/api/acervo', ...)` do express
 * faz — por isso os caminhos aqui dentro são `/` e `/:id` nos dois casos.
 *
 * ## Não há DELETE
 *
 * Decisão 2 do dono do projeto: nada é destruído no servidor. Ela é satisfeita
 * por ausência de código — o que não existe não pode ser chamado por engano.
 */

import express from 'express'

/**
 * O teto do corpo de um POST ou PATCH do acervo.
 *
 * Eram 10 MB, herdados do proxy da Claude — lá o número existe por causa dos
 * currículos, e não tem nada a ver com uma busca de vagas, que não passa de
 * alguns KB. Aqui o número é o teto do estrago: o corpo é desserializado e
 * reserializado de forma síncrona, num processo só, e o que entra fica no
 * volume, onde sobrevive a restart e a deploy e não tem `DELETE` que desfaça.
 *
 * 2 MB dão folga de duas ordens de grandeza sobre a maior busca real.
 */
export const LIMITE_CORPO = '2mb'

export function criarRotasAcervo(acervo) {
  const rotas = express()
  const json = express.json({ limit: LIMITE_CORPO })

  rotas.get('/', (_req, res) => {
    res.json({ vagas: acervo.listar() })
  })

  rotas.get('/:id', (req, res) => {
    const vaga = acervo.buscarPorId(req.params.id)
    if (!vaga) return res.status(404).json({ message: 'Vaga não encontrada no acervo.' })
    res.json(vaga)
  })

  rotas.post('/', json, (req, res) => {
    // Corpo sem `vagas` não é erro: um POST de lista vazia é o que a busca sem
    // resultado manda, e recusá-lo com 400 viraria um aviso na tela por um
    // não-evento.
    const vagas = Array.isArray(req.body?.vagas) ? req.body.vagas : []
    res.json({ vagas: acervo.guardar(vagas) })
  })

  rotas.patch('/:id', json, (req, res) => {
    const vaga = acervo.atualizar(req.params.id, req.body ?? {})
    if (!vaga) return res.status(404).json({ message: 'Vaga não encontrada no acervo.' })
    res.json(vaga)
  })

  return rotas
}
