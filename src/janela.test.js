import { describe, expect, test } from 'vitest'
import {
  JANELAS,
  JANELA_PADRAO,
  cabeNoQueJaTemos,
  filtrarPorJanela,
} from './janela'

/**
 * Estes testes nasceram de sete requisições reais à JSearch, feitas em
 * 2026-09-02 com a mesma consulta ("Técnico de TI em Caxias do Sul, RS",
 * country=br, language=pt) variando só o `date_posted`:
 *
 *   (ausente) 10 vagas — 9, 20, 21, 22, 26 dias + 5 SEM DATA
 *   all       10 vagas — idem
 *   today      0 vagas
 *   3days      0 vagas
 *   week      10 vagas — 9, 21, 22, 26 dias + 5 SEM DATA
 *   month     10 vagas — 9 a 27 dias, NENHUMA sem data
 *
 * Duas conclusões viraram teste aqui:
 *
 *   1. `week` não é honrado. A janela mais estreita deixou passar mais lixo
 *      que a mais larga — logo o `date_posted` não pode ser o único portão.
 *      Este módulo é o segundo.
 *   2. As vagas "encerradas" que incomodam são as que voltam sem data
 *      nenhuma, de agregadores que copiam anúncio e nunca o tiram do ar. A
 *      API não tem campo de expiração — conferido, são 35 campos e nenhum é
 *      de validade —, então idade desconhecida é o proxy que existe.
 */

const vaga = (id, days) => ({ id, days })

describe('filtrarPorJanela', () => {
  // 'Qualquer data' é o comportamento antigo, e continua disponível: quem
  // pede explicitamente para ver tudo tem que ver tudo, zumbi incluído.
  test('qualquer data deixa passar tudo, inclusive vaga sem data', () => {
    const vagas = [vaga('a', 3), vaga('b', 400), vaga('c', null)]
    const { visiveis, ocultadas } = filtrarPorJanela(vagas, 'all')
    expect(visiveis).toHaveLength(3)
    expect(ocultadas).toBe(0)
  })

  test('último mês corta a vaga mais velha que a janela', () => {
    const { visiveis } = filtrarPorJanela([vaga('a', 12), vaga('b', 45)], 'month')
    expect(visiveis.map((v) => v.id)).toEqual(['a'])
  })

  // O coração da correção. Metade do retorno padrão da API vinha assim, e é
  // exatamente essa metade que estava mostrando vaga encerrada.
  test('vaga sem data não cabe em janela nenhuma que não seja "qualquer data"', () => {
    const { visiveis, ocultadas } = filtrarPorJanela(
      [vaga('a', 5), vaga('sem-data', null)],
      'month',
    )
    expect(visiveis.map((v) => v.id)).toEqual(['a'])
    expect(ocultadas).toBe(1)
  })

  // A API respondeu `week` com vaga de 26 dias. Sem este corte local, o
  // "Última semana" da tela seria uma promessa que a API não cumpre.
  test('última semana corta os 8 dias que a API deixaria passar', () => {
    const { visiveis } = filtrarPorJanela([vaga('a', 7), vaga('b', 8)], 'week')
    expect(visiveis.map((v) => v.id)).toEqual(['a'])
  })

  test('hoje aceita só o que tem zero dia', () => {
    const { visiveis } = filtrarPorJanela([vaga('a', 0), vaga('b', 1)], 'today')
    expect(visiveis.map((v) => v.id)).toEqual(['a'])
  })

  test('últimos 3 dias aceita o terceiro e recusa o quarto', () => {
    const { visiveis } = filtrarPorJanela([vaga('a', 3), vaga('b', 4)], '3days')
    expect(visiveis.map((v) => v.id)).toEqual(['a'])
  })

  // `ocultadas` alimenta o aviso da tela. Sem ele, uma busca que trouxe 10
  // vagas e mostrou 2 pareceria uma busca que falhou.
  test('ocultadas conta quantas saíram, para a tela poder explicar o vazio', () => {
    const vagas = [vaga('a', 2), vaga('b', 40), vaga('c', null), vaga('d', 90)]
    expect(filtrarPorJanela(vagas, 'month').ocultadas).toBe(3)
  })

  // Uma janela gravada por uma versão anterior, ou adulterada no
  // localStorage, não pode esvaziar a tabela em silêncio.
  test('janela desconhecida não filtra nada — some com o resultado seria pior', () => {
    const vagas = [vaga('a', 2), vaga('b', 400)]
    expect(filtrarPorJanela(vagas, 'ontem-a-noite').visiveis).toHaveLength(2)
  })
})

describe('JANELAS', () => {
  // A tela monta o dropdown a partir desta lista; o padrão precisa estar nela
  // ou o <select> abriria sem nenhuma opção marcada.
  test('a janela padrão é uma das opções oferecidas', () => {
    expect(JANELAS.map((j) => j.valor)).toContain(JANELA_PADRAO)
  })

  // 'month' porque foi a única janela do teste real que voltou 100% das vagas
  // datadas e nenhuma sem data. 'all' era o padrão antigo — e era ele que
  // deixava os zumbis entrarem.
  test('o padrão é o último mês, não "qualquer data"', () => {
    expect(JANELA_PADRAO).toBe('month')
  })

  test('toda opção tem rótulo em português', () => {
    for (const j of JANELAS) {
      expect(typeof j.rotulo).toBe('string')
      expect(j.rotulo.length).toBeGreaterThan(0)
    }
  })
})

/**
 * Estreitar a janela não precisa de requisição nova: o que a API já devolveu
 * para "Último mês" contém tudo o que "Última semana" mostraria, e o corte
 * local dá conta. Alargar precisa — o que ficou de fora nunca foi baixado.
 *
 * São 200 requisições por mês. Sem esta distinção, brincar com o dropdown
 * queimaria a cota inteira sem trazer uma vaga nova sequer.
 */
describe('cabeNoQueJaTemos', () => {
  test('estreitar não precisa de rede: a semana já está dentro do mês', () => {
    expect(cabeNoQueJaTemos('week', 'month')).toBe(true)
  })

  test('alargar precisa de rede: o mês tem vagas que a semana não baixou', () => {
    expect(cabeNoQueJaTemos('month', 'week')).toBe(false)
  })

  test('a mesma janela cabe em si mesma', () => {
    expect(cabeNoQueJaTemos('week', 'week')).toBe(true)
  })

  // 'Qualquer data' é a mais larga de todas: tudo cabe nela, e ela não cabe
  // em nenhuma outra.
  test('qualquer coisa cabe em "qualquer data"', () => {
    expect(cabeNoQueJaTemos('month', 'all')).toBe(true)
    expect(cabeNoQueJaTemos('today', 'all')).toBe(true)
  })

  test('"qualquer data" não cabe em janela nenhuma', () => {
    expect(cabeNoQueJaTemos('all', 'month')).toBe(false)
  })

  // Na dúvida, buscar. Errar para o lado de gastar uma requisição é melhor
  // que mostrar uma lista incompleta como se fosse o resultado inteiro.
  test('janela desconhecida manda buscar em vez de reaproveitar', () => {
    expect(cabeNoQueJaTemos('week', 'sei-la')).toBe(false)
    expect(cabeNoQueJaTemos('sei-la', 'week')).toBe(false)
  })
})
