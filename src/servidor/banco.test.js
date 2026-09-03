/**
 * @vitest-environment node
 */

import { execFileSync } from 'node:child_process'
import { beforeEach, describe, expect, test } from 'vitest'
import { CAMPOS_PATCH, abrirBanco, criarAcervo } from './banco'

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

let acervo

beforeEach(() => {
  // `:memory:` dá um banco por teste, sem arquivo e sem limpeza.
  acervo = criarAcervo(abrirBanco(':memory:'))
})

describe('guardar', () => {
  test('a primeira busca entra inteira', () => {
    acervo.guardar([vaga('a'), vaga('b')])
    expect(acervo.listar()).toHaveLength(2)
  })

  test('a segunda busca acumula, não substitui', () => {
    acervo.guardar([vaga('a')])
    acervo.guardar([vaga('b')])
    expect(acervo.listar().map((v) => v.id).sort()).toEqual(['a', 'b'])
  })

  test('a mesma vaga em duas buscas não duplica', () => {
    acervo.guardar([vaga('a')])
    acervo.guardar([vaga('a')])
    expect(acervo.listar()).toHaveLength(1)
  })

  test('vaga sem id é recusada em vez de virar linha inalcançável', () => {
    acervo.guardar([vaga('a'), { cargo: 'sem id' }, { id: '', cargo: 'vazio' }])
    expect(acervo.listar()).toHaveLength(1)
  })

  test('lista vazia não quebra nem apaga o que já existe', () => {
    acervo.guardar([vaga('a')])
    acervo.guardar([])
    expect(acervo.listar()).toHaveLength(1)
  })

  test('devolve a lista atualizada, para o chamador não reconsultar', () => {
    expect(acervo.guardar([vaga('a')]).map((v) => v.id)).toEqual(['a'])
  })
})

// As mesmas regras do `vaga.test.js`, agora atravessando o SQLite. O que se
// testa aqui não é `mesclar` — é que o JSON gravado e relido não perde nada.
describe('mescla sobrevive à ida e volta do banco', () => {
  test('favorito e lida não desligam numa busca nova', () => {
    acervo.guardar([vaga('a', { fav: true, seen: true })])
    acervo.guardar([vaga('a', { fav: false, seen: false })])
    const [v] = acervo.listar()
    expect(v.fav).toBe(true)
    expect(v.seen).toBe(true)
  })

  test('a nota paga não se perde', () => {
    acervo.guardar([vaga('a', { rank: 87 })])
    acervo.guardar([vaga('a', { rank: null })])
    expect(acervo.listar()[0].rank).toBe(87)
  })

  test('descrição vazia não apaga a guardada', () => {
    acervo.guardar([vaga('a', { descricao: 'a inteira' })])
    acervo.guardar([vaga('a', { descricao: '' })])
    expect(acervo.buscarPorId('a').descricao).toBe('a inteira')
  })
})

describe('listar e buscarPorId', () => {
  // 66% do peso da vaga é a descrição, e a tabela da tela não a mostra.
  test('listar não devolve descricao', () => {
    acervo.guardar([vaga('a')])
    expect(acervo.listar()[0]).not.toHaveProperty('descricao')
    expect(acervo.listar()[0].cargo).toBe('Cargo a')
  })

  test('buscarPorId devolve a vaga inteira, com descricao', () => {
    acervo.guardar([vaga('a')])
    expect(acervo.buscarPorId('a').descricao).toBe('descricao de a')
  })

  test('id que não existe devolve null, não lança', () => {
    expect(acervo.buscarPorId('fantasma')).toBe(null)
  })

  test('a mais recente vem primeiro', () => {
    acervo.guardar([vaga('velha', { entrouEm: '2026-01-01T00:00:00.000Z' })])
    acervo.guardar([vaga('nova', { entrouEm: '2026-09-01T00:00:00.000Z' })])
    expect(acervo.listar().map((v) => v.id)).toEqual(['nova', 'velha'])
  })
})

