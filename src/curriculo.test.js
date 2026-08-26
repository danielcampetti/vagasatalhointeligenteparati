import { beforeEach, describe, expect, test } from 'vitest'
import { limparCache } from './cota'
import {
  VERSAO,
  corrigirPerfil,
  definirInstrucao,
  gravarCurriculo,
  lerCurriculo,
  limparCorrecoes,
  perfilEfetivo,
  removerCurriculo,
} from './curriculo'

const PERFIL = {
  cargo_deduzido: 'Técnico de Suporte de TI',
  senioridade: 'junior',
  cidade: 'Caxias do Sul, RS',
  aceita_remoto: true,
  pretensao_min: null,
  tecnologias: [{ nome: 'Python', profundidade: 'producao', anos: 3 }],
  formacao: 'Tecnólogo em ADS (cursando)',
  resumo: 'Suporte migrando para dev.',
}

function gravarExemplo() {
  return gravarCurriculo({
    arquivo: { nome: 'cv.pdf', tamanho: '120 KB', quando: '2026-08-26T12:00:00Z' },
    texto: 'texto cru do currículo',
    perfil: PERFIL,
  })
}

beforeEach(() => localStorage.clear())

describe('lerCurriculo', () => {
  test('sem nada gravado devolve null', () => {
    expect(lerCurriculo()).toBe(null)
  })

  test('devolve o que foi gravado', () => {
    gravarExemplo()
    const cv = lerCurriculo()
    expect(cv.texto).toBe('texto cru do currículo')
    expect(cv.perfil.cargo_deduzido).toBe('Técnico de Suporte de TI')
    expect(cv.versao).toBe(VERSAO)
  })

  test('versão desconhecida é descartada, não migrada', () => {
    localStorage.setItem(
      'vagas:cv',
      JSON.stringify({ versao: 99, perfil: PERFIL, texto: 'x' }),
    )
    expect(lerCurriculo()).toBe(null)
  })

  test('valor corrompido não lança', () => {
    localStorage.setItem('vagas:cv', 'isto não é json')
    expect(() => lerCurriculo()).not.toThrow()
    expect(lerCurriculo()).toBe(null)
  })
})

describe('correções', () => {
  test('o perfil efetivo aplica a correção por cima', () => {
    gravarExemplo()
    corrigirPerfil('pretensao_min', 4.5)
    expect(perfilEfetivo(lerCurriculo()).pretensao_min).toBe(4.5)
  })

  test('a correção não sobrescreve o perfil extraído', () => {
    gravarExemplo()
    corrigirPerfil('cidade', 'Bento Gonçalves, RS')
    const cv = lerCurriculo()
    expect(cv.perfil.cidade).toBe('Caxias do Sul, RS')
    expect(cv.correcoes.cidade).toBe('Bento Gonçalves, RS')
  })

  test('limparCorrecoes volta ao que a IA entendeu', () => {
    gravarExemplo()
    corrigirPerfil('cidade', 'Bento Gonçalves, RS')
    limparCorrecoes()
    expect(perfilEfetivo(lerCurriculo()).cidade).toBe('Caxias do Sul, RS')
  })

  test('regravar o perfil preserva as correções', () => {
    gravarExemplo()
    corrigirPerfil('pretensao_min', 4.5)
    gravarCurriculo({
      arquivo: { nome: 'cv2.pdf', tamanho: '90 KB', quando: '2026-08-27T12:00:00Z' },
      texto: 'outro texto',
      perfil: { ...PERFIL, senioridade: 'pleno' },
    })
    const cv = lerCurriculo()
    expect(cv.perfil.senioridade).toBe('pleno')
    expect(perfilEfetivo(cv).pretensao_min).toBe(4.5)
  })

  test('perfilEfetivo com cv nulo devolve null', () => {
    expect(perfilEfetivo(null)).toBe(null)
  })
})

describe('instrução', () => {
  test('sobrevive à leitura', () => {
    gravarExemplo()
    definirInstrucao('Pontue só por aderência técnica.')
    expect(lerCurriculo().instrucao).toBe('Pontue só por aderência técnica.')
  })
})

describe('remoção', () => {
  test('removerCurriculo apaga a chave, não só a memória', () => {
    gravarExemplo()
    removerCurriculo()
    expect(localStorage.getItem('vagas:cv')).toBe(null)
    expect(lerCurriculo()).toBe(null)
  })

  test('limpar o cache do JSearch não leva o currículo junto', () => {
    gravarExemplo()
    limparCache()
    expect(lerCurriculo()).not.toBe(null)
  })
})
