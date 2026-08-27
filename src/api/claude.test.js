import Anthropic from '@anthropic-ai/sdk'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { PRECOS, definirTeto, lerCusto, registrarChamada } from '../custo'
import configVite, { guardaDeChave } from '../../vite.config.js'
import {
  ErroClaude,
  MODELO,
  TIPOS,
  chamarEstruturado,
  chamarTexto,
  claude,
  conferirResposta,
  conferirTeto,
  contabilizar,
  mensagemDoErro,
} from './claude'

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('conferirTeto', () => {
  test('passa quando está abaixo', () => {
    expect(() => conferirTeto()).not.toThrow()
  })

  test('lança tipo "teto" quando estourou', () => {
    definirTeto(0.001)
    registrarChamada(
      TIPOS.RANKING,
      { input_tokens: 1_000_000, output_tokens: 0 },
      MODELO,
    )
    expect(() => conferirTeto()).toThrow(ErroClaude)
    try {
      conferirTeto()
    } catch (err) {
      expect(err.tipo).toBe('teto')
      expect(err.message).toMatch(/teto/i)
    }
  })
})

describe('conferirResposta', () => {
  test('passa numa resposta normal', () => {
    expect(() =>
      conferirResposta({ stop_reason: 'end_turn', content: [] }),
    ).not.toThrow()
  })

  test('lança tipo "recusa" em refusal', () => {
    try {
      conferirResposta({
        stop_reason: 'refusal',
        stop_details: { category: 'cyber', explanation: 'x' },
      })
      throw new Error('devia ter lançado')
    } catch (err) {
      expect(err.tipo).toBe('recusa')
    }
  })

  test('lança quando a saída foi cortada pelo max_tokens', () => {
    try {
      conferirResposta({ stop_reason: 'max_tokens', content: [] })
      throw new Error('devia ter lançado')
    } catch (err) {
      expect(err.tipo).toBe('vazio')
      // A mesma mensagem serve para as três chamadas do invólucro (perfil,
      // ranking, justificativa) — não pode apontar para "o currículo" quando
      // quem cortou foi um lote de vagas ou uma justificativa em prosa.
      expect(err.message).not.toMatch(/currículo/i)
    }
  })

  test('lança quando a saída foi cortada por estourar a janela de contexto', () => {
    // Mesmo efeito de max_tokens — saída pela metade — mas stop_reason
    // diferente (model_context_window_exceeded).
    try {
      conferirResposta({
        stop_reason: 'model_context_window_exceeded',
        content: [],
      })
      throw new Error('devia ter lançado')
    } catch (err) {
      expect(err.tipo).toBe('vazio')
      expect(err.message).not.toMatch(/currículo/i)
    }
  })

  test('não lança em resposta ausente', () => {
    expect(() => conferirResposta(undefined)).not.toThrow()
  })
})

describe('contabilizar', () => {
  test('registra o uso no custo.js', () => {
    contabilizar(TIPOS.PERFIL, {
      usage: { input_tokens: 100, output_tokens: 50 },
    })
    const chamada = lerCusto().chamadas[0]
    expect(chamada).toMatchObject({
      tipo: TIPOS.PERFIL,
      entrada: 100,
      saida: 50,
    })
    expect(chamada.modelo).toBe(MODELO)
  })

  test('resposta sem usage não derruba, e não registra nada', () => {
    expect(() => contabilizar(TIPOS.PERFIL, {})).not.toThrow()
    // Sem isto, uma resposta sem `usage` (ex.: depois de um erro) registraria
    // uma chamada fantasma de custo zero — o medidor mentiria por omissão.
    expect(lerCusto().chamadas).toEqual([])
  })
})

