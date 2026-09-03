import { describe, expect, test } from 'vitest'
import {
  MODALIDADES,
  MODALIDADE_PADRAO,
  filtrarPorModalidade,
  modalidadeDe,
  soRemotas,
} from './modalidade'
import { mapearVaga } from './api/mapear'

/**
 * A forma deste módulo vem da documentação do `/search-v2`
 * (openwebninja.com/api/jsearch/docs, lida em 2026-09-03). Os parâmetros
 * aceitos são:
 *
 *   query, cursor, num_pages, country, language, date_posted,
 *   work_from_home, employment_types, job_requirements, radius,
 *   exclude_job_publishers, fields
 *
 * `work_arrangement` **não está na lista** — é o nome do campo na *resposta*,
 * que o `mapear.js` lê. Mandá-lo na requisição seria 400, e 400 debita cota.
 *
 * O que existe é `work_from_home`, booleano: "Only return work from home /
 * remote jobs". A API sabe responder uma pergunta só, e a tela agora faz
 * exatamente essa pergunta — Remoto ou Presencial. As duas coisas têm a mesma
 * forma, e é isso que este arquivo trava.
 *
 * Medido em 2026-09-03, nas 88 vagas que 5 consultas reais deixaram no cache:
 * 84 presenciais, 4 remotas, nenhuma híbrida, nenhuma sem modalidade. O campo
 * vem preenchido na prática — mas "na prática" não é "sempre", e é por isso
 * que "Presencial" é definido como *o complemento de Remoto*, não como uma
 * igualdade. Com só duas opções e sem "Todas", uma vaga que não casasse com
 * nenhuma das duas não teria por onde aparecer.
 */

const vaga = (id, modalidade) => ({ id, modalidade })

