import { describe, expect, test } from 'vitest'
import { linkDeCandidatura, mapearVaga } from './mapear'

/**
 * Primeiro teste deste módulo. Ele nasceu junto com a coluna "Ver Vaga", que
 * transformou o `link` num `<a href>` clicável direto na tabela.
 *
 * Até então o link só aparecia na página de detalhe, atrás de um clique
 * deliberado. Virar um ícone em toda linha muda o cálculo: a URL vem de uma
 * API de terceiros, e a tabela passa a renderizar dez delas de uma vez, sem
 * que ninguém as tenha lido antes.
 *
 * Um `javascript:` num `href` executa ao clique, na origem da própria página.
 * O saneamento mora aqui e não na tela porque este é o ponto onde o link
 * nasce: barrando na origem, o valor perigoso nunca chega a existir no estado
 * do app, e nenhuma tela futura precisa lembrar de conferir.
 */
describe('linkDeCandidatura', () => {
  test('http e https passam', () => {
    expect(linkDeCandidatura({ job_apply_link: 'https://x.com/vaga' })).toBe(
      'https://x.com/vaga',
    )
    expect(linkDeCandidatura({ job_apply_link: 'http://x.com/vaga' })).toBe(
      'http://x.com/vaga',
    )
  })

  test('esquema executável não vira href', () => {
    for (const perigoso of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      '  javascript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'vbscript:msgbox(1)',
    ]) {
      expect(linkDeCandidatura({ job_apply_link: perigoso })).toBe(null)
    }
  })

  test('sem link nenhum devolve null, e a tela mostra —', () => {
    expect(linkDeCandidatura({})).toBe(null)
    expect(linkDeCandidatura(null)).toBe(null)
    expect(linkDeCandidatura({ job_apply_link: '' })).toBe(null)
  })

  // A cadeia de reserva já existia no `mapearVaga`; ela continua valendo, e
  // agora o valor de reserva passa pela mesma peneira do principal.
  test('cai em apply_options quando o link direto falta', () => {
    expect(
      linkDeCandidatura({
        apply_options: [{ apply_link: 'https://indeed.com/v/1' }],
      }),
    ).toBe('https://indeed.com/v/1')
  })

  test('reserva perigosa também é recusada', () => {
    expect(
      linkDeCandidatura({
        apply_options: [{ apply_link: 'javascript:alert(1)' }],
      }),
    ).toBe(null)
  })

  // Link principal ruim não deve mascarar uma reserva boa: a peneira é por
  // candidato, não uma desistência no primeiro tropeço.
  test('link principal perigoso não descarta a reserva boa', () => {
    expect(
      linkDeCandidatura({
        job_apply_link: 'javascript:alert(1)',
        apply_options: [{ apply_link: 'https://boa.com/v' }],
      }),
    ).toBe('https://boa.com/v')
  })
})

describe('mapearVaga: o link que chega à tela', () => {
  test('a vaga mapeada carrega o link já saneado', () => {
    const vaga = mapearVaga(
      { job_id: 'a1', job_title: 'Dev', job_apply_link: 'javascript:alert(1)' },
      0,
    )
    expect(vaga.link).toBe(null)
  })

  test('link legítimo sobrevive ao mapeamento', () => {
    const vaga = mapearVaga(
      { job_id: 'a1', job_title: 'Dev', job_apply_link: 'https://x.com/v' },
      0,
    )
    expect(vaga.link).toBe('https://x.com/v')
  })
})