describe('chamarEstruturado — invólucro (messages.parse)', () => {
  test('conferirTeto bloqueia antes do SDK: estourado, o SDK nunca é chamado', async () => {
    definirTeto(0.001)
    registrarChamada(
      TIPOS.RANKING,
      { input_tokens: 1_000_000, output_tokens: 0 },
      MODELO,
    )
    // mockImplementation que lança: se o guard de teto sumir e o SDK for
    // chamado mesmo assim, o erro que vaza não é ErroClaude — a asserção de
    // baixo falha alto e claro em vez de tentar uma rede de verdade.
    const parseSpy = vi
      .spyOn(claude.messages, 'parse')
      .mockImplementation(() => {
        throw new Error('não deveria ter chamado o SDK — teto devia bloquear antes')
      })

    await expect(
      chamarEstruturado(TIPOS.PERFIL, { max_tokens: 100, messages: [] }),
    ).rejects.toThrow(ErroClaude)
    expect(parseSpy).not.toHaveBeenCalled()
  })

  test('injeta MODELO (mesmo se params tentar outro), contabiliza e devolve a resposta', async () => {
    const respostaFake = {
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 5 },
      parsed_output: { ok: true },
    }
    const parseSpy = vi
      .spyOn(claude.messages, 'parse')
      .mockResolvedValue(respostaFake)

    const resposta = await chamarEstruturado(TIPOS.PERFIL, {
      max_tokens: 100,
      messages: [{ role: 'user', content: 'oi' }],
      model: 'modelo-que-o-chamador-não-deveria-poder-escolher',
    })

    expect(resposta).toBe(respostaFake)
    expect(parseSpy).toHaveBeenCalledWith(
      expect.objectContaining({ model: MODELO, max_tokens: 100 }),
    )
    expect(lerCusto().chamadas[0]).toMatchObject({
      tipo: TIPOS.PERFIL,
      entrada: 10,
      saida: 5,
      modelo: MODELO,
    })
  })

  test('uma recusa é contabilizada antes de lançar', async () => {
    const respostaRecusa = {
      stop_reason: 'refusal',
      stop_details: { category: 'cyber', explanation: 'x' },
      usage: { input_tokens: 20, output_tokens: 1 },
    }
    vi.spyOn(claude.messages, 'parse').mockResolvedValue(respostaRecusa)

    await expect(
      chamarEstruturado(TIPOS.PERFIL, { max_tokens: 100, messages: [] }),
    ).rejects.toThrow(ErroClaude)

    // A prova de ordem: mesmo com o throw, a chamada já está no livro-caixa.
    // Se `contabilizar` viesse depois de `conferirResposta`, o throw a
    // impediria de rodar e este array estaria vazio — o teto futuro ficaria
    // sempre um pouco mentiroso.
    expect(lerCusto().chamadas[0]).toMatchObject({
      tipo: TIPOS.PERFIL,
      entrada: 20,
      saida: 1,
    })
  })
})

describe('chamarTexto — invólucro (messages.create)', () => {
  test('conferirTeto bloqueia antes do SDK: estourado, o SDK nunca é chamado', async () => {
    definirTeto(0.001)
    registrarChamada(
      TIPOS.RANKING,
      { input_tokens: 1_000_000, output_tokens: 0 },
      MODELO,
    )
    const createSpy = vi
      .spyOn(claude.messages, 'create')
      .mockImplementation(() => {
        throw new Error('não deveria ter chamado o SDK — teto devia bloquear antes')
      })

    await expect(
      chamarTexto(TIPOS.JUSTIFICATIVA, { max_tokens: 100, messages: [] }),
    ).rejects.toThrow(ErroClaude)
    expect(createSpy).not.toHaveBeenCalled()
  })

  test('injeta MODELO, contabiliza e devolve a resposta', async () => {
    const respostaFake = {
      stop_reason: 'end_turn',
      usage: { input_tokens: 30, output_tokens: 15 },
      content: [{ type: 'text', text: 'justificativa em prosa' }],
    }
    const createSpy = vi
      .spyOn(claude.messages, 'create')
      .mockResolvedValue(respostaFake)

    const resposta = await chamarTexto(TIPOS.JUSTIFICATIVA, {
      max_tokens: 2000,
      messages: [{ role: 'user', content: 'oi' }],
      model: 'modelo-que-o-chamador-não-deveria-poder-escolher',
    })

    expect(resposta).toBe(respostaFake)
    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({ model: MODELO, max_tokens: 2000 }),
    )
    expect(lerCusto().chamadas[0]).toMatchObject({
      tipo: TIPOS.JUSTIFICATIVA,
      entrada: 30,
      saida: 15,
      modelo: MODELO,
    })
  })

  test('uma recusa é contabilizada antes de lançar', async () => {
    const respostaRecusa = {
      stop_reason: 'refusal',
      stop_details: { category: 'cyber', explanation: 'x' },
      usage: { input_tokens: 40, output_tokens: 2 },
    }
    vi.spyOn(claude.messages, 'create').mockResolvedValue(respostaRecusa)

    await expect(
      chamarTexto(TIPOS.JUSTIFICATIVA, { max_tokens: 100, messages: [] }),
    ).rejects.toThrow(ErroClaude)

    expect(lerCusto().chamadas[0]).toMatchObject({
      tipo: TIPOS.JUSTIFICATIVA,
      entrada: 40,
      saida: 2,
    })
  })
})

