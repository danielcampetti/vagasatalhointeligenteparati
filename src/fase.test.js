import { describe, expect, test } from 'vitest'
import { faseDaBusca } from './fase'

// A tabela só aparece quando a busca E o ranking terminaram, para que vaga e
// nota cheguem juntas à tela. Isso alonga a espera de ~2s para ~25s, e uma
// espera longa sem explicação lê como travamento — por isso a fase tem nome,
// e o nome muda no meio do caminho. É esse texto que estes testes prendem.
describe('faseDaBusca', () => {
  test('parada: sem nada no ar, a tabela aparece', () => {
    expect(faseDaBusca({ buscando: false, ranqueando: false })).toBe(null)
  })

  // Texto preservado do que a aba Vagas já mostrava antes desta mudança: só a
  // segunda fase é nova, e trocar a cópia da primeira não fazia parte do
  // pedido.
  test('buscando: nomeia a consulta à API de vagas', () => {
    const fase = faseDaBusca({ buscando: true, ranqueando: false })
    expect(fase.texto).toBe('Consultando a API de vagas...')
  })

  test('ranqueando: nomeia a etapa da IA e diz quantas vagas', () => {
    const fase = faseDaBusca({ buscando: false, ranqueando: true, quantas: 10 })
    expect(fase.texto).toBe('Avaliando 10 vagas com a IA...')
  })

  // A segunda etapa é a cara — quem espera precisa saber que a lista não vem
  // antes da nota, senão a demora parece defeito.
  test('ranqueando: avisa que a lista vem junto com a nota', () => {
    const fase = faseDaBusca({ buscando: false, ranqueando: true, quantas: 10 })
    expect(fase.detalhe).toMatch(/junto com a nota/)
  })

  test('uma vaga só: singular', () => {
    const fase = faseDaBusca({ buscando: false, ranqueando: true, quantas: 1 })
    expect(fase.texto).toBe('Avaliando 1 vaga com a IA...')
  })

  // Ranquear sem saber quantas não deveria acontecer (quem chama tem a lista
  // na mão), mas um "Avaliando undefined vagas" na tela seria pior que a
  // frase genérica.
  test('sem a contagem: cai para o texto sem número, não para "undefined"', () => {
    const fase = faseDaBusca({ buscando: false, ranqueando: true })
    expect(fase.texto).toBe('Avaliando as vagas com a IA...')
  })

  // As duas juntas não acontecem no fluxo de hoje — `ranquearBanco` só roda
  // depois do `finally` que desliga `buscando`. Fixado mesmo assim porque a
  // ordem importa: buscar é a etapa anterior, e anunciar a IA antes da hora
  // seria mentira na tela.
  test('as duas ligadas: a busca vence, por ser a etapa anterior', () => {
    const fase = faseDaBusca({ buscando: true, ranqueando: true, quantas: 10 })
    expect(fase.texto).toBe('Consultando a API de vagas...')
  })
})
