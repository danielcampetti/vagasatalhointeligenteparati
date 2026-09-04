import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test } from 'vitest'
import { Linha } from './App'

/**
 * A linha da tabela, e a vaga que ela não sabia desenhar.
 *
 * Em 04/09/2026 a aba Banco de Dados virou página branca no Railway. A causa,
 * achada depois que o `LimiteDeErro` passou a mostrar a mensagem: `vaga.techs`
 * não existe na vaga `prova1`, gravada no volume por um `curl` de teste, e o
 * `.map` dela derrubava o render inteiro.
 *
 * Dois fatos fizeram isso escapar de tudo:
 *
 * **Só a tabela quebra.** Em janela estreita o app desenha cartões, que não
 * mostram techs — e foi em janela estreita que a primeira reprodução rodou.
 * "Não reproduz" era "não reproduz nesta largura".
 *
 * **O acervo é público e não tem DELETE.** O `mapear.js` sempre põe
 * `techs: []`, então vaga vinda da busca nunca chega assim; mas o `POST
 * /api/acervo` aceita qualquer corpo, e o que entra fica. A linha desenha o
 * que está guardado, não o que o `mapear.js` promete — e a vaga que a derruba
 * não pode ser apagada.
 */

globalThis.IS_REACT_ACT_ENVIRONMENT = true

/** A `prova1` como o servidor a devolve hoje — sem `techs`, e é esse o ponto. */
const PROVA1 = {
  id: 'prova1',
  cargo: 'Prova de persistencia',
  empresa: 'Teste',
  cidade: 'Caxias do Sul, RS',
  modalidade: 'Presencial',
  rank: null,
  fav: false,
  seen: false,
  entrouEm: '2026-09-03T23:47:20.063Z',
}

const raizes = []

function montar(elemento) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const raiz = createRoot(container)
  raizes.push({ raiz, container })
  act(() => raiz.render(elemento))
  return container
}

afterEach(() => {
  for (const { raiz, container } of raizes.splice(0)) {
    act(() => raiz.unmount())
    container.remove()
  }
})

describe('Linha: o que a tabela desenha', () => {
  test('vaga sem techs não derruba a linha', () => {
    const container = montar(
      <Linha vaga={PROVA1} menuAberto={false} onMenu={() => {}} onAbrir={() => {}} />,
    )

    expect(container.textContent).toContain('Prova de persistencia')
  })

  /**
   * Ausente não é o único jeito de `techs` não ser uma lista.
   *
   * O formulário de "nova vaga" guarda `techs` como **string** e só a quebra em
   * lista na hora de salvar (`App.jsx`, o `.split` do `salvarVaga`). Uma versão
   * futura que esquecesse esse passo — ou qualquer POST vindo de fora, que o
   * acervo aceita sem autenticação — gravaria a string, e `'react, node'.map`
   * derruba a tabela igual ao `undefined`. Um `?? []` sozinho não pega este
   * caso: a string não é nula.
   */
  test('techs que não é lista também não derruba a linha', () => {
    const container = montar(
      <Linha
        vaga={{ ...PROVA1, techs: 'react, node' }}
        menuAberto={false}
        onMenu={() => {}}
        onAbrir={() => {}}
      />,
    )

    expect(container.textContent).toContain('Prova de persistencia')
  })

  /**
   * E o caminho normal continua desenhando o que tem que desenhar — senão o
   * conserto poderia ser "nunca mostrar techs", que passa nos dois testes
   * acima e apaga uma coluna.
   */
  test('techs de verdade aparecem na linha', () => {
    const container = montar(
      <Linha
        vaga={{ ...PROVA1, techs: ['React', 'Node'] }}
        menuAberto={false}
        onMenu={() => {}}
        onAbrir={() => {}}
      />,
    )

    expect(container.textContent).toContain('React')
    expect(container.textContent).toContain('Node')
  })
})
