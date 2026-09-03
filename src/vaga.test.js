import { describe, expect, test } from 'vitest'
import { agora, mesclar, temId } from './vaga'

const vaga = (id, extra = {}) => ({
  id,
  cargo: `Cargo ${id}`,
  modalidade: 'Presencial',
  rank: null,
  fav: false,
  seen: false,
  descricao: `descricao de ${id}`,
  ...extra,
})

/**
 * Estas quatro regras custaram bug para serem descobertas, e são a razão de
 * `mesclar` não virar um `ON CONFLICT DO UPDATE` em SQL: traduzi-las para
 * outra linguagem seria redescobri-las.
 */
describe('mesclar: o que é de quem usa fica, o que é da API atualiza', () => {
  test('favorito e lida, uma vez ligados, não desligam numa busca nova', () => {
    const r = mesclar(vaga('a', { fav: true, seen: true }), vaga('a'))
    expect(r.fav).toBe(true)
    expect(r.seen).toBe(true)
  })

  test('a nota da IA sobrevive: ela custou uma chamada à Claude', () => {
    expect(mesclar(vaga('a', { rank: 87 }), vaga('a', { rank: null })).rank).toBe(87)
  })

  test('mas nota nova vence a antiga — reranquear tem que valer alguma coisa', () => {
    expect(mesclar(vaga('a', { rank: 40 }), vaga('a', { rank: 90 })).rank).toBe(90)
  })

  test('descrição vazia na nova não apaga a que já existia', () => {
    const r = mesclar(vaga('a', { descricao: 'a inteira' }), vaga('a', { descricao: '' }))
    expect(r.descricao).toBe('a inteira')
  })

  test('dados da API vêm da versão nova', () => {
    const r = mesclar(vaga('a', { max: 3, link: 'https://velho' }), vaga('a', { max: 5, link: 'https://novo' }))
    expect(r.max).toBe(5)
    expect(r.link).toBe('https://novo')
  })

  // `entrouEm` é o critério de descarte do teto. Se ele andasse a cada busca,
  // uma vaga vista com frequência nunca sairia e o teto viraria loteria.
  test('entrouEm é quando entrou, não quando foi vista de novo', () => {
    const r = mesclar(vaga('a', { entrouEm: '2026-01-01T00:00:00.000Z' }), vaga('a', { entrouEm: '2026-09-09T00:00:00.000Z' }))
    expect(r.entrouEm).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('temId', () => {
  test('aceita id não-vazio', () => {
    expect(temId({ id: 'a1' })).toBe(true)
  })

  // Vaga sem id não teria como ser desduplicada nem atualizada depois —
  // entraria no acervo como lixo que nenhuma operação alcança.
  test.each([[undefined], [null], ['']])('recusa id %p', (id) => {
    expect(temId({ id })).toBe(false)
  })

  test('recusa vaga ausente sem lançar', () => {
    expect(temId(null)).toBe(false)
    expect(temId(undefined)).toBe(false)
  })
})

describe('agora', () => {
  test('devolve ISO 8601', () => {
    expect(agora()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })
})
