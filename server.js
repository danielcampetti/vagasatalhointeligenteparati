/**
 * O servidor de produção — o endpoint que faltava.
 *
 * O README e o `jsearch.js` diziam a mesma coisa desde o começo: "isto só
 * funciona em `npm run dev`; no GitHub Pages não há proxy, `/api/jsearch`
 * responde 404 e a busca falha — até existir um endpoint de produção que
 * guarde a chave fora do navegador". Este arquivo é esse endpoint.
 *
 * Ele faz duas coisas e nada mais: serve o `dist/` e reproxia os dois
 * prefixos de API injetando as chaves, que vêm das variáveis de ambiente do
 * Railway e nunca do bundle.
 *
 * ## Por que não dá para publicar só o estático
 *
 * Porque a chave precisa existir em algum lugar, e o navegador é público. Uma
 * `VITE_JSEARCH_API_KEY` apareceria em `dist/assets/*.js` para qualquer um
 * ler — é a coisa que o `.env.example` proíbe em letras maiúsculas. O
 * servidor existe para ser o único que conhece a chave.
 *
 * ## O comportamento espelha o do dev server de propósito
 *
 * Mesmos prefixos, mesma reescrita de caminho, mesmos headers de "sem chave".
 * O cliente (`jsearch.js` lê `x-jsearch-proxy`, o SDK da Claude lê
 * `x-should-retry`) não distingue um do outro, e é isso que faz o app se
 * comportar em produção como se comporta no `npm run dev`. Divergir aqui
 * criaria uma classe de defeito que só aparece publicado.
 *
 * ## Aviso sobre exposição
 *
 * Não há autenticação. Quem abrir a URL usa as chaves deste servidor: as 200
 * requisições/mês da JSearch e os créditos Anthropic da Avaliação IA. Foi uma
 * decisão deliberada de quem publicou, e está registrada no README — mas se
 * um dia virar problema, o lugar de resolver é aqui: um `if` no topo de
 * `reproxiar` conferindo um segredo do ambiente basta.
 */

import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { abrirBanco, caminhoDoBanco, criarAcervo } from './src/servidor/banco.js'
import { criarRotasAcervo } from './src/servidor/rotas.js'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const DIST = path.join(AQUI, 'dist')

const PORTA = process.env.PORT || 3000

/**
 * Os dois destinos, na mesma forma que o `vite.config.js` usa.
 *
 * `de` é o prefixo que o browser chama; `para` é o que ele vira no upstream.
 * A JSearch troca `/api/jsearch` por `/jsearch`; a Claude só remove o
 * prefixo, porque o SDK já manda `/v1/messages` — trocar por `/v1` viraria
 * `/v1/v1/messages` e 404, que é uma nota que o vite.config já carrega.
 */
const DESTINOS = [
  {
    nome: 'jsearch',
    de: '/api/jsearch',
    para: '/jsearch',
    upstream: 'https://api.openwebninja.com',
    variavel: 'JSEARCH_API_KEY',
  },
  {
    nome: 'claude',
    de: '/api/claude',
    para: '',
    upstream: 'https://api.anthropic.com',
    variavel: 'ANTHROPIC_API_KEY',
  },
]

/**
 * Cabeçalhos que não podem ser repassados adiante.
 *
 * `host` apontaria para o domínio do Railway em vez do upstream. `x-api-key`
 * é o ponto inteiro: o SDK da Claude manda uma chave falsa, e deixá-la passar
 * sobrescreveria a real. Os de codificação e tamanho são recalculados pelo
 * `fetch` — repassá-los produz corpo truncado ou erro de decodificação.
 */
const NAO_REPASSAR = new Set([
  'host',
  'connection',
  'content-length',
  'accept-encoding',
  'x-api-key',
  'authorization',
])

function semChave(res, destino) {
  res.status(500)
  res.setHeader(`x-${destino.nome}-proxy`, 'sem-chave')
  // Sem chave é um fato do ambiente, não uma falha passageira: tentar de novo
  // não acha a chave. O SDK da Claude obedece este header antes de olhar o
  // status — sem ele, o 5xx vira segundos de espera morta em três tentativas
  // antes da mensagem aparecer na tela.
  res.setHeader('x-should-retry', 'false')
  res.json({
    message: `${destino.variavel} não encontrada. Defina a variável no ambiente do servidor e reinicie.`,
  })
}

