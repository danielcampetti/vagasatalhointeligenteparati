import { beforeEach, describe, expect, test } from 'vitest'
import { consultarCache, limparCache, registrarUso } from './cota'
import { JANELA_PADRAO } from './janela'

beforeEach(() => localStorage.clear())

const VAGAS = [{ id: 'a1', cargo: 'Técnico de TI' }]

// Primeiro teste deste módulo, escrito junto com o "Carregar mais". O cache
// guardava só as vagas; agora precisa guardar também o cursor da próxima
// página, senão repetir a busca devolve o que já foi carregado mas perde o
// ponto de continuação — e o botão de carregar mais some sem motivo.
describe('cache com cursor', () => {
  test('busca de rede guarda vagas e cursor juntos', () => {
    registrarUso('Técnico de TI', 'Caxias do Sul, RS', 'rede', {
      vagas: VAGAS,
      cursor: 'CURSOR1',
    })

    const entrada = consultarCache('Técnico de TI', 'Caxias do Sul, RS')
    expect(entrada.vagas).toEqual(VAGAS)
    expect(entrada.cursor).toBe('CURSOR1')
  })

  // Última página: sem cursor. Guardar `null` explicitamente é o que permite
  // a tela distinguir "acabou" de "ainda não busquei".
  test('sem cursor, a entrada registra null — é assim que a última página se declara', () => {
    registrarUso('x', 'y', 'rede', { vagas: VAGAS })
    expect(consultarCache('x', 'y').cursor).toBe(null)
  })

  test('carregar mais atualiza a entrada: lista acumulada e cursor novo', () => {
    registrarUso('x', 'y', 'rede', { vagas: VAGAS, cursor: 'C1' })
    const acumulado = [...VAGAS, { id: 'a2', cargo: 'Analista' }]
    registrarUso('x', 'y', 'rede', { vagas: acumulado, cursor: 'C2' })

    const entrada = consultarCache('x', 'y')
    expect(entrada.vagas).toHaveLength(2)
    expect(entrada.cursor).toBe('C2')
  })

  // Uma busca servida do cache não tem vagas novas nem cursor novo para
  // gravar; ela só entra no histórico. Se apagasse a entrada, a repetição
  // passaria a custar cota — o oposto do que o cache existe para fazer.
  test('busca servida do cache não apaga o que já estava guardado', () => {
    registrarUso('x', 'y', 'rede', { vagas: VAGAS, cursor: 'C1' })
    registrarUso('x', 'y', 'cache')

    const entrada = consultarCache('x', 'y')
    expect(entrada.vagas).toEqual(VAGAS)
    expect(entrada.cursor).toBe('C1')
  })

  test('limparCache leva o cursor junto', () => {
    registrarUso('x', 'y', 'rede', { vagas: VAGAS, cursor: 'C1' })
    limparCache()
    expect(consultarCache('x', 'y')).toBe(null)
  })
})

/**
 * A janela de publicação entrou na busca e precisa entrar na chave junto.
 * Sem isso, escolher "Hoje" depois de ter buscado em "Qualquer data" seria
 * servido pelo cache da consulta larga: o dropdown mudaria, a lista não, e
 * pareceria um filtro quebrado quando na verdade era o cache respondendo
 * pela pergunta errada.
 */
describe('cache por janela de publicação', () => {
  test('cada janela guarda sua própria lista', () => {
    const doMes = [{ id: 'm1' }]
    const daSemana = [{ id: 's1' }]
    registrarUso('x', 'y', 'rede', { vagas: doMes, janela: 'month' })
    registrarUso('x', 'y', 'rede', { vagas: daSemana, janela: 'week' })

    expect(consultarCache('x', 'y', 'month').vagas).toEqual(doMes)
    expect(consultarCache('x', 'y', 'week').vagas).toEqual(daSemana)
  })

  // O caso que geraria o bug: guardado em uma janela, pedido em outra.
  test('o cache de uma janela não responde pela outra', () => {
    registrarUso('x', 'y', 'rede', { vagas: VAGAS, janela: 'all' })
    expect(consultarCache('x', 'y', 'today')).toBe(null)
  })

  test('sem janela explícita, guardar e consultar caem na mesma chave padrão', () => {
    registrarUso('x', 'y', 'rede', { vagas: VAGAS })
    expect(consultarCache('x', 'y', JANELA_PADRAO).vagas).toEqual(VAGAS)
  })
})
