import { describe, expect, test } from 'vitest'
import { PARAMS_FIXOS, cursorDaResposta, montarUrl } from './jsearch'
import { JANELAS, JANELA_PADRAO } from '../janela'

// Primeiro teste deste módulo. Ele nasceu junto com a paginação por cursor:
// até aqui o `jsearch.js` só sabia pedir a primeira página, e a única coisa
// que variava era a string de consulta.
describe('montarUrl', () => {
  test('sem cursor: leva a consulta e os parâmetros fixos, e nenhum cursor', () => {
    const url = montarUrl('Técnico de TI em Caxias do Sul, RS')
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('query')).toBe('Técnico de TI em Caxias do Sul, RS')
    expect(params.get('country')).toBe(PARAMS_FIXOS.country)
    expect(params.has('cursor')).toBe(false)
  })

  test('com cursor: acrescenta sem perder a consulta', () => {
    const url = montarUrl('Técnico de TI', 'CURSOR123')
    const params = new URLSearchParams(url.split('?')[1])
    expect(params.get('cursor')).toBe('CURSOR123')
    expect(params.get('query')).toBe('Técnico de TI')
  })

  // Cursor vazio não é cursor. Mandar `cursor=` seria pedir a "próxima página
  // de nada" — e uma requisição malformada custa uma das 200 do mês igual.
  test('cursor vazio ou nulo não vira parâmetro', () => {
    for (const vazio of [null, undefined, '']) {
      const params = new URLSearchParams(montarUrl('x', vazio).split('?')[1])
      expect(params.has('cursor')).toBe(false)
    }
  })
})

/**
 * A busca não mandava `date_posted` nenhum, o que na API equivale a `all` —
 * e `all` foi medido como a origem dos dois defeitos: metade do retorno vinha
 * sem data de publicação, e era essa metade que trazia anúncio já encerrado.
 * Com `date_posted=month`, a mesma consulta voltou 10 vagas todas datadas.
 */
describe('montarUrl: janela de publicação', () => {
  const paramsDe = (url) => new URLSearchParams(url.split('?')[1])

  test('sem janela explícita manda o padrão, não deixa a API decidir', () => {
    expect(paramsDe(montarUrl('x')).get('date_posted')).toBe(JANELA_PADRAO)
  })

  test('a janela escolhida é o que vai para a API', () => {
    expect(paramsDe(montarUrl('x', null, 'week')).get('date_posted')).toBe('week')
  })

  // 'Qualquer data' é uma escolha, não uma ausência: mandar `all` explícito
  // deixa a intenção legível no log do proxy e no `parameters` da resposta.
  test('qualquer data manda date_posted=all, e não omite o parâmetro', () => {
    expect(paramsDe(montarUrl('x', null, 'all')).get('date_posted')).toBe('all')
  })

  // Uma janela vinda do localStorage de uma versão anterior não pode virar
  // `date_posted=ontem`: a API recusaria com 400 e a requisição malformada
  // debitaria uma das 200 do mês igual.
  test('janela desconhecida cai no padrão em vez de ir torta para a API', () => {
    const params = paramsDe(montarUrl('x', null, 'ontem-a-noite'))
    expect(params.get('date_posted')).toBe(JANELA_PADRAO)
  })

  /**
   * A janela que a API não tem. `date_posted` é enum fechado (all, today,
   * 3days, week, month) e `15dias` não está nele — mandá-lo seria 400, que
   * debita cota. Vai `month`, e os 15 dias saem do corte local.
   */
  test('15 dias pede month à API, não "15dias"', () => {
    const params = paramsDe(montarUrl('x', null, '15dias'))
    expect(params.get('date_posted')).toBe('month')
  })

  test('nenhuma janela manda para a API um valor fora do enum dela', () => {
    const enumDaApi = ['all', 'today', '3days', 'week', 'month']
    for (const j of JANELAS) {
      expect(enumDaApi).toContain(paramsDe(montarUrl('x', null, j.valor)).get('date_posted'))
    }
  })

  test('janela e cursor convivem: carregar mais não perde o recorte', () => {
    const params = paramsDe(montarUrl('x', 'CURSOR9', 'week'))
    expect(params.get('cursor')).toBe('CURSOR9')
    expect(params.get('date_posted')).toBe('week')
  })
})

