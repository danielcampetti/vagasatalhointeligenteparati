import { describe, expect, test } from 'vitest'
import { FILTRO_VAZIO, filtrarAcervo, opcoesDoAcervo } from './filtroAcervo'

/**
 * O recorte da aba Banco de Dados.
 *
 * Diferente do da aba Vagas em duas coisas, e as duas vêm do mesmo fato: aqui
 * não há requisição. O filtro é local, então não custa cota, então não precisa
 * de botão "Buscar" — adiar existe lá para não queimar uma das 200 do mês, e
 * copiar o botão para cá seria copiar a forma jogando fora o motivo.
 *
 * A segunda: os dropdowns saem do próprio acervo, não de uma lista fixa. A
 * cidade da aba Vagas é a lista do IBGE porque a API precisa do rótulo exato;
 * aqui, oferecer 5570 cidades quando 7 têm vaga seria oferecer 5563 caminhos
 * para uma tabela vazia.
 */

const vaga = (id, extra = {}) => ({
  id,
  cargo: 'Analista de Sistemas',
  empresa: 'Acme',
  cidade: 'Caxias do Sul, RS',
  modalidade: 'Presencial',
  days: 5,
  ...extra,
})

describe('filtrarAcervo: texto', () => {
  test('filtro vazio devolve tudo', () => {
    const vagas = [vaga('a'), vaga('b')]
    const { visiveis, ocultadas } = filtrarAcervo(vagas, FILTRO_VAZIO)
    expect(visiveis).toHaveLength(2)
    expect(ocultadas).toBe(0)
  })

  test('casa por trecho no cargo', () => {
    const vagas = [vaga('a', { cargo: 'Analista de Suporte' }), vaga('b', { cargo: 'Supervisor' })]
    const { visiveis } = filtrarAcervo(vagas, { ...FILTRO_VAZIO, texto: 'analista' })
    expect(visiveis.map((v) => v.id)).toEqual(['a'])
  })

  /**
   * O caso que existe de verdade no acervo: uma busca por "Tecnico de TI"
   * (Goiânia) e outra por "Técnico Em TI" (Caxias do Sul) gravaram as duas
   * grafias. Um filtro que casasse acento acharia metade e não diria por quê.
   */
  test('ignora acento: "tecnico" acha "Técnico" e vice-versa', () => {
    const vagas = [vaga('a', { cargo: 'Técnico Em TI' }), vaga('b', { cargo: 'Tecnico de TI' })]
    expect(
      filtrarAcervo(vagas, { ...FILTRO_VAZIO, texto: 'tecnico' }).visiveis,
    ).toHaveLength(2)
    expect(
      filtrarAcervo(vagas, { ...FILTRO_VAZIO, texto: 'técnico' }).visiveis,
    ).toHaveLength(2)
  })

  test('ignora caixa', () => {
    const vagas = [vaga('a', { cargo: 'SUPERVISOR DE TI' })]
    expect(
      filtrarAcervo(vagas, { ...FILTRO_VAZIO, texto: 'supervisor' }).visiveis,
    ).toHaveLength(1)
  })

  /**
   * Quem procura no histórico às vezes lembra da empresa e não do cargo — é a
   * diferença de quem já viu a vaga uma vez. Na aba Vagas o campo é só cargo
   * porque é o que vai para a API; aqui não há API para agradar.
   */
  test('casa também na empresa', () => {
    const vagas = [vaga('a', { empresa: 'Hyva do Brasil' }), vaga('b', { empresa: 'Jobbol' })]
    const { visiveis } = filtrarAcervo(vagas, { ...FILTRO_VAZIO, texto: 'hyva' })
    expect(visiveis.map((v) => v.id)).toEqual(['a'])
  })

  test('espaço em volta não conta', () => {
    const vagas = [vaga('a', { cargo: 'Analista' })]
    expect(
      filtrarAcervo(vagas, { ...FILTRO_VAZIO, texto: '  analista  ' }).visiveis,
    ).toHaveLength(1)
  })

  // Campo nulo não pode derrubar o recorte: `mapear.js` devolve `null` para
  // cargo e empresa quando a resposta não os traz.
  test('cargo ou empresa nulos não quebram a busca', () => {
    const vagas = [vaga('a', { cargo: null, empresa: null })]
    expect(() =>
      filtrarAcervo(vagas, { ...FILTRO_VAZIO, texto: 'x' }),
    ).not.toThrow()
    expect(filtrarAcervo(vagas, { ...FILTRO_VAZIO, texto: 'x' }).visiveis).toHaveLength(0)
  })
})

