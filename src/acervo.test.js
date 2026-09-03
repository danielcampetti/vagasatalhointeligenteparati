import { beforeEach, describe, expect, test } from 'vitest'
import {
  TETO,
  atualizarNoAcervo,
  guardarVagas,
  lerAcervo,
  lerParaMigrar,
  limparAcervo,
  marcarMigrado,
  removerDoAcervo,
  semear,
} from './acervo'

beforeEach(() => localStorage.clear())

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
 * O acervo nasceu de um defeito concreto: a aba Banco de Dados não acumulava
 * nada. As duas abas liam o mesmo estado `banco`, e `buscar()` o **substituía**
 * — buscar em Porto Alegre depois de Caxias do Sul deixava só Porto Alegre na
 * tela. Reproduzido em 2026-09-03: busca 1 dava 10 linhas, busca 2 dava 10
 * linhas de novo, nunca 20.
 *
 * Por isso este módulo é um store à parte, e não uma leitura do `cota.cache`:
 * o cache é descartável e existe para poupar as 200 requisições do mês —
 * "Limpar cache" na aba Controle é uma ferramenta de espaço. O acervo é a
 * coleção de quem usa. Conflatar os dois faria liberar espaço apagar o
 * histórico.
 */
describe('guardarVagas', () => {
  test('a primeira busca entra inteira', () => {
    const { vagas } = guardarVagas([vaga('a'), vaga('b')])
    expect(vagas.map((v) => v.id)).toEqual(['a', 'b'])
  })

  // O defeito que este módulo existe para corrigir.
  test('a segunda busca acumula, não substitui', () => {
    guardarVagas([vaga('a'), vaga('b')])
    const { vagas } = guardarVagas([vaga('c')])
    expect(vagas.map((v) => v.id).sort()).toEqual(['a', 'b', 'c'])
  })

  test('sobrevive ao recarregar: o que foi guardado é lido de volta', () => {
    guardarVagas([vaga('a')])
    expect(lerAcervo().vagas.map((v) => v.id)).toEqual(['a'])
  })

  test('a mesma vaga em duas buscas não duplica', () => {
    guardarVagas([vaga('a')])
    const { vagas } = guardarVagas([vaga('a')])
    expect(vagas).toHaveLength(1)
  })

  // Vaga sem id não tem como ser desduplicada nem atualizada depois: entraria
  // como lixo que nenhuma operação alcança.
  test('vaga sem id é recusada em vez de virar lixo inalcançável', () => {
    const { vagas } = guardarVagas([vaga('a'), { cargo: 'sem id' }, {}])
    expect(vagas.map((v) => v.id)).toEqual(['a'])
  })

  test('lista vazia não quebra nem apaga o que já existe', () => {
    guardarVagas([vaga('a')])
    expect(guardarVagas([]).vagas).toHaveLength(1)
    expect(guardarVagas(null).vagas).toHaveLength(1)
  })
})

/**
 * A regra que impede a perda silenciosa: rebuscar uma consulta velha traz as
 * mesmas vagas com `fav: false` e `rank: null`, porque é assim que elas saem
 * do `mapear.js`. Sobrescrever cegamente apagaria o favorito que a pessoa
 * marcou e a nota que já custou uma chamada à Claude — sem erro nenhum na
 * tela, que é o pior jeito de perder dado.
 */
describe('mescla: o que é do usuário fica, o que é da API atualiza', () => {
  test('favorito e lida sobrevivem a uma busca nova', () => {
    guardarVagas([vaga('a', { fav: true, seen: true })])
    const { vagas } = guardarVagas([vaga('a', { fav: false, seen: false })])
    expect(vagas[0].fav).toBe(true)
    expect(vagas[0].seen).toBe(true)
  })

  test('a nota da IA sobrevive: ela custou uma chamada à Claude', () => {
    guardarVagas([vaga('a', { rank: 87 })])
    const { vagas } = guardarVagas([vaga('a', { rank: null })])
    expect(vagas[0].rank).toBe(87)
  })

  test('mas uma nota nova vence a antiga — reranquear tem que valer', () => {
    guardarVagas([vaga('a', { rank: 40 })])
    const { vagas } = guardarVagas([vaga('a', { rank: 90 })])
    expect(vagas[0].rank).toBe(90)
  })

  test('dados da API são atualizados: salário, dias e link vêm da versão nova', () => {
    guardarVagas([vaga('a', { max: 3, days: 30, link: 'https://velho' })])
    const { vagas } = guardarVagas([
      vaga('a', { max: 5, days: 2, link: 'https://novo' }),
    ])
    expect(vagas[0].max).toBe(5)
    expect(vagas[0].days).toBe(2)
    expect(vagas[0].link).toBe('https://novo')
  })

  // A descrição é o que o reranking manda para a Claude e o que a página de
  // detalhe mostra. Uma resposta que vem sem ela não pode zerar a que já
  // estava guardada.
  test('descrição vazia na versão nova não apaga a que já existia', () => {
    guardarVagas([vaga('a', { descricao: 'a descrição inteira' })])
    const { vagas } = guardarVagas([vaga('a', { descricao: '' })])
    expect(vagas[0].descricao).toBe('a descrição inteira')
  })
})