/**
 * A doc do `/search-v2` não tem parâmetro de "modalidade": tem
 * `work_from_home`, booleano, "Only return work from home / remote jobs".
 * `work_arrangement` é o campo da *resposta*, e mandá-lo no pedido seria um
 * 400 — que debita cota igual a uma busca boa. Ver `modalidade.js`.
 *
 * O dropdown tem duas opções porque a API responde uma pergunta de duas
 * respostas. Só uma delas vira parâmetro: "Presencial" é a ausência de
 * `work_from_home`, e todo o seu trabalho é corte local.
 */
describe('montarUrl: modalidade', () => {
  const paramsDe = (url) => new URLSearchParams(url.split('?')[1])

  test('sem modalidade explícita não manda work_from_home', () => {
    expect(paramsDe(montarUrl('x')).has('work_from_home')).toBe(false)
  })

  test('remoto vira work_from_home=true', () => {
    const params = paramsDe(montarUrl('x', null, 'month', 'remoto'))
    expect(params.get('work_from_home')).toBe('true')
  })

  // Mandar `work_from_home=false` pediria exatamente o que a omissão já pede,
  // com uma chance a mais de a API mudar de ideia sobre como interpretá-lo.
  test('presencial não manda parâmetro nenhum, nem false', () => {
    const params = paramsDe(montarUrl('x', null, 'month', 'presencial'))
    expect(params.has('work_from_home')).toBe(false)
  })

  /**
   * Mesma defesa que a janela desconhecida já tem, pelo mesmo motivo — e ela
   * tem um segundo uso agora: 'todas' e 'hibrido' foram opções de uma versão
   * anterior e podem estar no localStorage de alguém. Caem aqui, e o pior que
   * acontece é a busca sair sem o parâmetro.
   */
  test('modalidade desconhecida não vira parâmetro torto', () => {
    for (const morto of ['teletrabalho', 'todas', 'hibrido']) {
      const params = paramsDe(montarUrl('x', null, 'month', morto))
      expect(params.has('work_from_home')).toBe(false)
    }
  })

  test('modalidade, janela e cursor convivem numa URL só', () => {
    const params = paramsDe(montarUrl('x', 'CURSOR9', 'week', 'remoto'))
    expect(params.get('cursor')).toBe('CURSOR9')
    expect(params.get('date_posted')).toBe('week')
    expect(params.get('work_from_home')).toBe('true')
  })
})

describe('cursorDaResposta', () => {
  test('sem cursor: null, que é como a última página se anuncia', () => {
    expect(cursorDaResposta({ data: [] })).toBe(null)
  })

  test('resposta ausente ou estranha não derruba a busca', () => {
    expect(cursorDaResposta(null)).toBe(null)
    expect(cursorDaResposta('não é objeto')).toBe(null)
  })

  test('cursor no topo da resposta', () => {
    expect(cursorDaResposta({ cursor: 'ABC', data: [] })).toBe('ABC')
  })

  // A API já entrega as vagas dentro de `data` — e `vagasDaResposta` existe
  // porque ela varia entre `data: []` e `data: { jobs: [] }`. Um cursor
  // aninhado é plausível pelo mesmo motivo, e aceitar os dois lugares custa
  // uma linha; não aceitar custaria uma paginação que silenciosamente nunca
  // avança.
  test('cursor dentro de data', () => {
    expect(cursorDaResposta({ data: { cursor: 'DEF', jobs: [] } })).toBe('DEF')
  })

  test('o do topo vence o aninhado, se os dois vierem', () => {
    expect(cursorDaResposta({ cursor: 'TOPO', data: { cursor: 'DENTRO' } })).toBe(
      'TOPO',
    )
  })

  // Cursor vazio é o mesmo que não ter: se virasse string vazia, o botão
  // "Carregar mais" continuaria na tela pedindo uma página que não existe.
  test('cursor vazio conta como ausente', () => {
    expect(cursorDaResposta({ cursor: '' })).toBe(null)
    expect(cursorDaResposta({ cursor: 42 })).toBe(null)
  })
})