describe('filtrarAcervo: cidade e modalidade', () => {
  test('cidade recorta pelo rótulo exato que está guardado', () => {
    const vagas = [
      vaga('a', { cidade: 'Caxias do Sul, RS' }),
      vaga('b', { cidade: 'Porto Alegre, Rio Grande do Sul' }),
    ]
    const { visiveis } = filtrarAcervo(vagas, {
      ...FILTRO_VAZIO,
      cidade: 'Porto Alegre, Rio Grande do Sul',
    })
    expect(visiveis.map((v) => v.id)).toEqual(['b'])
  })

  test('modalidade recorta', () => {
    const vagas = [vaga('a', { modalidade: 'Remoto' }), vaga('b', { modalidade: 'Presencial' })]
    const { visiveis } = filtrarAcervo(vagas, { ...FILTRO_VAZIO, modalidade: 'Remoto' })
    expect(visiveis.map((v) => v.id)).toEqual(['a'])
  })

  test('os filtros se somam: cidade e texto juntos', () => {
    const vagas = [
      vaga('a', { cargo: 'Analista', cidade: 'Goiânia, Goiás' }),
      vaga('b', { cargo: 'Analista', cidade: 'Caxias do Sul, RS' }),
      vaga('c', { cargo: 'Supervisor', cidade: 'Goiânia, Goiás' }),
    ]
    const { visiveis } = filtrarAcervo(vagas, {
      ...FILTRO_VAZIO,
      texto: 'analista',
      cidade: 'Goiânia, Goiás',
    })
    expect(visiveis.map((v) => v.id)).toEqual(['a'])
  })

  test('ocultadas conta o que saiu, para a tela poder explicar o vazio', () => {
    const vagas = [vaga('a'), vaga('b'), vaga('c')]
    const { ocultadas } = filtrarAcervo(vagas, { ...FILTRO_VAZIO, texto: 'zzz' })
    expect(ocultadas).toBe(3)
  })
})

/**
 * A janela reusa o `filtrarPorJanela` do `janela.js` — mesmo recorte que a aba
 * Vagas faz, mesma regra para vaga sem data. O padrão aqui é 'Qualquer data',
 * e não 'Último mês': um acervo existe para guardar o histórico, e estreá-lo
 * escondendo o que tem mais de 30 dias esconderia justamente o que ele guarda.
 */
describe('filtrarAcervo: janela de publicação', () => {
  test('sem janela escolhida, a data não recorta nada', () => {
    const vagas = [vaga('a', { days: 2 }), vaga('b', { days: 400 }), vaga('c', { days: null })]
    expect(filtrarAcervo(vagas, FILTRO_VAZIO).visiveis).toHaveLength(3)
  })

  test('escolher uma janela recorta como na aba Vagas', () => {
    const vagas = [vaga('a', { days: 2 }), vaga('b', { days: 40 })]
    const { visiveis } = filtrarAcervo(vagas, { ...FILTRO_VAZIO, janela: 'month' })
    expect(visiveis.map((v) => v.id)).toEqual(['a'])
  })
})

/**
 * Os dropdowns saem do acervo para nunca oferecerem um caminho que dá zero.
 * A contagem vai junto porque ela é a informação que faz escolher: "Goiânia
 * (8)" diz o que "Goiânia" sozinho não diz.
 */
describe('opcoesDoAcervo', () => {
  const vagas = [
    vaga('a', { cidade: 'Goiânia, Goiás', modalidade: 'Presencial' }),
    vaga('b', { cidade: 'Goiânia, Goiás', modalidade: 'Remoto' }),
    vaga('c', { cidade: 'Caxias do Sul, RS', modalidade: 'Presencial' }),
  ]

  test('lista cada cidade uma vez, com quantas vagas tem', () => {
    const { cidades } = opcoesDoAcervo(vagas)
    expect(cidades).toEqual([
      { valor: 'Goiânia, Goiás', quantas: 2 },
      { valor: 'Caxias do Sul, RS', quantas: 1 },
    ])
  })

  test('a mais numerosa vem primeiro', () => {
    const { cidades } = opcoesDoAcervo(vagas)
    expect(cidades[0].valor).toBe('Goiânia, Goiás')
  })

  test('lista as modalidades presentes', () => {
    const { modalidades } = opcoesDoAcervo(vagas)
    expect(modalidades.map((m) => m.valor).sort()).toEqual(['Presencial', 'Remoto'])
  })

  // Vaga sem cidade ou sem modalidade não vira uma opção "null" no dropdown.
  test('campo ausente não vira opção', () => {
    const { cidades, modalidades } = opcoesDoAcervo([
      vaga('a', { cidade: null, modalidade: null }),
    ])
    expect(cidades).toEqual([])
    expect(modalidades).toEqual([])
  })

  test('acervo vazio devolve listas vazias, sem quebrar', () => {
    expect(opcoesDoAcervo([]).cidades).toEqual([])
    expect(opcoesDoAcervo(undefined).modalidades).toEqual([])
  })
})
