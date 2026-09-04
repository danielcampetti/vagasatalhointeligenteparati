/**
 * @vitest-environment node
 */

import { execFileSync } from 'node:child_process'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { CAMPOS_PATCH, abrirBanco, criarAcervo, criarCota } from './banco'

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

  /**
   * O `atualizar` é o **segundo** caminho de escrita, e ele atribuía os campos
   * como vieram. As quatro regras do `mesclar` valiam só no POST.
   *
   * O cenário não é hostil, é o normal: A roda a Avaliação IA e a vaga ganha
   * `rank: 87` no servidor; a aba de B carregou antes disso; B clica na vaga
   * para ler, o que liga `seen`, e o PATCH leva a cópia velha de B — `rank:
   * null`, `fav: false`. A nota paga e o favorito de A morriam nesse clique.
   *
   * Ver a §1 do desenho: "`rank` novo vence, mas ausente não apaga o antigo,
   * que custou uma chamada paga".
   */
  test('patch de aba velha não apaga a nota paga nem o favorito', () => {
    acervo.guardar([vaga('a', { rank: 87, fav: true })])
    acervo.atualizar('a', { fav: false, seen: true, rank: null })
    const v = acervo.buscarPorId('a')
    expect(v.rank).toBe(87)
    expect(v.fav).toBe(true)
    expect(v.seen).toBe(true)
  })

  test('nota nova ainda vence a antiga — reranquear precisa valer', () => {
    acervo.guardar([vaga('a', { rank: 87 })])
    expect(acervo.atualizar('a', { rank: 92 }).rank).toBe(92)
  })

  test('patch sem a marca não mexe na marca', () => {
    acervo.guardar([vaga('a', { fav: true })])
    acervo.atualizar('a', { seen: true })
    expect(acervo.buscarPorId('a').fav).toBe(true)
  })
})

/**
 * `CAMPOS_PATCH` restringe **quais** chaves entram; isto trava **o que** elas
 * podem valer. Sem login a rota é uma porta aberta, e `rank` volta em todo
 * `GET /api/acervo`: uma string de 50 mil caracteres repetida pelos ids infla a
 * lista para sempre. O estrago mora no volume — sobrevive a restart e a deploy
 * — e não há `DELETE` para desfazer (decisão 2 do dono do projeto).
 */
describe('o patch valida o valor, não só o nome do campo', () => {
  test('rank que não é número não é gravado', () => {
    acervo.guardar([vaga('a')])
    acervo.atualizar('a', { rank: 'x'.repeat(50000) })
    expect(acervo.listar()[0].rank).toBe(null)
  })

  test('rank infinito também não passa', () => {
    acervo.guardar([vaga('a')])
    acervo.atualizar('a', { rank: Number.POSITIVE_INFINITY })
    expect(acervo.listar()[0].rank).toBe(null)
  })

  test('fav e seen só guardam booleano', () => {
    acervo.guardar([vaga('a')])
    acervo.atualizar('a', { fav: { grande: 'x'.repeat(1000) }, seen: 'talvez' })
    const v = acervo.buscarPorId('a')
    expect(typeof v.fav).toBe('boolean')
    expect(typeof v.seen).toBe('boolean')
  })
})

describe('a descrição tem teto', () => {
  // 66% do peso de uma vaga é a descrição. Sem limite, um POST enche o volume
  // com um campo só — e o volume é o que não se apaga.
  test('descrição gigante entra cortada', () => {
    acervo.guardar([vaga('a', { descricao: 'x'.repeat(500000) })])
    expect(acervo.buscarPorId('a').descricao.length).toBeLessThanOrEqual(20000)
  })

  test('descrição de tamanho normal passa inteira', () => {
    acervo.guardar([vaga('a', { descricao: 'uma descrição comum' })])
    expect(acervo.buscarPorId('a').descricao).toBe('uma descrição comum')
  })
})

/**
 * `entrouEm` é o critério de descarte do teto, e vinha do cliente sem conferir.
 * Uma vaga com data do fim dos tempos ordena em primeiro para sempre e nunca é
 * aparada — um POST de 2000 delas despejava o acervo real inteiro, pela única
 * rota de escrita que existe.
 */
describe('entrouEm que o cliente manda passa por conferência', () => {
  test('a data do futuro não é guardada: vale a hora do servidor', () => {
    acervo.guardar([vaga('eterna', { entrouEm: '9999-12-31T00:00:00.000Z' })])
    expect(acervo.buscarPorId('eterna').entrouEm).not.toBe('9999-12-31T00:00:00.000Z')
  })

  /**
   * O relógio é fingido porque as três levas caem no mesmo milissegundo com o
   * relógio de verdade, e aí `ORDER BY entrouEm DESC` empata — o teste passaria
   * ou falharia pela ordem de inserção, que não é o que está sendo afirmado.
   * O que se afirma é a permanência: com a data do fim dos tempos, `eterna`
   * ordena em primeiro para **sempre** e nunca é aparada, por mais vagas
   * legítimas que cheguem depois.
   */
  test('data do futuro não segura a vaga acima do teto', () => {
    vi.useFakeTimers()
    try {
      const pequeno = criarAcervo(abrirBanco(':memory:'), { teto: 2 })

      vi.setSystemTime(new Date('2026-09-03T10:00:00.000Z'))
      pequeno.guardar([vaga('eterna', { entrouEm: '9999-12-31T00:00:00.000Z' })])
      vi.setSystemTime(new Date('2026-09-03T11:00:00.000Z'))
      pequeno.guardar([vaga('nova1')])
      vi.setSystemTime(new Date('2026-09-03T12:00:00.000Z'))
      pequeno.guardar([vaga('nova2')])

      expect(pequeno.listar().map((v) => v.id)).toEqual(['nova2', 'nova1'])
    } finally {
      vi.useRealTimers()
    }
  })

  test('data do passado continua valendo — a migração depende disso', () => {
    acervo.guardar([vaga('antiga', { entrouEm: '2026-01-01T00:00:00.000Z' })])
    expect(acervo.buscarPorId('antiga').entrouEm).toBe('2026-01-01T00:00:00.000Z')
  })

  test('entrouEm que não é data cai na hora do servidor, sem derrubar a leva', () => {
    acervo.guardar([vaga('a', { entrouEm: true }), vaga('b')])
    expect(acervo.listar()).toHaveLength(2)
    expect(Number.isFinite(Date.parse(acervo.buscarPorId('a').entrouEm))).toBe(true)
  })
})

