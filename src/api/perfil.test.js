import { describe, expect, test, vi } from 'vitest'
// `chamarEstruturado` é o único ponto de contato com a rede — mockado aqui
// para que `extrairPerfil` seja testado de ponta a ponta (monta a chamada,
// lê parsed_output, valida) sem nunca tocar o SDK. `importOriginal` mantém
// `TIPOS`/`ErroClaude` de verdade: só o invólucro de chamada é substituído.
vi.mock('./claude', async (importOriginal) => {
  const real = await importOriginal()
  return { ...real, chamarEstruturado: vi.fn() }
})
import { chamarEstruturado, TIPOS } from './claude'
import {
  PerfilSchema,
  conferirPerfil,
  conteudoDePdf,
  conteudoDeTexto,
  extrairPerfil,
} from './perfil'

const PERFIL_BOM = {
  cargo_deduzido: 'Técnico de Suporte de TI',
  senioridade: 'junior',
  cidade: 'Caxias do Sul, RS',
  aceita_remoto: true,
  pretensao_min: null,
  tecnologias: [{ nome: 'Python', profundidade: 'producao', anos: 3 }],
  formacao: null,
  resumo: 'Suporte migrando para dev.',
}

describe('PerfilSchema', () => {
  test('aceita o perfil completo', () => {
    expect(PerfilSchema.parse(PERFIL_BOM)).toBeTruthy()
  })

  test('null é valor válido, não ausência', () => {
    const comNulos = {
      ...PERFIL_BOM,
      senioridade: null,
      cidade: null,
      aceita_remoto: null,
      pretensao_min: null,
      formacao: null,
    }
    expect(() => PerfilSchema.parse(comNulos)).not.toThrow()
  })

  test('campo faltando é erro — null tem que ser explícito', () => {
    const { pretensao_min, ...semCampo } = PERFIL_BOM
    expect(() => PerfilSchema.parse(semCampo)).toThrow()
  })

  test('profundidade fora dos três valores é rejeitada', () => {
    const ruim = {
      ...PERFIL_BOM,
      tecnologias: [{ nome: 'Python', profundidade: 'muita', anos: null }],
    }
    expect(() => PerfilSchema.parse(ruim)).toThrow()
  })

  test('senioridade fora do enum é rejeitada', () => {
    expect(() =>
      PerfilSchema.parse({ ...PERFIL_BOM, senioridade: 'chefe' }),
    ).toThrow()
  })
})

describe('conteudoDePdf', () => {
  test('o bloco document vem antes do texto', () => {
    const blocos = conteudoDePdf('QkFTRTY0')
    expect(blocos[0].type).toBe('document')
    expect(blocos[1].type).toBe('text')
  })

  test('monta o source de base64 com o media_type de PDF', () => {
    const [doc] = conteudoDePdf('QkFTRTY0')
    expect(doc.source).toEqual({
      type: 'base64',
      media_type: 'application/pdf',
      data: 'QkFTRTY0',
    })
  })

  // Havia um campo `texto_extraido` e uma frase pedindo a transcrição
  // completa do documento aqui — custava ~US$ 0,075 por upload de PDF, mais
  // que o dobro do resto desta extração, e foi removido por custo (ver o
  // comentário de conteudoDePdf em perfil.js). Este teste é a guarda contra
  // a frase voltar sem ninguém perceber o custo que ela reintroduziria.
  test('não pede mais a transcrição do documento — foi removida por custo', () => {
    const blocos = conteudoDePdf('QkFTRTY0')
    expect(blocos[1].text).not.toMatch(/transcri/i)
  })
})

describe('conteudoDeTexto', () => {
  test('manda só texto, sem bloco document', () => {
    const blocos = conteudoDeTexto('Maria Silva, técnica de TI')
    expect(blocos).toHaveLength(1)
    expect(blocos[0].type).toBe('text')
    expect(blocos[0].text).toContain('Maria Silva')
  })

  test('não pede transcrição: o texto já veio do navegador', () => {
    const blocos = conteudoDeTexto('Maria Silva')
    expect(blocos[0].text).not.toMatch(/texto_extraido/)
  })
})