describe('mensagemDoErro', () => {
  test('429 vira mensagem sobre limite', () => {
    // O construtor de APIError (de quem RateLimitError herda) chama
    // `headers?.get(...)` — um objeto literal `{}` não tem `.get` e o
    // construtor lança. `undefined` é o que o SDK realmente passa quando
    // não há headers (ver APIError.generate em core/error.ts), e é o que
    // funciona aqui. Verificado direto contra o pacote instalado
    // (node_modules/@anthropic-ai/sdk@0.121.0) antes de escrever este teste.
    //
    // A mensagem passada aqui é em inglês e de propósito não contém
    // "limite": se o `err.message` bruto tivesse essa palavra, o teste
    // passaria mesmo com o ramo `instanceof RateLimitError` apagado, porque
    // o ramo genérico de `Anthropic.APIError` também ecoa `err.message`.
    const err = new Anthropic.RateLimitError(429, undefined, 'too many requests', undefined)
    expect(mensagemDoErro(err)).toMatch(/limite/i)
  })

  test('401 vira mensagem sobre autorização', () => {
    const err = new Anthropic.AuthenticationError(401, undefined, 'unauthorized', undefined)
    expect(mensagemDoErro(err)).toMatch(/autoriza/i)
  })

  test('400 com corpo real da Anthropic extrai o motivo, sem JSON cru nem status duplicado', () => {
    // Corpo real da Anthropic: {"type":"error","error":{"type":"...",
    // "message":"..."}} — sem `.message` no topo. Passar `err.message` bruto
    // (em vez do detalhe extraído) faz `APIError.makeMessage` cair em
    // `JSON.stringify` do corpo inteiro, e o status aparece duas vezes (uma
    // vez no "(400)" literal, outra dentro do `err.message` que o SDK já
    // prefixa com o status). As fixtures anteriores usavam corpo `undefined`,
    // que nunca ocorre em produção e escondia os dois problemas.
    const err = new Anthropic.BadRequestError(
      400,
      {
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message:
            'max_tokens: 8000 > 4096, which is the maximum allowed number of output tokens for claude-opus-5',
        },
      },
      undefined,
      undefined,
    )
    const msg = mensagemDoErro(err)
    // "recusou os parâmetros" só existe neste ramo — o genérico de APIError,
    // mais abaixo, também ecoaria o motivo, então essa frase é o que prova
    // que foi ESTE `if` que respondeu, não o catch-all.
    expect(msg).toMatch(/recusou os parâmetros/)
    expect(msg).toMatch(/max_tokens: 8000 > 4096/)
    expect(msg).not.toMatch(/[{}]/)
    expect(msg.match(/400/g)).toHaveLength(1)
  })

  test('erro de conexão vira mensagem sobre o npm run dev', () => {
    const err = new Anthropic.APIConnectionError({ message: 'econnrefused' })
    expect(mensagemDoErro(err)).toMatch(/npm run dev/)
  })

  test('status sem tratamento específico cai no genérico, sem JSON cru nem status duplicado', () => {
    // 500 não tem `if` próprio — só bate no catch-all `instanceof
    // Anthropic.APIError`. O corpo real também não tem `.message` no topo,
    // então o mesmo risco de JSON cru/status duplicado do teste de 400 vale
    // aqui. O prefixo "A Claude respondeu" é o que prova que foi este ramo, e
    // não o catch-all final ("Erro inesperado: ..."), que também ecoaria
    // status e mensagem.
    const err = new Anthropic.InternalServerError(
      500,
      { type: 'error', error: { type: 'api_error', message: 'Internal server error' } },
      undefined,
      undefined,
    )
    const msg = mensagemDoErro(err)
    expect(msg).toMatch(/^A Claude respondeu 500: /)
    expect(msg).toMatch(/Internal server error/)
    expect(msg).not.toMatch(/[{}]/)
    expect(msg.match(/500/g)).toHaveLength(1)
  })

  test('ErroClaude devolve a própria mensagem', () => {
    const err = new ErroClaude('mensagem específica', { tipo: 'teto' })
    expect(mensagemDoErro(err)).toBe('mensagem específica')
  })

  test('erro desconhecido não devolve undefined', () => {
    expect(mensagemDoErro(new Error('qualquer coisa'))).toBeTruthy()
  })
})

