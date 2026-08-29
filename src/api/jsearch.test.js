import { describe, expect, test } from 'vitest'
import { PARAMS_FIXOS, cursorDaResposta, montarUrl } from './jsearch'

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