describe('conferirPerfil', () => {
  test('passa num perfil com tecnologias', () => {
    expect(() => conferirPerfil(PERFIL_BOM)).not.toThrow()
  })

  test('lança quando não achou tecnologia nenhuma', () => {
    // Dez notas plausíveis contra um perfil vazio é pior que um erro na cara.
    expect(() => conferirPerfil({ ...PERFIL_BOM, tecnologias: [] })).toThrow(
      /não consegui ler/i,
    )
  })

  test('lança quando o perfil é nulo', () => {
    expect(() => conferirPerfil(null)).toThrow()
  })
})

// Task 5 deixou um export sem cobertura nenhuma porque o crivo "toda ramificação
// tem asserção" nunca olha para o caminho feliz de um export que não ramifica.
// Este bloco existe para não repetir isso: exercita `extrairPerfil` de ponta a
// ponta — monta a chamada, lê parsed_output, valida — com `chamarEstruturado`
// mockado (ver vi.mock('./claude') no topo do arquivo). Zero rede.
describe('extrairPerfil', () => {
  test('caminho PDF: manda bloco document+text, max_tokens 2000, TIPOS.PERFIL, e devolve o perfil validado', async () => {
    chamarEstruturado.mockClear()
    chamarEstruturado.mockResolvedValue({ parsed_output: PERFIL_BOM })

    const perfil = await extrairPerfil({ base64: 'QkFTRTY0' })

    expect(perfil).toEqual(PERFIL_BOM)
    expect(chamarEstruturado).toHaveBeenCalledTimes(1)
    const [tipo, params] = chamarEstruturado.mock.calls[0]
    expect(tipo).toBe(TIPOS.PERFIL)
    // 2000, não mais 8000: a folga era só para o texto_extraido do PDF
    // (removido por custo — ver conteudoDePdf em perfil.js).
    expect(params.max_tokens).toBe(2000)
    expect(params.messages).toHaveLength(1)
    expect(params.messages[0].role).toBe('user')
    const conteudo = params.messages[0].content
    expect(conteudo[0].type).toBe('document')
    expect(conteudo[0].source.data).toBe('QkFTRTY0')
    // output_config precisa existir e trazer o formato — sem isso a Claude
    // devolveria prosa, não `parsed_output`.
    expect(params.output_config.format).toBeTruthy()
  })

  test('caminho texto: sem base64, manda só o bloco de texto', async () => {
    chamarEstruturado.mockClear()
    chamarEstruturado.mockResolvedValue({ parsed_output: PERFIL_BOM })

    await extrairPerfil({ texto: 'Maria Silva, técnica de TI' })

    const [, params] = chamarEstruturado.mock.calls[0]
    const conteudo = params.messages[0].content
    expect(conteudo).toHaveLength(1)
    expect(conteudo[0].type).toBe('text')
    expect(conteudo[0].text).toContain('Maria Silva')
  })

  test('parsed_output sem tecnologia nenhuma: extrairPerfil rejeita em vez de devolver perfil inútil', async () => {
    chamarEstruturado.mockClear()
    chamarEstruturado.mockResolvedValue({
      parsed_output: { ...PERFIL_BOM, tecnologias: [] },
    })

    await expect(extrairPerfil({ texto: 'x' })).rejects.toThrow(
      /não consegui ler/i,
    )
  })

  test('sem base64 e sem texto: rejeita antes de chamar a API — não manda "Currículo: undefined" pago', async () => {
    chamarEstruturado.mockClear()

    await expect(extrairPerfil({})).rejects.toThrow()

    expect(chamarEstruturado).not.toHaveBeenCalled()
  })
})
