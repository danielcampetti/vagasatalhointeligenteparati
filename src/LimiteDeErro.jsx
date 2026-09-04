/**
 * O limite de erro: o que impede a página branca.
 *
 * ## O defeito que ele veio corrigir
 *
 * Em 04/09/2026 a aba Banco de Dados virou uma página inteiramente branca —
 * sem menu lateral, sem mensagem, sem caminho de volta. Não é metáfora: um
 * erro lançado durante o render, num React sem limite, desmonta a **árvore
 * inteira**, e o que sobra é o `<body>` vazio. Está na documentação do React,
 * e é comportamento, não bug.
 *
 * O preço disso não foi a tela feia, foi o diagnóstico. Quem viu só podia
 * dizer "ficou branco" — a mesma frase para erro de dado, extensão do
 * navegador ou defeito de código. Achar o que era custou reproduzir no
 * Railway, comparar o bundle publicado com o do `main` e simular a migração do
 * `localStorage`, e mesmo assim não reproduziu: o defeito dependia do estado
 * de um navegador que não é o meu. A mensagem que resolveria tudo existia o
 * tempo todo, no console daquele navegador, onde ninguém pensou em olhar
 * porque a tela não pedia.
 *
 * Este componente troca aquela tela por uma que se explica.
 *
 * ## Por que classe
 *
 * Não é escolha de estilo. `getDerivedStateFromError` e `componentDidCatch`
 * não têm equivalente em hook — capturar erro de render é a única coisa que o
 * React 19 ainda exige de um componente de classe. Um `try/catch` em volta do
 * JSX não serve: o corpo da função roda antes, e o erro acontece depois, no
 * commit.
 *
 * ## O que ele não captura
 *
 * Erro dentro de `onClick`, de `setTimeout` ou de `await` não passa por aqui —
 * são assíncronos, e o React já não os trata como falha de render. Quem cuida
 * deles é quem os escreve: o `try/catch` do `carregar()` e do `arquivar()` no
 * `App.jsx`, e o `ErroAcervo` do `acervoRemoto.js`. Este limite é a rede
 * embaixo do render, e só.
 *
 * ## Onde ele fica montado
 *
 * Em dois lugares, e os dois têm motivo:
 *
 * - no `main.jsx`, em volta do `<App />` — último recurso; captura o que
 *   quebrar no cabeçalho, no menu ou no próprio `App`;
 * - no `App.jsx`, em volta do conteúdo da aba e com `key={aba}` — para o
 *   estrago ficar **dentro** da aba, com o menu lateral vivo do lado. A `key`
 *   é o que faz trocar de aba limpar o erro: o React remonta o limite quando a
 *   chave muda, e um limite remontado nasce sem erro. Sem ela, uma aba que
 *   quebrasse deixaria o cartão de erro na tela para sempre.
 */

import { Component } from 'react'

/**
 * O texto que vai para a tela.
 *
 * `throw 'texto'` é legal em JavaScript e bibliotecas fazem isso; o `.message`
 * de uma string é `undefined`, e o cartão voltaria a não dizer nada — a tela
 * branca de novo, só que menor.
 */
function textoDoErro(erro) {
  return erro?.message || String(erro)
}

export class LimiteDeErro extends Component {
  state = { erro: null }

  static getDerivedStateFromError(erro) {
    return { erro }
  }

  /**
   * O diagnóstico vai para o console, e é a pilha que importa.
   *
   * A mensagem na tela diz *o que* quebrou; só a `componentStack` diz *onde*.
   * "cidade.toLowerCase is not a function" cabe em qualquer uma das cinco
   * abas — com a pilha, vem o nome do componente.
   *
   * Fica no console e não na tela pela regra que o `ErroAcervo` já registra:
   * diagnóstico é texto de quem desenvolve. A diferença é que agora a tela
   * **diz que o console tem mais**, que era o elo que faltava.
   */
  componentDidCatch(erro, info) {
    console.error('[limite] a tela quebrou:', erro, info?.componentStack)
  }

  render() {
    if (!this.state.erro) return this.props.children

    return (
      <div
        style={{
          padding: '64px 20px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <div
          style={{
            width: 50,
            height: 50,
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.08)',
            background: '#0E1729',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#E0A458"
            strokeWidth="1.7"
          >
            <path d="M12 3 2 20h20L12 3z" />
            <path d="M12 9v5" />
            <path d="M12 17h.01" />
          </svg>
        </div>

        <div style={{ fontSize: 15, fontWeight: 600 }}>
          Alguma coisa quebrou nesta tela.
        </div>

        <div
          style={{
            fontSize: 13,
            color: '#8A94A6',
            textAlign: 'center',
            maxWidth: 420,
            lineHeight: 1.6,
          }}
        >
          O resto do app continua de pé. Nenhuma vaga foi perdida — o acervo
          vive no servidor, e a cota do mês não foi tocada.
        </div>

        {/* A mensagem crua, na tela e selecionável.
            É o único lugar do app onde texto técnico aparece para quem usa, e a
            exceção é deliberada: a regra do `ErroAcervo` — português na tela,
            causa crua só no console — vale para falhas **previstas**, que sabem
            se explicar. Um erro de render não sabe, e escondê-lo não deixa a
            tela mais gentil: deixa muda, que foi exatamente o problema. */}
        <code
          style={{
            fontSize: 12,
            color: '#C8D1E0',
            background: '#0E1729',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 9,
            padding: '10px 12px',
            maxWidth: 460,
            overflowWrap: 'anywhere',
            userSelect: 'text',
          }}
        >
          {textoDoErro(this.state.erro)}
        </code>

        <div style={{ fontSize: 12, color: '#6E7789', textAlign: 'center' }}>
          Copie essa linha se for relatar. O console do navegador (F12) tem a
          pilha completa.
        </div>

        {/* Sem isto o limite trocaria a tela branca por uma tela morta: o React
            não desfaz o estado de erro sozinho, e o filho não volta a renderizar
            enquanto o limite não for remontado. Recarregar a página não é
            equivalente — ela perde a busca corrente, que custou uma das 200
            requisições do mês. */}
        <button
          type="button"
          onClick={() => this.setState({ erro: null })}
          className="bg-[#0E1729] text-[#C8D1E0] hover:bg-[#152039]"
          style={{
            padding: '8px 14px',
            borderRadius: 9,
            border: '1px solid rgba(255,255,255,0.12)',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Tentar de novo
        </button>
      </div>
    )
  }
}