describe('mensagemDoErro — guarda local sem chave (x-claude-proxy)', () => {
  // Corpo, status e header copiados de vite.config.js > guardaDeChave, não
  // reconstruídos de memória: status 500, header `x-${nome}-proxy: sem-chave`
  // com nome='claude', corpo `{ message: '${variavel} não encontrada. Copie
  // .env.example para .env, cole sua chave e reinicie o npm run dev.' }` com
  // variavel='ANTHROPIC_API_KEY'.
  const CORPO_GUARDA = {
    message:
      'ANTHROPIC_API_KEY não encontrada. Copie .env.example para .env, cole sua chave e reinicie o npm run dev.',
  }

  test('corpo real da guarda vira a própria mensagem, sem o enquadramento "A Claude respondeu"', () => {
    const headers = new Headers()
    headers.set('x-claude-proxy', 'sem-chave')
    const err = new Anthropic.InternalServerError(500, CORPO_GUARDA, undefined, headers)

    const msg = mensagemDoErro(err)
    // A requisição nunca chegou à Claude — "A Claude respondeu" seria
    // mentira. Isto também prende o fallback `corpo?.message` de
    // detalheDoErro: o corpo da guarda tem `.message` no topo, sem
    // `.error.message` aninhado — diferente do formato real de erro da
    // Anthropic (sempre aninhado), que é o único formato que os testes de
    // 400/500 acima exercitam. Sem este teste, apagar `|| corpo?.message`
    // deixava os outros 61 testes verdes.
    expect(msg).not.toMatch(/A Claude respondeu/)
    expect(msg).toBe(CORPO_GUARDA.message)
  })

  test('header com outro valor não desvia do fluxo normal de APIError', () => {
    const headers = new Headers()
    headers.set('x-claude-proxy', 'outra-coisa')
    const err = new Anthropic.InternalServerError(
      500,
      { type: 'error', error: { type: 'api_error', message: 'Internal server error' } },
      undefined,
      headers,
    )
    // Prova que o ramo checa o valor exato 'sem-chave', não só a presença do
    // header — um 500 real da Anthropic, se algum dia vier com um header de
    // nome parecido por acidente, não pode perder o enquadramento correto.
    expect(mensagemDoErro(err)).toMatch(/^A Claude respondeu 500: /)
  })
})