/**
 * O teto existe porque o `localStorage` tem ~5 MB e o `gravar` **engole** o
 * QuotaExceededError — o modo de falha sem teto seria o acervo parar de
 * crescer sem nenhum aviso na tela. Medido em 2026-09-03: 2,7 KB por vaga com
 * descrição, dos quais 66% é a descrição.
 */
describe('teto', () => {
  test('o teto é o combinado', () => {
    expect(TETO).toBe(500)
  })

  test('ao estourar, o acervo para no teto e a vaga nova entra', () => {
    const muitas = Array.from({ length: TETO }, (_, i) => vaga(`v${i}`))
    guardarVagas(muitas)
    const { vagas } = guardarVagas([vaga('nova')])

    expect(vagas).toHaveLength(TETO)
    expect(vagas.some((v) => v.id === 'nova')).toBe(true)
  })

  /**
   * O descarte é por lote, e é assim que "mais antiga" tem significado: as
   * vagas de uma mesma busca entram juntas e não têm idade relativa entre si.
   * O que precisa valer é que uma busca velha saia inteira antes de uma busca
   * nova perder qualquer coisa.
   */
  test('busca velha é descartada antes de busca nova', () => {
    const velhas = Array.from({ length: TETO - 2 }, (_, i) => vaga(`velha${i}`))
    guardarVagas(velhas)
    guardarVagas([vaga('meio1'), vaga('meio2')])
    const { vagas } = guardarVagas([vaga('recente1'), vaga('recente2')])

    expect(vagas).toHaveLength(TETO)
    const ids = new Set(vagas.map((v) => v.id))
    // As duas mais novas e as do lote do meio ficam; quem cede lugar são as
    // do lote mais antigo.
    expect(ids.has('recente1') && ids.has('recente2')).toBe(true)
    expect(ids.has('meio1') && ids.has('meio2')).toBe(true)
    expect(vagas.filter((v) => v.id.startsWith('velha'))).toHaveLength(TETO - 4)
  })

  test('uma leva maior que o teto entra cortada, sem estourar', () => {
    const demais = Array.from({ length: TETO + 30 }, (_, i) => vaga(`v${i}`))
    expect(guardarVagas(demais).vagas).toHaveLength(TETO)
  })
})

describe('atualizarNoAcervo e removerDoAcervo', () => {
  test('favoritar grava e persiste', () => {
    guardarVagas([vaga('a'), vaga('b')])
    atualizarNoAcervo('a', (v) => ({ ...v, fav: true }))
    const { vagas } = lerAcervo()
    expect(vagas.find((v) => v.id === 'a').fav).toBe(true)
    expect(vagas.find((v) => v.id === 'b').fav).toBe(false)
  })

  test('atualizar id que não existe não inventa vaga', () => {
    guardarVagas([vaga('a')])
    expect(atualizarNoAcervo('zzz', (v) => v).vagas).toHaveLength(1)
  })

  test('remover tira do acervo e a remoção persiste', () => {
    guardarVagas([vaga('a'), vaga('b')])
    removerDoAcervo('a')
    expect(lerAcervo().vagas.map((v) => v.id)).toEqual(['b'])
  })

  test('limparAcervo esvazia', () => {
    guardarVagas([vaga('a')])
    expect(limparAcervo().vagas).toEqual([])
    expect(lerAcervo().vagas).toEqual([])
  })
})

