import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { LimiteDeErro } from './LimiteDeErro'

/**
 * O limite de erro, e o defeito que ele existe para impedir.
 *
 * Em 04/09/2026 a aba Banco de Dados virou uma página inteiramente branca no
 * navegador do dono — sem menu lateral, sem mensagem, sem caminho de volta.
 * Não havia nada na tela para dizer o que tinha acontecido, e descobrir isso
 * custou uma investigação inteira: reproduzir no Railway, comparar o bundle
 * publicado com o do `main`, simular a migração do `localStorage`. O erro em
 * si estava no console do navegador dele o tempo todo.
 *
 * Um app React sem limite de erro se comporta assim por desenho: um erro
 * durante o render desmonta a árvore inteira, e o que sobra é o `<body>` vazio.
 * Estes testes travam as três coisas que fazem a diferença entre aquela tela
 * branca e uma tela que se explica: o resto do app sobrevive, a mensagem
 * aparece escrita, e dá para voltar sem F5.
 *
 * ## Por que `react-dom/client` cru, e não `@testing-library/react`
 *
 * É o primeiro teste de componente do projeto, e a biblioteca seria uma
 * dependência nova para montar `<div>` e ler `textContent`. A mesma regra que
 * escolheu `node:sqlite` em vez de Postgres vale aqui: o `act` do React 19 e o
 * `createRoot` bastam.
 */

/**
 * Sem esta marca o React avisa, a cada render, que o `act` está fora de um
 * ambiente de teste — um `console.error` por montagem, que suja a saída da
 * suíte e, pior, entra na espionagem do console do teste lá embaixo como se
 * fosse coisa do componente.
 */
globalThis.IS_REACT_ACT_ENVIRONMENT = true

/** Um componente que quebra no render — o defeito, de propósito. */
function Explode({ mensagem = 'o defeito de propósito' }) {
  throw new Error(mensagem)
}

const raizes = []

/**
 * Monta na `document.body` e devolve o container para inspeção.
 *
 * `onCaughtError` vazio cala o aviso que o React escreve por conta própria
 * quando um limite captura: ele é ruído aqui, e a suíte precisa de saída
 * limpa para que um erro de verdade se destaque. O que o **componente**
 * escreve no console é assunto de outro teste, e não passa por aqui.
 */
function montar(elemento) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const raiz = createRoot(container, { onCaughtError: () => {} })
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

describe('LimiteDeErro: o caso comum, que é não haver erro nenhum', () => {
  /**
   * O limite envolve a aba inteira, então ele está no caminho de todo render
   * que o app faz — e no dia a dia nenhum deles quebra. Um limite que
   * enfeitasse, envolvesse ou perdesse o conteúdo no caminho seria um defeito
   * permanente pago para evitar um eventual.
   */
  test('sem erro, entrega os filhos intactos', () => {
    const container = montar(
      <LimiteDeErro>
        <p>a aba inteira</p>
      </LimiteDeErro>,
    )

    expect(container.textContent).toBe('a aba inteira')
  })
})

describe('LimiteDeErro: o que sobrevive ao erro', () => {
  /**
   * O teste que descreve a queixa original.
   *
   * Sem o limite, o `menu lateral` desaparece junto com o que quebrou —
   * porque o React desmonta a raiz inteira, não só o ramo defeituoso. É esse
   * desaparecimento que se chama "página branca", e é ele que este teste
   * proíbe: quem fica sem a aba tem que continuar com o menu para sair dela.
   */
  test('o irmão do que quebrou continua na tela', () => {
    const container = montar(
      <div>
        <nav>menu lateral</nav>
        <LimiteDeErro>
          <Explode />
        </LimiteDeErro>
      </div>,
    )

    expect(container.textContent).toContain('menu lateral')
  })
})

