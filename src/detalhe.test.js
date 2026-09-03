import { describe, expect, test } from 'vitest'
import { acharVaga } from './detalhe'

// A página de detalhe passou a abrir também da aba Vaga Inteligente, cuja
// lista (`vagasIa`) é separada do `banco` de propósito — repor o banco com ela
// vazaria os resultados de uma aba para a outra. Então a busca da vaga aberta
// olha as duas listas, e a ordem entre elas é a regra que um leitor futuro não
// adivinha sozinho: é para isso que estes testes existem.
describe('acharVaga', () => {
  const noBanco = { id: 'a1', cargo: 'Do banco', seen: true, fav: true }
  const naIa = { id: 'a1', cargo: 'Da IA', rank: 80 }

  test('acha no banco', () => {
    expect(acharVaga('a1', [noBanco], [])).toBe(noBanco)
  })

  test('acha na lista da Vaga Inteligente quando não está no banco', () => {
    expect(acharVaga('a1', [], [naIa])).toBe(naIa)
  })

  // A mesma vaga cai nas duas listas quando o aluno busca o mesmo cargo e a
  // mesma cidade nas duas abas. A cópia do banco carrega `seen`, `fav` e
  // `status`, que a da IA nunca teve; a da IA não tem nada que a do banco não
  // tenha. Por isso o banco vence — devolver a da IA perderia estado de tela.
  test('nas duas listas: a do banco vence, porque carrega seen/fav/status', () => {
    expect(acharVaga('a1', [noBanco], [naIa])).toBe(noBanco)
  })

  test('id que não existe em lugar nenhum devolve null', () => {
    expect(acharVaga('sumiu', [noBanco], [naIa])).toBe(null)
  })

  /**
   * A terceira lista, e a que motivou esta rodada: quando a aba Banco de Dados
   * passou a ler o acervo em vez do `banco`, abrir uma vaga de lá parou de
   * funcionar. A vaga existe — está na tela, na frente de quem clicou — mas
   * `acharVaga` só olhava `banco` e `vagasIa`, e o acervo não é nenhum dos
   * dois. O clique marcava como lida e não abria nada.
   *
   * É o mesmo modo de falha que o comentário do `App.jsx` já advertia sobre a
   * `vagasIa`: uma vaga aberta não pode virar página em branco.
   */
  const noAcervo = { id: 'a1', cargo: 'Do acervo', seen: true, fav: true, rank: 60 }

  test('acha no acervo: a aba Banco de Dados não lê o banco', () => {
    expect(acharVaga('a1', [], [], [noAcervo])).toBe(noAcervo)
  })

  // A busca corrente traz a versão mais nova da API — salário e dias podem ter
  // mudado desde que a vaga entrou no acervo.
  test('no banco e no acervo: o banco vence, é o dado mais recente', () => {
    expect(acharVaga('a1', [noBanco], [], [noAcervo])).toBe(noBanco)
  })

  // O acervo carrega `seen` e `fav`, que a cópia da IA nunca teve — mesma
  // razão pela qual o banco vence a IA.
  test('no acervo e na IA: o acervo vence, carrega seen e fav', () => {
    expect(acharVaga('a1', [], [naIa], [noAcervo])).toBe(noAcervo)
  })

  // `vagaAberta` é null sempre que não há página de detalhe no ar, que é a
  // maior parte do tempo — este é o caminho comum, não a exceção.
  test('sem id aberto devolve null, sem varrer lista nenhuma', () => {
    expect(acharVaga(null, [noBanco], [naIa])).toBe(null)
  })

  test('listas ausentes não derrubam a tela', () => {
    expect(acharVaga('a1')).toBe(null)
    expect(acharVaga('a1', [noBanco])).toBe(noBanco)
  })
})