/**
 * Cada `run` era a sua própria transação implícita: uma vaga que falhasse no
 * meio da leva deixava as anteriores gravadas e as seguintes de fora, calado.
 * O motivo do JSON em `dados` é que o `mapear.js` já mudou de forma e vai mudar
 * de novo — este é o risco que vem junto com essa liberdade.
 */
describe('guardar é uma leva só', () => {
  test('uma vaga impossível de serializar não deixa a leva pela metade', () => {
    const circular = { id: 'ruim', cargo: 'quebra' }
    circular.elaMesma = circular

    expect(() => acervo.guardar([vaga('ok1'), circular, vaga('ok2')])).toThrow()
    // Nem a que veio antes fica: ou entra a leva inteira, ou nenhuma.
    expect(acervo.listar()).toHaveLength(0)
  })

  test('depois de uma leva que falhou o acervo continua utilizável', () => {
    const circular = { id: 'ruim' }
    circular.elaMesma = circular
    expect(() => acervo.guardar([circular])).toThrow()

    acervo.guardar([vaga('a')])
    expect(acervo.listar().map((v) => v.id)).toEqual(['a'])
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
 * produção (`criarApp()`, que abre o `db` só por dentro do `oBanco()`
 * preguiçoso e não guarda outra referência) isso é 500 em todas as rotas até
 * o processo reiniciar. Reproduzido em 03/09/2026 com `node --expose-gc`.
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

  /**
   * O `fechar` sozinho não bastava como garantia: um export sem chamador em
   * produção é o que uma limpeza futura apaga "porque ninguém usa" — e apagá-lo
   * devolvia 500 em todas as rotas até o processo reiniciar. Um comentário não
   * é uma trava. O `db` no objeto devolvido é: para sumir, alguém precisa
   * apagar um campo que o teste nomeia.
   */
  test('o db está no objeto devolvido — a referência é estrutural, não um aviso', () => {
    const local = criarAcervo(abrirBanco(':memory:'))
    expect(typeof local.db?.prepare).toBe('function')
  })

  test('chamar fechar fecha o banco de verdade: operações depois lançam', () => {
    const local = criarAcervo(abrirBanco(':memory:'))
    local.guardar([vaga('a')])
    local.fechar()
    expect(() => local.listar()).toThrow()
  })
})

describe('criarCota', () => {
  let cota

  beforeEach(() => {
    cota = criarCota(abrirBanco(':memory:'))
  })

  test('banco novo começa em zero, e com um ciclo aberto', () => {
    const lida = cota.ler()
    expect(lida.rede).toBe(0)
    expect(lida.usos).toEqual([])
    expect(typeof lida.desde).toBe('string')
  })

  test('registrar incrementa o contador e guarda a linha', () => {
    const lida = cota.registrar({
      consulta: 'Técnico de TI em Caxias do Sul',
      janela: 'month',
      remotas: false,
      continuacao: false,
      status: 200,
    })

    expect(lida.rede).toBe(1)
    expect(lida.usos).toHaveLength(1)
    expect(lida.usos[0].consulta).toBe('Técnico de TI em Caxias do Sul')
    expect(lida.usos[0].status).toBe(200)
  })

  test('o histórico para no teto, e o contador não', () => {
    const pequena = criarCota(abrirBanco(':memory:'), { teto: 3 })
    for (let i = 0; i < 5; i++) {
      pequena.registrar({ consulta: `busca ${i}`, status: 200 }, `2026-09-04T00:0${i}:00.000Z`)
    }

    const lida = pequena.ler()
    expect(lida.usos).toHaveLength(3)
    // O ponto inteiro da separação: o corte da lista não pode encolher o número.
    expect(lida.rede).toBe(5)
  })

  test('zerar reinicia número, data e histórico', () => {
    cota.registrar({ consulta: 'algo', status: 200 })
    const lida = cota.zerar('2026-10-01T00:00:00.000Z')

    expect(lida.rede).toBe(0)
    expect(lida.usos).toEqual([])
    expect(lida.desde).toBe('2026-10-01T00:00:00.000Z')
  })

  test('ajustar muda o número e não toca o histórico', () => {
    cota.registrar({ consulta: 'algo', status: 200 })
    const lida = cota.ajustar(180)

    expect(lida.rede).toBe(180)
    expect(lida.usos).toHaveLength(1)
  })

  test('ajustar ignora o que não é contagem', () => {
    cota.registrar({ consulta: 'algo', status: 200 })
    expect(cota.ajustar('abacaxi').rede).toBe(1)
    expect(cota.ajustar(-3).rede).toBe(1)
  })

  /**
   * Sem uma referência viva ao DatabaseSync o GC o coleta, o node:sqlite
   * finaliza os statements, e toda operação passa a lançar. O `db` no objeto é
   * a trava — apagá-lo por parecer sem uso derruba a produção.
   */
  test('o db sai no objeto, e é ele que segura o banco vivo', () => {
    expect(cota.db).toBeDefined()
  })
})
