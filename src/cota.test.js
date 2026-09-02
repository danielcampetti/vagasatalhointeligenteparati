import { beforeEach, describe, expect, test } from 'vitest'
import {
  PAGINA_LEGADA,
  consultarCache,
  limparCache,
  paginasDoCache,
  proximaPagina,
  registrarUso,
} from './cota'
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


/**
 * O cache guarda páginas, não uma lista solta.
 *
 * Defeito que motivou isto: `carregarMais` gravava a lista **acumulada** sob a
 * mesma chave da busca, e `buscar()` a restaurava inteira. Quem tinha clicado
 * "Carregar mais" três vezes numa sessão anterior clicava em Buscar e recebia
 * 27 vagas de uma vez — sem gastar cota, mas contra o que o botão promete, e
 * mandando as 27 para a Claude de uma vez.
 *
 * As páginas seguintes não são descartadas: elas já custaram uma requisição
 * cada, e jogá-las fora faria o próximo "Carregar mais" pagar de novo por algo
 * já baixado.
 */
describe('cache paginado', () => {
  const vagas = (n, base = 0) =>
    Array.from({ length: n }, (_, i) => ({ id: `v${base + i}` }))

  test('a busca grava a primeira página', () => {
    registrarUso('x', 'y', 'rede', { vagas: vagas(10), paginas: [10] })
    expect(paginasDoCache(consultarCache('x', 'y'))).toEqual([10])
  })

  test('carregar mais acrescenta o tamanho da página nova', () => {
    registrarUso('x', 'y', 'rede', { vagas: vagas(10), paginas: [10] })
    registrarUso('x', 'y', 'rede', { vagas: vagas(15), paginas: [10, 5] })
    expect(paginasDoCache(consultarCache('x', 'y'))).toEqual([10, 5])
  })

  // O caso do defeito: 15 guardadas, mas Buscar mostra 10.
  test('a primeira página é o que Buscar restaura, não a lista toda', () => {
    registrarUso('x', 'y', 'rede', { vagas: vagas(15), paginas: [10, 5] })
    const entrada = consultarCache('x', 'y')
    expect(entrada.vagas).toHaveLength(15) // o resto continua guardado
    expect(paginasDoCache(entrada)[0]).toBe(10)
  })

  test('o botão serve a próxima página do cache, sem rede', () => {
    registrarUso('x', 'y', 'rede', { vagas: vagas(15), paginas: [10, 5] })
    const entrada = consultarCache('x', 'y')
    const proxima = proximaPagina(entrada, 10)
    expect(proxima).toHaveLength(5)
    expect(proxima[0].id).toBe('v10')
  })

  // Cache esgotado: é aqui que a rede volta a ser necessária.
  test('sem página guardada além do que já está na tela, devolve null', () => {
    registrarUso('x', 'y', 'rede', { vagas: vagas(15), paginas: [10, 5] })
    expect(proximaPagina(consultarCache('x', 'y'), 15)).toBe(null)
  })

  // Uma tela com 12 vagas não bate com nenhuma fronteira de página guardada.
  // Servir uma fatia arbitrária dali daria vaga repetida ou vaga pulada.
  test('posição que não cai numa fronteira de página não serve nada', () => {
    registrarUso('x', 'y', 'rede', { vagas: vagas(15), paginas: [10, 5] })
    expect(proximaPagina(consultarCache('x', 'y'), 12)).toBe(null)
  })

  // Entradas gravadas antes deste formato não têm `paginas`. Sem um valor
  // aqui elas voltariam inteiras — que é exatamente o defeito.
  test('entrada legada é fatiada, e não devolvida inteira', () => {
    localStorage.setItem(
      'vagas:cota',
      JSON.stringify({
        desde: null,
        usos: [],
        cache: { 'x|y|month': { quando: 'z', vagas: vagas(27), cursor: null } },
      }),
    )
    const paginas = paginasDoCache(consultarCache('x', 'y', 'month'))
    expect(paginas[0]).toBe(PAGINA_LEGADA)
    expect(paginas.reduce((a, b) => a + b, 0)).toBe(27)
  })

  test('entrada ausente ou torta não quebra', () => {
    expect(paginasDoCache(null)).toEqual([])
    expect(proximaPagina(null, 0)).toBe(null)
  })
})
