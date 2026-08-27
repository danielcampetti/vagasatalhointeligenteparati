import { describe, expect, test, vi } from 'vitest'
// `chamarTexto` é o único ponto de contato com a rede — mockado aqui para que
// `justificar` seja testado de ponta a ponta (monta a chamada, junta a
// prosa) sem nunca tocar o SDK. `importOriginal` mantém `TIPOS` de verdade:
// só o invólucro de chamada é substituído.
vi.mock('./claude', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, chamarTexto: vi.fn() }
})
import { chamarTexto, TIPOS } from './claude'
import { justificar, montarPrompt } from './justificativa'

const PERFIL = { cargo_deduzido: 'Técnico de TI', tecnologias: [] }
const VAGA = {
  id: 'a1',
  cargo: 'Analista de Suporte',
  empresa: 'Acme',
  cidade: 'Caxias do Sul, RS',
  modalidade: 'Presencial',
  min: null,
  max: null,
  days: 3,
  descricao: 'Atendimento nível 2.',
}

describe('montarPrompt', () => {
  test('leva o texto cru do currículo, não só o perfil', () => {
    const p = montarPrompt(PERFIL, 'TEXTO CRU DO CURRICULO', VAGA)
    expect(p).toContain('TEXTO CRU DO CURRICULO')
  })

  test('leva a vaga', () => {
    expect(montarPrompt(PERFIL, 'x', VAGA)).toContain('Analista de Suporte')
  })

  test('funciona sem texto cru — currículo antigo pode não ter', () => {
    expect(() => montarPrompt(PERFIL, '', VAGA)).not.toThrow()
    expect(montarPrompt(PERFIL, '', VAGA)).toContain('Analista de Suporte')
  })
})

// `justificar` é o ponto de entrada de verdade do módulo — monta a chamada e
// devolve a prosa. Testar só `montarPrompt` deixaria passar exatamente o
// defeito que a Task 5 já cometeu uma vez: um export central sem cobertura
// do seu próprio comportamento fim a fim. `chamarTexto` é mockado (topo do
// arquivo) — zero rede.
describe('justificar', () => {
  test('caminho feliz: uma chamada, TIPOS.JUSTIFICATIVA, max_tokens 2000, leva perfil/texto/vaga, e devolve a prosa', async () => {
    chamarTexto.mockClear()
    chamarTexto.mockResolvedValue({
      content: [{ type: 'text', text: 'Combina bem porque...' }],
    })

    const resultado = await justificar(PERFIL, 'CURRICULO CRU', 'instrução', VAGA)

    expect(chamarTexto).toHaveBeenCalledTimes(1)
    const [tipo, params] = chamarTexto.mock.calls[0]
    expect(tipo).toBe(TIPOS.JUSTIFICATIVA)
    expect(params.max_tokens).toBe(2000)
    // A instrução do chamador viaja no system, não só o texto fixo do módulo.
    expect(params.system).toContain('instrução')
    const conteudo = params.messages[0].content
    expect(conteudo).toContain('CURRICULO CRU')
    expect(conteudo).toContain('Analista de Suporte')

    expect(resultado).toBe('Combina bem porque...')
  })

  test('sem texto cru: não lança e ainda manda a vaga', async () => {
    chamarTexto.mockClear()
    chamarTexto.mockResolvedValue({
      content: [{ type: 'text', text: 'Sem currículo completo disponível.' }],
    })

    const resultado = await justificar(PERFIL, '', 'instrução', VAGA)

    const [, params] = chamarTexto.mock.calls[0]
    expect(params.messages[0].content).toContain('Analista de Suporte')
    expect(resultado).toBe('Sem currículo completo disponível.')
  })

  test('junta múltiplos blocos de texto e ignora blocos que não são texto', async () => {
    chamarTexto.mockClear()
    chamarTexto.mockResolvedValue({
      content: [
        { type: 'text', text: 'Primeiro parágrafo.' },
        { type: 'outro_tipo', text: 'não deveria aparecer' },
        { type: 'text', text: 'Segundo parágrafo.' },
      ],
    })

    const resultado = await justificar(PERFIL, 'x', 'instrução', VAGA)

    expect(resultado).toBe('Primeiro parágrafo.\n\nSegundo parágrafo.')
    expect(resultado).not.toContain('não deveria aparecer')
  })
})