describe('atualizar', () => {
  test('favoritar grava e persiste', () => {
    acervo.guardar([vaga('a')])
    acervo.atualizar('a', { fav: true })
    expect(acervo.listar()[0].fav).toBe(true)
  })

  test('devolve a vaga final', () => {
    acervo.guardar([vaga('a')])
    expect(acervo.atualizar('a', { seen: true }).seen).toBe(true)
  })

  test('id que não existe não inventa vaga', () => {
    expect(acervo.atualizar('fantasma', { fav: true })).toBe(null)
    expect(acervo.listar()).toHaveLength(0)
  })

  /**
   * Sem login, o PATCH é uma porta aberta. Ela aceita as três marcas e mais
   * nada: deixar passar `descricao` ou `link` daria a qualquer visitante o
   * poder de reescrever a vaga que outra pessoa pagou para trazer.
   */
  test('campo fora da lista é ignorado, não gravado', () => {
    acervo.guardar([vaga('a')])
    acervo.atualizar('a', { fav: true, cargo: 'INVADIDO', link: 'https://mau' })
    const v = acervo.buscarPorId('a')
    expect(v.fav).toBe(true)
    expect(v.cargo).toBe('Cargo a')
    expect(v.link).toBeUndefined()
  })

  test('a lista dos campos aceitos é a combinada', () => {
    expect(CAMPOS_PATCH).toEqual(['fav', 'seen', 'rank'])
  })

  test('id e entrouEm não podem ser reescritos pelo patch', () => {
    acervo.guardar([vaga('a', { entrouEm: '2026-01-01T00:00:00.000Z' })])
    acervo.atualizar('a', { id: 'outro', entrouEm: '2030-01-01T00:00:00.000Z' })
    const v = acervo.buscarPorId('a')
    expect(v.id).toBe('a')
    expect(v.entrouEm).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('teto', () => {
  const cheio = (n, base = 0) =>
    Array.from({ length: n }, (_, i) =>
      vaga(`v${base + i}`, {
        entrouEm: new Date(Date.UTC(2026, 0, 1) + (base + i) * 86400000).toISOString(),
      }),
    )

  test('para no teto', () => {
    const pequeno = criarAcervo(abrirBanco(':memory:'), { teto: 5 })
    pequeno.guardar(cheio(8))
    expect(pequeno.listar()).toHaveLength(5)
  })

  test('quem sai é a mais antiga por entrouEm', () => {
    const pequeno = criarAcervo(abrirBanco(':memory:'), { teto: 3 })
    pequeno.guardar(cheio(5))
    expect(pequeno.listar().map((v) => v.id)).toEqual(['v4', 'v3', 'v2'])
  })

  test('uma leva maior que o teto entra cortada, sem estourar', () => {
    const pequeno = criarAcervo(abrirBanco(':memory:'), { teto: 2 })
    expect(pequeno.guardar(cheio(10))).toHaveLength(2)
  })
})

/**
 * Roda um `node` à parte, com `--expose-gc` — o vitest não liga essa flag por
 * padrão, e um teste no mesmo processo que chamasse `global.gc()` sem ela
 * seria pulado em silêncio. Já fomos pegos duas vezes por teste que passa com
 * o defeito presente; este é o processo filho que evita ser a terceira.
 */
function construirEForcarGc() {
  const urlDoBanco = new URL('./banco.js', import.meta.url).href
  const script = `
import { abrirBanco, criarAcervo } from '${urlDoBanco}'

const acervo = criarAcervo(abrirBanco(':memory:'))
acervo.guardar([{ id: 'a', cargo: 'Cargo a' }])

global.gc()

try {
  acervo.listar()
  console.log('SOBREVIVEU')
} catch (err) {
  console.log('LANCOU:' + err.message)
}
`
  return execFileSync(
    process.execPath,
    ['--expose-gc', '--input-type=module', '-e', script],
    { encoding: 'utf8' },
  )
}

/**
 * O defeito achado ao verificar a Task 6 à mão: `criarAcervo(db, ...)`
 * devolvia um objeto que só referenciava os *prepared statements* — nunca o
 * `db` em si. Sem nenhuma referência viva ao `DatabaseSync`, o V8 é livre
 * para coletá-lo a qualquer momento, e o `node:sqlite` finaliza os statements
 * junto: toda operação seguinte lança "statement has been finalized". Em
 * produção (`criarApp({ acervo = criarAcervo(abrirBanco(BANCO_CAMINHO)) })`,
 * sem nenhuma variável segurando o `db`) isso é 500 em todas as rotas até o
 * processo reiniciar. Reproduzido em 03/09/2026 com `node --expose-gc`.
 *
 * `fechar` no objeto devolvido resolve isso sem ser um hack disfarçado de
 * comentário: o motivo de existir é fechar sobre `db`, e isso por si só —
 * nem precisa ser chamado — mantém o banco vivo enquanto o acervo existir.
 */
describe('fechar — o banco não pode depender de sorte com o GC', () => {
  test('mesmo sem chamar fechar, sua existência no objeto evita a coleta do db', () => {
    const saida = construirEForcarGc()
    expect(saida).toContain('SOBREVIVEU')
  })

  test('chamar fechar fecha o banco de verdade: operações depois lançam', () => {
    const local = criarAcervo(abrirBanco(':memory:'))
    local.guardar([vaga('a')])
    local.fechar()
    expect(() => local.listar()).toThrow()
  })
})