function reproxiar(destino) {
  return async (req, res) => {
    const chave = process.env[destino.variavel]?.trim()
    if (!chave) return semChave(res, destino)

    const caminho = req.originalUrl.replace(destino.de, destino.para)
    const url = `${destino.upstream}${caminho}`

    const cabecalhos = { 'x-api-key': chave }
    for (const [nome, valor] of Object.entries(req.headers)) {
      if (!NAO_REPASSAR.has(nome.toLowerCase())) cabecalhos[nome] = valor
    }

    try {
      const resposta = await fetch(url, {
        method: req.method,
        headers: cabecalhos,
        // GET e HEAD não podem levar corpo; os demais levam o que chegou,
        // cru — o `express.raw` abaixo entrega um Buffer sem interpretar,
        // que é o que preserva o JSON exato que o SDK montou.
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      })

      console.log(`[${destino.nome}] <- ${resposta.status} ${caminho}`)

      res.status(resposta.status)
      const tipo = resposta.headers.get('content-type')
      if (tipo) res.setHeader('content-type', tipo)
      res.send(Buffer.from(await resposta.arrayBuffer()))
    } catch (err) {
      console.error(`[${destino.nome}] erro de proxy:`, err.message)
      // O upstream não respondeu: nenhuma cota foi debitada. Sem este
      // marcador, este 502 é indistinguível de um 502 vindo da própria API, e
      // a contagem creditaria uma requisição que nunca aconteceu. Marca os
      // dois destinos, como o `semChave` acima já faz — `reproxiar` é
      // destino-agnóstico por desenho, e um `if` de nome aqui dentro seria a
      // mesma divergência que este arquivo existe para evitar. No lado da
      // Claude o header é inerte: `claude.js` só ramifica em `sem-chave`.
      res.setHeader(`x-${destino.nome}-proxy`, 'sem-resposta')
      // 502 e não 500: o servidor está de pé, quem não respondeu foi o
      // upstream. A distinção importa para quem lê o log depois.
      res.status(502).json({
        message: `Falha ao falar com a ${destino.nome}: ${err.message}`,
      })
    }
  }
}

/**
 * Monta o servidor sem escutar.
 *
 * A separação existe para o teste poder importar este arquivo. Enquanto o
 * `listen` acontecia no topo do módulo, importar abria uma porta como efeito
 * colateral — e uma porta ocupada derrubava a suíte por um motivo que não
 * tinha nada a ver com o que estava sendo testado.
 */
export function criarApp({ acervo = criarAcervo(abrirBanco(caminhoDoBanco())) } = {}) {
  const app = express()

  for (const destino of DESTINOS) {
    app.use(
      destino.de,
      // Sem interpretar: o corpo é repassado byte a byte. Um `express.json()`
      // aqui reserializaria o pedido da Claude e mudaria o que o upstream vê.
      express.raw({ type: () => true, limit: '10mb' }),
      reproxiar(destino),
    )
  }

  /**
   * O acervo compartilhado.
   *
   * Vem antes do estático porque `express.static` responderia 404 a
   * `/api/acervo` antes de qualquer rota registrada depois dele.
   *
   * As rotas em si moram no `src/servidor/rotas.js`, e não aqui, porque o dev
   * server do vite monta exatamente as mesmas — duas cópias seriam duas
   * chances de o `npm run dev` e o Railway divergirem.
   */
  app.use('/api/acervo', criarRotasAcervo(acervo))

  app.use(express.static(DIST))

  /**
   * Qualquer outra rota devolve o `index.html`.
   *
   * O app é uma página só, e a navegação dele é estado em memória — mas um F5
   * ou um link colado precisa cair no HTML em vez de 404. Vem depois do
   * estático, senão engoliria os pedidos de `/assets/*`.
   */
  app.use((_req, res) => res.sendFile(path.join(DIST, 'index.html')))

  return app
}

/**
 * Só escuta quando este arquivo é o ponto de entrada (`npm start`).
 *
 * Importado por um teste, `process.argv[1]` é o runner do vitest, a comparação
 * falha, e nenhuma porta é aberta.
 */
const ehPontoDeEntrada =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))

if (ehPontoDeEntrada) {
  criarApp().listen(PORTA, () => {
    console.log(`[servidor] no ar na porta ${PORTA}`)
    for (const d of DESTINOS) {
      const tem = Boolean(process.env[d.variavel]?.trim())
      console.log(`[${d.nome}] ${tem ? 'chave presente' : `SEM ${d.variavel}`}`)
    }
    /**
     * O caminho do banco vai para o log ao lado da porta e das chaves porque
     * `BANCO_CAMINHO` ausente é a falha que não dá sintoma nenhum: o app sobe,
     * funciona perfeitamente, e o acervo morre no deploy seguinte — que é o
     * defeito exato que este trabalho existe para corrigir. Sem esta linha só
     * se descobre reparando que o acervo zera de tempos em tempos.
     */
    const caminho = caminhoDoBanco()
    const daVariavel = Boolean(process.env.BANCO_CAMINHO?.trim())
    console.log(
      `[acervo] banco em ${caminho}` +
        (daVariavel
          ? ''
          : ' — SEM BANCO_CAMINHO: disco efêmero, o acervo some no próximo deploy'),
    )
  })
}