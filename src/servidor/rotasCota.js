/**
 * As rotas da cota.
 *
 * Moram aqui, e não no `server.js`, pela razão que o `rotas.js` do acervo já
 * documenta: há dois servidores — o `server.js` no Railway e o dev server do
 * vite —, e duas cópias das mesmas rotas seriam duas chances de divergirem.
 *
 * ## Um sub-app do express, e não um `Router`
 *
 * Do lado do vite isto é montado numa pilha connect, onde o `res` é um
 * `http.ServerResponse` cru, sem `json` nem `status`. Quem instala esses
 * métodos é o middleware `init` que todo app do express roda — um `Router`
 * sozinho não o traz, e as rotas quebrariam em `res.json is not a function`.
 *
 * ## Não há DELETE
 *
 * Mesma decisão do acervo, satisfeita por ausência de código: o que não existe
 * não pode ser chamado por engano.
 */

import express from 'express'

/**
 * O segredo que tranca as duas rotas destrutivas.
 *
 * Lido do ambiente a cada pedido, e não uma vez no import: o teste troca a
 * variável entre casos, e um valor capturado na carga do módulo tornaria isso
 * impossível de exercitar.
 *
 * **Variável ausente significa aberto.** É deliberado: o `npm run dev` não
 * pode passar a exigir senha, e quem já roda local não pode quebrar por causa
 * de uma variável que só existe no Railway.
 */
function segredoDoAmbiente() {
  return process.env.CONTROLE_SEGREDO?.trim() || null
}

/**
 * Deixa passar quando não há segredo, ou quando o header bate.
 *
 * 403 e não 401: 401 pede autenticação por um esquema que não existe aqui, e o
 * cliente ficaria esperando um `WWW-Authenticate` que ninguém manda.
 */
function comSegredo(req, res, next) {
  const esperado = segredoDoAmbiente()
  if (!esperado) return next()
  if (req.get('x-controle-segredo') === esperado) return next()
  res.status(403).json({
    message: 'Senha do controle ausente ou errada. Zerar e ajustar são do dono da conta.',
  })
}

export function criarRotasCota(cota) {
  const rotas = express()
  const json = express.json({ limit: '4kb' })

  /**
   * A leitura nunca pede senha.
   *
   * Ler o número não estraga nada, e trancar a leitura esconderia a informação
   * de quem o painel existe para informar. `protegido` é um booleano — diz à
   * tela se deve pedir a senha, e não revela nada sobre ela.
   */
  rotas.get('/', (_req, res) => {
    res.json({ ...cota.ler(), protegido: Boolean(segredoDoAmbiente()) })
  })

  rotas.post('/zerar', comSegredo, (_req, res) => {
    res.json(cota.zerar())
  })

  rotas.post('/ajustar', comSegredo, json, (req, res) => {
    res.json(cota.ajustar(req.body?.gastas))
  })

  return rotas
}