describe('LimiteDeErro: o que a tela passa a dizer', () => {
  /**
   * A mensagem do erro tem que estar **escrita na tela**, não só no console.
   *
   * É a diferença exata entre a investigação de hoje e uma de cinco minutos.
   * A tela branca não dava nem o nome do que quebrou; quem a viu só podia
   * dizer "ficou branco", e daí em diante o trabalho é adivinhar. Com o texto
   * na tela, quem usa consegue copiar e mandar.
   *
   * É o único lugar do app onde texto cru de erro pode aparecer, e a exceção é
   * deliberada: a regra do `ErroAcervo` — mensagem em português na tela, causa
   * crua só no console — existe para falhas **previstas**, que sabem se
   * explicar. Um erro de render não é previsto e não tem tradução; escondê-lo
   * não deixaria a tela mais gentil, deixaria só mais muda.
   */
  /**
   * Nem tudo que se lança é um `Error`.
   *
   * `throw 'texto'` é legal em JavaScript, e bibliotecas fazem isso — o
   * `.message` de uma string é `undefined`. Sem tratar, a tela de erro volta a
   * não dizer nada: um cartão com o título e um espaço em branco onde deveria
   * estar a única informação útil. Seria a tela branca de novo, menor.
   */
  test('um throw que não é Error ainda diz o que foi lançado', () => {
    function LancaTexto() {
      throw 'a biblioteca lançou uma string'
    }

    const container = montar(
      <LimiteDeErro>
        <LancaTexto />
      </LimiteDeErro>,
    )

    expect(container.textContent).toContain('a biblioteca lançou uma string')
  })

  test('a mensagem do erro aparece escrita', () => {
    const container = montar(
      <LimiteDeErro>
        <Explode mensagem="cidade.toLowerCase is not a function" />
      </LimiteDeErro>,
    )

    expect(container.textContent).toContain('cidade.toLowerCase is not a function')
  })

  /**
   * A pilha de componentes vai para o console, e ela é o diagnóstico.
   *
   * A mensagem na tela diz *o que* quebrou; só a pilha diz *onde*. Sem ela,
   * "cidade.toLowerCase is not a function" cabe em qualquer uma das cinco
   * abas. Com ela, o nome do componente vem escrito.
   *
   * Fica no console e não na tela pelo motivo de sempre: é texto para quem
   * desenvolve, e o `ErroAcervo` já registra que despejar diagnóstico na tela
   * de quem usa não ajuda ninguém.
   */
  test('escreve a mensagem e a pilha de componentes no console', () => {
    const espiao = vi.spyOn(console, 'error').mockImplementation(() => {})

    montar(
      <LimiteDeErro>
        <Explode mensagem="estourou no render" />
      </LimiteDeErro>,
    )

    const escrito = espiao.mock.calls.flat().map(String).join(' ')
    espiao.mockRestore()

    expect(escrito).toContain('estourou no render')
    expect(escrito).toContain('Explode')
  })
})

describe('LimiteDeErro: o caminho de volta', () => {
  /**
   * Um limite que captura e nunca solta troca a tela branca por uma tela
   * morta. O React não desfaz o estado de erro sozinho — enquanto o
   * componente não for remontado, o filho continua sem renderizar, mesmo que
   * a causa já não exista.
   *
   * O botão é a saída sem F5, e recarregar não é equivalente: a página perde
   * a busca corrente, que custou uma das 200 requisições do mês.
   */
  test('"Tentar de novo" volta a renderizar o conteúdo', () => {
    let quebrar = true
    function Instavel() {
      if (quebrar) throw new Error('quebrou uma vez')
      return <p>conteúdo de volta</p>
    }

    const container = montar(
      <LimiteDeErro>
        <Instavel />
      </LimiteDeErro>,
    )
    expect(container.textContent).toContain('quebrou uma vez')

    quebrar = false
    const botao = [...container.querySelectorAll('button')].find((b) =>
      /tentar de novo/i.test(b.textContent),
    )
    expect(botao, 'nenhum botão "Tentar de novo" na tela de erro').toBeDefined()

    act(() => botao.dispatchEvent(new MouseEvent('click', { bubbles: true })))

    expect(container.textContent).toContain('conteúdo de volta')
  })
})