describe('filtrarPorModalidade', () => {
  test('remoto fica só com as remotas', () => {
    const vagas = [vaga('a', 'Remoto'), vaga('b', 'Presencial')]
    const { visiveis, ocultadas } = filtrarPorModalidade(vagas, 'remoto')
    expect(visiveis.map((v) => v.id)).toEqual(['a'])
    expect(ocultadas).toBe(1)
  })

  test('presencial fica com tudo que não é remoto', () => {
    const vagas = [vaga('a', 'Presencial'), vaga('b', 'Remoto')]
    const { visiveis, ocultadas } = filtrarPorModalidade(vagas, 'presencial')
    expect(visiveis.map((v) => v.id)).toEqual(['a'])
    expect(ocultadas).toBe(1)
  })

  /**
   * As duas que a tela deixou de oferecer. Elas não sumiram do mundo — a API
   * ainda as devolve —, então precisam cair em algum lado, e o lado é
   * "Presencial": é o que sobra depois de tirar as remotas.
   *
   * Se "Presencial" fosse igualdade estrita, estas duas não apareceriam em
   * opção nenhuma. Sem "Todas" no dropdown, seria vaga escondida em silêncio.
   */
  test('híbrida entra em presencial: não há mais opção própria para ela', () => {
    const { visiveis } = filtrarPorModalidade([vaga('h', 'Híbrido')], 'presencial')
    expect(visiveis.map((v) => v.id)).toEqual(['h'])
  })

  test('vaga sem modalidade informada entra em presencial, não some', () => {
    const { visiveis } = filtrarPorModalidade([vaga('s', null)], 'presencial')
    expect(visiveis.map((v) => v.id)).toEqual(['s'])
  })

  /**
   * A propriedade que substitui o antigo "Todas": as duas opções são
   * complementares, então toda vaga cabe em exatamente uma. É esta invariante
   * que garante que nada fica invisível agora que o dropdown tem dois valores.
   */
  test('as duas opções particionam a lista: nada fica de fora, nada aparece duas vezes', () => {
    const vagas = [
      vaga('a', 'Remoto'),
      vaga('b', 'Presencial'),
      vaga('c', 'Híbrido'),
      vaga('d', null),
      vaga('e', 'Remoto'),
    ]
    const remotas = filtrarPorModalidade(vagas, 'remoto').visiveis
    const resto = filtrarPorModalidade(vagas, 'presencial').visiveis

    expect(remotas.length + resto.length).toBe(vagas.length)
    const ids = [...remotas, ...resto].map((v) => v.id).sort()
    expect(ids).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  test('ocultadas conta quantas saíram, para a tela poder explicar o vazio', () => {
    const vagas = [
      vaga('a', 'Remoto'),
      vaga('b', 'Presencial'),
      vaga('c', null),
      vaga('d', 'Híbrido'),
    ]
    expect(filtrarPorModalidade(vagas, 'remoto').ocultadas).toBe(3)
  })

  // Mesma defesa do `filtrarPorJanela`: valor estranho vindo do localStorage
  // de uma versão anterior — 'todas' e 'hibrido' existiram — não pode
  // esvaziar a tabela em silêncio.
  test('modalidade desconhecida não filtra nada', () => {
    const vagas = [vaga('a', 'Remoto'), vaga('b', 'Presencial')]
    for (const morto of ['todas', 'hibrido', 'teletrabalho']) {
      expect(filtrarPorModalidade(vagas, morto).visiveis).toHaveLength(2)
    }
  })
})

/**
 * A chave de cache carrega este booleano, e agora ele é a opção inteira: a
 * pergunta que a tela faz e a pergunta que a API responde viraram a mesma.
 */
describe('soRemotas', () => {
  test('só "remoto" muda o que a API é perguntada', () => {
    expect(soRemotas('remoto')).toBe(true)
    expect(soRemotas('presencial')).toBe(false)
  })

  // Valor desconhecido não pode virar `work_from_home` na URL: a defesa é a
  // mesma que o `date_posted` já tem, porque um 400 debita cota igual.
  test('modalidade desconhecida não vira parâmetro', () => {
    expect(soRemotas('todas')).toBe(false)
    expect(soRemotas('sei-la')).toBe(false)
  })
})

describe('MODALIDADES', () => {
  test('são duas opções, presencial e remoto', () => {
    expect(MODALIDADES.map((m) => m.valor)).toEqual(['presencial', 'remoto'])
  })

  test('a modalidade padrão é uma das opções oferecidas', () => {
    expect(MODALIDADES.map((m) => m.valor)).toContain(MODALIDADE_PADRAO)
  })

  /**
   * 'presencial' e não 'remoto': é a esmagadora maioria do que a busca traz
   * (84 de 88 nas consultas reais medidas), e é a opção que não manda
   * parâmetro — o padrão continua sendo a requisição mais simples possível.
   */
  test('o padrão é presencial', () => {
    expect(MODALIDADE_PADRAO).toBe('presencial')
  })

  test('o padrão não manda work_from_home', () => {
    expect(soRemotas(MODALIDADE_PADRAO)).toBe(false)
  })

  test('toda opção tem rótulo em português', () => {
    for (const m of MODALIDADES) {
      expect(typeof m.rotulo).toBe('string')
      expect(m.rotulo.length).toBeGreaterThan(0)
    }
  })

  test('modalidadeDe acha pelo valor e devolve undefined para o que não existe', () => {
    expect(modalidadeDe('remoto').rotulo).toBe('Remoto')
    expect(modalidadeDe('todas')).toBeUndefined()
  })
})

/**
 * O acordo entre este módulo e o `mapear.js` é uma string — "Remoto" — e são
 * dois módulos que nunca se importam. Um acento ou um caixa-alta a mais de um
 * lado esvaziaria o filtro do outro **sem erro nenhum na tela**.
 *
 * Por isso o teste não compara literais: passa uma resposta crua da API pelo
 * `mapearVaga` de verdade e conferre onde ela cai. É o único jeito de a
 * ligação quebrar ruidosamente.
 */
describe('acordo com o mapear.js', () => {
  const crua = (work_arrangement) => ({ job_id: 'x', work_arrangement })

  test('vaga que o mapear diz remota cai em "Remoto"', () => {
    const mapeada = mapearVaga(crua('REMOTE'), 0)
    expect(mapeada.modalidade).toBe('Remoto')
    expect(filtrarPorModalidade([mapeada], 'remoto').visiveis).toHaveLength(1)
    expect(filtrarPorModalidade([mapeada], 'presencial').visiveis).toHaveLength(0)
  })

  test('vaga presencial e vaga híbrida caem as duas em "Presencial"', () => {
    for (const arranjo of ['ON_SITE', 'HYBRID']) {
      const mapeada = mapearVaga(crua(arranjo), 0)
      expect(filtrarPorModalidade([mapeada], 'presencial').visiveis).toHaveLength(1)
      expect(filtrarPorModalidade([mapeada], 'remoto').visiveis).toHaveLength(0)
    }
  })

  test('vaga sem work_arrangement cai em "Presencial"', () => {
    const mapeada = mapearVaga(crua(undefined), 0)
    expect(mapeada.modalidade).toBe(null)
    expect(filtrarPorModalidade([mapeada], 'presencial').visiveis).toHaveLength(1)
  })
})