/**
 * A carga inicial. Quando o acervo entrou em cena havia 88 vagas paradas no
 * `cota.cache`, já baixadas e já pagas — estrear a aba vazia seria jogar fora
 * o que a cota do mês comprou.
 *
 * O que faz a semeadura ser segura é ela acontecer **uma vez só**. Sem essa
 * marca, quem apagasse uma vaga do acervo a veria voltar no recarregamento
 * seguinte, porque ela continua no cache — um "apagar" que não apaga.
 */
describe('semear', () => {
  test('a primeira semeadura traz o que o cache já tinha', () => {
    const { vagas } = semear([vaga('a'), vaga('b')])
    expect(vagas.map((v) => v.id).sort()).toEqual(['a', 'b'])
  })

  test('semear de novo não faz nada: vaga apagada não pode ressuscitar', () => {
    semear([vaga('a'), vaga('b')])
    removerDoAcervo('a')
    const { vagas } = semear([vaga('a'), vaga('b')])
    expect(vagas.map((v) => v.id)).toEqual(['b'])
  })

  test('a marca de semeado sobrevive ao recarregar', () => {
    semear([vaga('a')])
    expect(lerAcervo().semeado).toBe(true)
  })

  // Cache vazio ainda conta como semeado: senão a semeadura ficaria armada
  // para disparar mais tarde, quando o acervo já tivesse vida própria.
  test('semear com nada marca como semeado assim mesmo', () => {
    semear([])
    expect(lerAcervo().semeado).toBe(true)
  })
})

/**
 * Toda leitura e escrita é defensiva pelo mesmo motivo do `cota.js`: em aba
 * anônima, com storage bloqueado ou com o valor corrompido por uma versão
 * anterior, o acesso lança. A tela não pode quebrar por causa do acervo.
 */
describe('defesas', () => {
  test('valor corrompido lê como acervo vazio, sem lançar', () => {
    localStorage.setItem('vagas:acervo', 'isto não é json {{{')
    expect(lerAcervo().vagas).toEqual([])
  })

  test('formato de uma versão anterior não derruba a leitura', () => {
    localStorage.setItem('vagas:acervo', JSON.stringify({ vagas: 'não é array' }))
    expect(lerAcervo().vagas).toEqual([])
  })

  test('storage que recusa escrita não lança — o acervo só vira volátil', () => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = () => {
      throw new Error('QuotaExceededError')
    }
    try {
      expect(() => guardarVagas([vaga('a')])).not.toThrow()
      // A verdade em memória continua correta mesmo sem ter sido gravada.
      expect(guardarVagas([vaga('a')]).vagas.map((v) => v.id)).toEqual(['a'])
    } finally {
      Storage.prototype.setItem = original
    }
  })
})

/**
 * A migração sobe o acervo que já está no `localStorage` para o servidor, uma
 * vez só.
 *
 * A marca é a parte que importa, e o precedente é o próprio `semeado`: sem
 * ela, o local voltaria a subir a cada carga, e qualquer coisa que o servidor
 * fizesse com aquelas vagas seria desfeita na sessão seguinte.
 */
describe('migração para o servidor', () => {
  test('a primeira leitura entrega o que estava guardado', () => {
    guardarVagas([vaga('a'), vaga('b')])
    expect(lerParaMigrar()).toHaveLength(2)
  })

  test('depois de marcada, não entrega mais nada', () => {
    guardarVagas([vaga('a')])
    marcarMigrado()
    expect(lerParaMigrar()).toEqual([])
  })

  test('a marca sobrevive ao recarregar', () => {
    guardarVagas([vaga('a')])
    marcarMigrado()
    expect(lerAcervo().migrado).toBe(true)
  })

  // Sem acervo local não há o que migrar, mas a marca tem que ser posta assim
  // mesmo — senão a migração fica armada para disparar mais tarde, despejando
  // um acervo velho dentro de um servidor que já tem vida própria.
  test('acervo vazio marca assim mesmo', () => {
    expect(lerParaMigrar()).toEqual([])
    marcarMigrado()
    expect(lerAcervo().migrado).toBe(true)
  })

  /**
   * O local não é apagado, só marcado. Se a migração der errado do outro lado,
   * o dado ainda está aqui para ser reenviado à mão.
   */
  test('marcar não apaga o acervo local', () => {
    guardarVagas([vaga('a')])
    marcarMigrado()
    expect(lerAcervo().vagas).toHaveLength(1)
  })
})