describe('C-1 — baseURL absoluta e rewrite do proxy (regressão)', () => {
  test('claude.buildURL não estoura e aponta pro caminho certo no proxy', () => {
    // baseURL relativa ('/api/claude') faz `new URL(baseURL + path)`, de um
    // argumento só (client.buildURL no SDK), estourar `TypeError: Invalid
    // URL` antes de qualquer fetch sair — provado direto contra o pacote
    // instalado antes de escrever este teste. Isto prova que a baseURL
    // construída em claude.js é absoluta e resolve para o prefixo certo.
    const url = claude.buildURL('/v1/messages')
    expect(new URL(url).pathname).toBe('/api/claude/v1/messages')
  })

  test('o rewrite do proxy tira só o prefixo — o /v1 do SDK sobrevive', () => {
    // Importa o vite.config.js de verdade (não uma reimplementação), para
    // que uma regressão na linha do rewrite também derrube este teste. Só
    // invoca a função de config e lê o `rewrite`; não sobe servidor, zero
    // rede. O bug original: `.replace(PREFIXO_CLAUDE, '/v1')` trocava o
    // prefixo por '/v1' em vez de tirá-lo, e `/api/claude/v1/messages`
    // virava `/v1/v1/messages` — 404 na Anthropic.
    const config = configVite({ mode: 'development' })
    const rewrite = config.server.proxy['/api/claude'].rewrite
    expect(rewrite('/api/claude/v1/messages')).toBe('/v1/messages')
  })
})

describe('guardaDeChave — x-should-retry (regressão)', () => {
  // Invoca a fábrica de verdade (não uma reimplementação): chama
  // `guardaDeChave` diretamente com `chave: undefined`, em vez de montar a
  // config inteira via `configVite` e contar com a ausência de
  // ANTHROPIC_API_KEY no .env de quem roda o teste. Passar a ausência de
  // chave como argumento explícito, em vez de depender do `loadEnv` real,
  // é o que torna a reprodutibilidade do teste uma propriedade do código —
  // e não de quais chaves existem na máquina de quem roda `npm test`.
  function capturarHeadersDaGuarda() {
    const plugin = guardaDeChave({
      nome: 'claude',
      prefixo: '/api/claude',
      chave: undefined,
      variavel: 'ANTHROPIC_API_KEY',
    })

    let handler
    plugin.configureServer({
      middlewares: { use: (_prefixo, h) => { handler = h } },
    })
    expect(typeof handler).toBe('function')

    const headers = {}
    const res = {
      statusCode: null,
      setHeader: (nome, valor) => { headers[nome] = valor },
      end: () => {},
    }
    handler({}, res, () => {
      throw new Error('não devia chamar next() — chave é undefined explicitamente')
    })
    return headers
  }

  test('a guarda da Claude marca a resposta como não repetível', () => {
    // Sem isto, 5xx é retentável por padrão no SDK (client.ts > shouldRetry)
    // e o aluno espera ~1,4s de espera morta, em três tentativas, vendo nada
    // — a chave ausente não vai aparecer numa segunda tentativa.
    const headers = capturarHeadersDaGuarda()
    expect(headers['x-should-retry']).toBe('false')
  })

  // Não há um teste em runtime equivalente para a guarda do JSearch aqui: o
  // mesmo truque de cima (chamar `guardaDeChave` direto, com
  // `chave: undefined`) funcionaria igual trocando nome/prefixo/variavel
  // para 'jsearch' — não há impedimento técnico, seria só redundante. A
  // garantia aqui é estrutural, não de runtime: o
  // `res.setHeader('x-should-retry', 'false')` está dentro do corpo
  // compartilhado de `guardaDeChave`, sem `if` nenhum sobre `nome` — é a
  // mesma função, com o mesmo corpo, para as duas guardas (só `nome`,
  // `prefixo`, `chave` e `variavel` mudam por chamada). O teste acima já
  // prova que esse corpo escreve o header quando a guarda dispara; não há
  // como o resultado ser diferente para o JSearch quando a dele dispara —
  // e jsearch.js (fetch puro, só lê `x-jsearch-proxy`, sem laço de retry
  // próprio) não faz nada com o header de qualquer forma.
})

describe('M-5 — MODELO tem preço cadastrado em custo.js', () => {
  test('PRECOS[MODELO] existe', () => {
    // Sem isto, um MODELO fora da tabela de custo.js faz `dolares()` somar
    // sempre zero para essas chamadas (custo.js trata modelo desconhecido
    // como US$ 0 de propósito, pra não derrubar a aba Controle) — e
    // `conferirTeto`, que lê esse mesmo total, nunca prenderia nada. Em
    // silêncio, sem exceção em lugar nenhum.
    expect(PRECOS[MODELO]).toBeDefined()
  })
})
