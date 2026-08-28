/**
 * O texto da espera das duas abas que buscam vagas, e a decisão de esperar.
 *
 * Antes desta mudança a tabela aparecia assim que a JSearch respondia, e as
 * notas caíam em cima dela alguns segundos depois. Funcionava, mas lia como
 * defeito: a lista já estava pronta e a coluna Rank IA seguia em "—", sem nada
 * dizendo que ainda vinha coisa. Agora a tabela espera as duas etapas, para
 * vaga e nota chegarem juntas.
 *
 * O preço dessa escolha é que o tempo até aparecer *qualquer coisa* sobe de
 * ~2s para ~25s, e espera longa sem explicação lê como travamento — o mesmo
 * problema por outro caminho. É por isso que a fase tem nome e o nome muda no
 * meio: a troca de mensagem é o que sinaliza que algo está andando. Um spinner
 * mudo por 25 segundos seria pior que o comportamento que isto veio corrigir.
 *
 * Aqui só mora a decisão de texto, sem JSX, para poder ser testada — o projeto
 * não tem harness de teste de componente, e uma regra de tela que ninguém
 * consegue testar é onde a mentira se instala (ver a armadilha do rótulo do
 * Rank IA no ONDE-PARAMOS, que já mentiu duas vezes).
 */

/**
 * O que mostrar no lugar da tabela, ou `null` quando é hora de mostrá-la.
 *
 * `quantas` é o tamanho da lista que está sendo pontuada. Quem chama tem essa
 * lista na mão, mas o caso de ela faltar cai numa frase sem número em vez de
 * escrever "undefined" na tela.
 */
export function faseDaBusca({ buscando, ranqueando, quantas } = {}) {
  // A ordem importa: buscar é a etapa anterior. No fluxo de hoje as duas nunca
  // estão ligadas juntas — `ranquearBanco` só roda depois do `finally` que
  // desliga `buscando` —, mas anunciar a IA antes da hora seria mentira na
  // tela, e essa é uma classe de defeito que este projeto já teve.
  if (buscando) {
    return { texto: 'Consultando a API de vagas...', detalhe: null }
  }

  if (ranqueando) {
    const quantasVagas =
      quantas > 0 ? `${quantas} ${quantas === 1 ? 'vaga' : 'vagas'}` : 'as vagas'
    return {
      texto: `Avaliando ${quantasVagas} com a IA...`,
      detalhe: 'As vagas aparecem junto com a nota, em alguns segundos.',
    }
  }

  return null
}
