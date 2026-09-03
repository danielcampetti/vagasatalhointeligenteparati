import { beforeEach, describe, expect, test } from 'vitest'
import {
  PAGINA_LEGADA,
  TETO_HISTORICO,
  ajustarContagem,
  consultarCache,
  lerCota,
  limparCache,
  paginasDoCache,
  proximaPagina,
  registrarUso,
  servidasDoCache,
  usadas,
  zerarContagem,
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
 * A modalidade entra na chave pela metade — de propósito, e a metade é da API.
 *
 * Só 'remoto' vira `work_from_home=true` na requisição; 'presencial' é a
 * ausência do parâmetro, e todo o trabalho dele é corte local (ver
 * `modalidade.js`). Logo o que separa as entradas é o booleano — que aqui
 * coincide com a opção, porque são duas.
 *
 * O ganho é direto na cota, e vem da forma da chave: "Presencial" não põe
 * sufixo nenhum, então cai exatamente na chave que a busca sem modalidade
 * sempre teve. As entradas gravadas antes desta funcionalidade existir
 * continuam sendo achadas — do contrário o primeiro deploy jogaria fora, em
 * silêncio, requisições que já foram pagas.
 */
/**
 * "Último mês" e "Últimos 15 dias" fazem a **mesma** requisição — as duas
 * mandam `date_posted=month`, porque a API não tem uma janela de 15 dias e os
 * 15 dias saem do corte local.
 *
 * A chave existe para distinguir requisições, então é o valor da API que entra
 * nela. Sem isso, alternar entre as duas gastaria uma das 200 do mês para
 * rebaixar vagas que já estão na tela.
 *
 * E como `api === valor` nas cinco janelas que existiam antes, as chaves já
 * gravadas continuam sendo achadas — a mesma propriedade que salvou o cache
 * quando a modalidade entrou.
 */
describe('cache por janela: o que entra na chave é o que a API foi perguntada', () => {
  test('15 dias e último mês dividem a entrada — alternar não gasta cota', () => {
    registrarUso('x', 'y', 'rede', { vagas: VAGAS, janela: 'month' })
    expect(consultarCache('x', 'y', '15dias').vagas).toEqual(VAGAS)
  })

  test('e o contrário também: gravado em 15 dias, achado em mês', () => {
    registrarUso('x', 'y', 'rede', { vagas: VAGAS, janela: '15dias' })
    expect(consultarCache('x', 'y', 'month').vagas).toEqual(VAGAS)
  })

  // A garantia de que a mudança não órfã o cache existente.
  test('chave gravada antes desta mudança continua sendo achada', () => {
    registrarUso('x', 'y', 'rede', { vagas: VAGAS, janela: 'week' })
    expect(consultarCache('x', 'y', 'week').vagas).toEqual(VAGAS)
  })

  // Semana e mês continuam sendo requisições diferentes, e continuam separadas.
  test('janelas que a API distingue seguem em entradas distintas', () => {
    registrarUso('x', 'y', 'rede', { vagas: VAGAS, janela: 'week' })
    expect(consultarCache('x', 'y', 'today')).toBe(null)
  })
})

describe('cache por modalidade', () => {
  test('remoto guarda sua própria lista: a requisição foi outra', () => {
    const doGeral = [{ id: 'g1' }]
    const remotas = [{ id: 'r1' }]
    registrarUso('x', 'y', 'rede', { vagas: doGeral, modalidade: 'presencial' })
    registrarUso('x', 'y', 'rede', { vagas: remotas, modalidade: 'remoto' })

    expect(
      consultarCache('x', 'y', JANELA_PADRAO, 'presencial').vagas,
    ).toEqual(doGeral)
    expect(consultarCache('x', 'y', JANELA_PADRAO, 'remoto').vagas).toEqual(remotas)
  })

  // O caso que geraria o bug: buscar em "Remoto" e receber a lista presencial.
  test('o cache do presencial não responde por "Remoto"', () => {
    registrarUso('x', 'y', 'rede', { vagas: VAGAS, modalidade: 'presencial' })
    expect(consultarCache('x', 'y', JANELA_PADRAO, 'remoto')).toBe(null)
  })

  test('sem modalidade explícita, guardar e consultar caem na mesma chave', () => {
    registrarUso('x', 'y', 'rede', { vagas: VAGAS })
    expect(consultarCache('x', 'y', JANELA_PADRAO, 'presencial').vagas).toEqual(
      VAGAS,
    )
  })

  /**
   * A retrocompatibilidade que a chave sem sufixo compra, testada pelos dois
   * lados: uma entrada gravada por uma versão que não conhecia modalidade
   * (sem o campo) é achada por "Presencial", e o inverso também vale.
   */
  test('entrada gravada antes da modalidade existir é achada por "Presencial"', () => {
    registrarUso('x', 'y', 'rede', { vagas: VAGAS, janela: 'month' })
    expect(consultarCache('x', 'y', 'month', 'presencial').vagas).toEqual(VAGAS)
  })

  /**
   * 'todas' e 'hibrido' foram opções de uma versão anterior e podem estar no
   * localStorage de alguém. Caem na chave sem sufixo — a mesma de
   * "Presencial" —, que é onde o resultado delas de fato está.
   */
  test('opção morta de uma versão anterior acha a chave sem sufixo', () => {
    registrarUso('x', 'y', 'rede', { vagas: VAGAS, modalidade: 'presencial' })
    for (const morto of ['todas', 'hibrido', 'teletrabalho']) {
      expect(
        consultarCache('x', 'y', JANELA_PADRAO, morto).vagas,
      ).toEqual(VAGAS)
    }
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

/**
 * O defeito que este bloco tranca foi visto em produção: o painel Controle
 * mostrava **3 / 200** quando a conta na OpenWeb Ninja já tinha gasto 50.
 *
 * A contagem saía de `usos`, que é o histórico da tela — e o histórico é
 * cortado nas últimas entradas. Como busca servida do cache entra na mesma
 * lista que busca de rede, cada repetição empurrava uma requisição paga para
 * fora do corte. O número não só errava: **encolhia sozinho**, e encolhia
 * justamente quando o app fazia a coisa certa (servir do cache).
 *
 * A correção separa as duas coisas que estavam na mesma lista: `usos`
 * continua sendo a tela, com teto; `totais` é a contagem, e não tem teto.
 */
describe('a contagem não sai do histórico cortado', () => {
  const encher = (origem, quantas, prefixo = 't') => {
    for (let i = 0; i < quantas; i++) {
      registrarUso(`${prefixo}${i}`, 'Caxias do Sul, RS', origem, {
        vagas: origem === 'rede' ? VAGAS : null,
      })
    }
  }

  // O caso exato de produção: 50 pagas, depois repetições que couberam no
  // cache. Antes desta correção o painel dizia 3.
  test('50 de rede seguidas de repetições do cache continuam contando 50', () => {
    encher('rede', 50)
    encher('cache', 47, 'r')

    expect(usadas(lerCota())).toBe(50)
  })

  test('o histórico para no teto, a contagem passa dele', () => {
    encher('rede', 60)

    const cota = lerCota()
    expect(cota.usos).toHaveLength(TETO_HISTORICO)
    expect(usadas(cota)).toBe(60)
  })

  test('o mesmo vale para as buscas servidas do cache', () => {
    encher('rede', 1)
    encher('cache', 70, 'r')

    expect(servidasDoCache(lerCota())).toBe(70)
  })

  // Consulta vazia não é requisição, e continua não sendo contada.
  test('consulta sem cargo e sem cidade não entra na contagem', () => {
    registrarUso('  ', '  ', 'rede', { vagas: VAGAS })
    expect(usadas(lerCota())).toBe(0)
  })

  test('zerar a contagem zera os totais, não só o histórico', () => {
    encher('rede', 60)
    zerarContagem()

    const cota = lerCota()
    expect(usadas(cota)).toBe(0)
    expect(servidasDoCache(cota)).toBe(0)
    expect(cota.usos).toEqual([])
  })

  // Quem já tinha cota gravada antes dos totais existirem não pode voltar a
  // zero no primeiro deploy. O histórico subconta — é o defeito inteiro —,
  // mas continuar de onde ele parou é melhor que jogar fora o que ele sabe.
  test('cota gravada antes dos totais deriva a contagem do histórico', () => {
    localStorage.setItem(
      'vagas:cota',
      JSON.stringify({
        desde: '2026-08-26T12:00:00.000Z',
        cache: {},
        usos: [
          { chave: 'a|b|month', origem: 'rede', quando: 'z' },
          { chave: 'a|b|month', origem: 'rede', quando: 'z' },
          { chave: 'a|b|month', origem: 'cache', quando: 'z' },
        ],
      }),
    )

    const cota = lerCota()
    expect(usadas(cota)).toBe(2)
    expect(servidasDoCache(cota)).toBe(1)
  })

  test('totais adulterados caem no histórico em vez de derrubar a tela', () => {
    localStorage.setItem(
      'vagas:cota',
      JSON.stringify({
        desde: null,
        cache: {},
        usos: [{ chave: 'a|b|month', origem: 'rede', quando: 'z' }],
        totais: { rede: -7, cache: 'muitas' },
      }),
    )

    const cota = lerCota()
    expect(usadas(cota)).toBe(1)
    expect(servidasDoCache(cota)).toBe(0)
  })
})

/**
 * `ajustarContagem` existe porque o número verdadeiro não mora aqui.
 *
 * A cota é da **conta** na OpenWeb Ninja; este contador é do **navegador**.
 * Abrir o app publicado num celular, ou trocar de máquina, começa a contar do
 * zero enquanto o provedor continua debitando das mesmas 200 — e não há como
 * o app descobrir sozinho o que foi gasto de outro lugar. O painel do
 * provedor sabe; este botão é como esse número entra.
 */
describe('ajustar a contagem para o número do provedor', () => {
  test('põe a contagem no valor informado', () => {
    registrarUso('x', 'y', 'rede', { vagas: VAGAS })
    ajustarContagem(50)

    expect(usadas(lerCota())).toBe(50)
  })

  test('ajustar não descarta o cache — as repetições seguem de graça', () => {
    registrarUso('x', 'y', 'rede', { vagas: VAGAS, cursor: 'C1' })
    ajustarContagem(50)

    expect(consultarCache('x', 'y').cursor).toBe('C1')
  })

  test('a contagem ajustada continua subindo com as buscas seguintes', () => {
    ajustarContagem(50)
    registrarUso('x', 'y', 'rede', { vagas: VAGAS })

    expect(usadas(lerCota())).toBe(51)
  })

  test('valor negativo ou sem sentido não vira contagem', () => {
    ajustarContagem(7)
    ajustarContagem(-3)
    ajustarContagem('cinquenta')

    expect(usadas(lerCota())).toBe(7)
  })
})
