import { describe, expect, test } from 'vitest'
import { MARCAS, agora, marcasMudadas, mesclar, sanearMarcas, temId } from './vaga'

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

/**
 * As marcas são o único pedaço da vaga que a tela escreve, e por isso o único
 * que atravessa a rede vindo de fora. `MARCAS` diz quais são; `sanearMarcas`
 * diz o que cada uma pode valer.
 *
 * A distinção custou um defeito: a rota de PATCH filtrava o **nome** do campo e
 * nunca o **valor**, então `rank` aceitava uma string de 50 mil caracteres — e
 * `rank` volta em toda listagem, num banco onde nada é apagado.
 */
describe('sanearMarcas', () => {
  test('as três marcas, e só elas', () => {
    expect(MARCAS).toEqual(['fav', 'seen', 'rank'])
  })

  test('deixa passar o que já está certo', () => {
    expect(sanearMarcas({ fav: true, seen: false, rank: 87 })).toEqual({
      fav: true,
      seen: false,
      rank: 87,
    })
  })

  test('rank que não é número finito vira null', () => {
    expect(sanearMarcas({ rank: 'x'.repeat(50000) }).rank).toBe(null)
    expect(sanearMarcas({ rank: {} }).rank).toBe(null)
    expect(sanearMarcas({ rank: Number.NaN }).rank).toBe(null)
    expect(sanearMarcas({ rank: Number.POSITIVE_INFINITY }).rank).toBe(null)
  })

  test('fav e seen saem booleanos, venha o que vier', () => {
    const limpo = sanearMarcas({ fav: { grande: 'x' }, seen: 'talvez' })
    expect(limpo.fav).toBe(true)
    expect(limpo.seen).toBe(true)
  })

  test('campo que não é marca não entra', () => {
    expect(sanearMarcas({ cargo: 'INVADIDO', link: 'https://mau' })).toEqual({})
  })

  /**
   * Marca ausente tem que continuar ausente: é a ausência que o `mesclar` lê
   * como "não mexe nisso". Trocá-la por `undefined` explícito faria um patch
   * parcial apagar o resto.
   */
  test('marca ausente continua ausente, não vira undefined', () => {
    expect('rank' in sanearMarcas({ fav: true })).toBe(false)
  })
})

/**
 * Mandar as três marcas sempre é como a nota paga de outra pessoa morria: a
 * aba que carregou antes da Avaliação IA tem `rank: null` na sua cópia, e um
 * PATCH com as três leva esse `null` junto com o `seen` que o clique ligou.
 */
describe('marcasMudadas', () => {
  test('só o que mudou vai', () => {
    const antes = vaga('a', { fav: false, seen: false, rank: 87 })
    expect(marcasMudadas(antes, { ...antes, seen: true })).toEqual({ seen: true })
  })

  test('a nota que a aba não conhece não é reenviada como null', () => {
    // A cópia local tem `rank: null` porque carregou antes da avaliação, e o
    // clique só liga `seen`. O que sai não pode levar esse null junto.
    const local = vaga('a', { rank: null })
    const mudado = marcasMudadas(local, { ...local, seen: true })
    expect(mudado).toEqual({ seen: true })
    expect('rank' in mudado).toBe(false)
  })

  test('nada mudou, nada vai', () => {
    const antes = vaga('a')
    expect(marcasMudadas(antes, { ...antes })).toEqual({})
  })

  test('a nota nova de verdade vai', () => {
    const antes = vaga('a', { rank: null })
    expect(marcasMudadas(antes, { ...antes, rank: 92 })).toEqual({ rank: 92 })
  })
})
