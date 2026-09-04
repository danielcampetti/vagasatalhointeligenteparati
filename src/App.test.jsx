import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, describe, expect, test } from 'vitest'
import { Linha, PainelControle } from './App'

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

/**
 * O painel Controle, depois que o número deixou de ser deste navegador.
 *
 * A cota mora no servidor agora, e chegar até ela é uma ida à rede — que pode
 * não voltar. O painel ganhou os mesmos três estados do acervo
 * (`carregando`/`pronto`/`falhou`) pela mesma razão, só que mais cara: um
 * acervo vazio por queda de rede aconselha "faça uma busca"; um contador
 * zerado por queda de rede diz "você tem as 200 inteiras" para quem já gastou
 * 180 — e quem acreditar gasta dinheiro de verdade.
 */
describe('PainelControle: falha nunca vira zero', () => {
  const CUSTO = { chamadas: [], teto: 5 }

  const painel = (extra) => (
    <PainelControle
      cota={{ desde: null, rede: 0, usos: [], protegido: false }}
      estado="falhou"
      erro="O servidor respondeu 500."
      doCache={0}
      onTentarDeNovo={() => {}}
      onZerar={() => {}}
      onAjustar={() => {}}
      onLimparCache={() => {}}
      custo={CUSTO}
      onZerarCusto={() => {}}
      segredo=""
      onSegredo={() => {}}
      {...extra}
    />
  )

  test('estado falhou mostra o erro, e não o número zero', () => {
    const container = montar(painel())

    expect(container.textContent).toContain('O servidor respondeu 500.')
    expect(container.textContent).not.toContain('0 / 200')
  })

  /**
   * `carregando` é o primeiro render de toda abertura da aba — antes de a
   * resposta chegar, o `cota` em estado ainda é o inicial, com `rede: 0`.
   * Desenhá-lo mostraria 0/200 por um instante em toda visita, e é exatamente
   * esse número que não pode aparecer sem ser verdade.
   */
  test('estado carregando também não mostra número', () => {
    const container = montar(painel({ estado: 'carregando', erro: '' }))

    expect(container.textContent).toContain('Lendo a cota')
    expect(container.textContent).not.toContain('0 / 200')
  })

  /**
   * E o caminho normal continua desenhando o número — senão a correção
   * poderia ser "nunca mostrar a cota", que passa nos dois testes acima e
   * apaga a aba inteira.
   */
  test('estado pronto mostra o número que veio do servidor', () => {
    const container = montar(
      painel({
        estado: 'pronto',
        erro: '',
        cota: { desde: null, rede: 180, usos: [], protegido: false },
      }),
    )

    expect(container.textContent).toContain('180')
    expect(container.textContent).toContain('/ 200 requisições')
  })

  /**
   * "Zerar" e "Ajustar" também vão à rede, e também podem falhar — com 403,
   * inclusive, que é o caso comum: a senha do controle errada.
   *
   * Falhar neles não derruba o painel (o número que já veio continua certo),
   * então o estado segue 'pronto'. Mas o erro precisa aparecer mesmo assim:
   * sem esta linha, apertar "Zerar contagem" com a senha errada não faz
   * absolutamente nada visível, e o dono conclui que zerou.
   */
  test('erro com o painel pronto aparece como aviso, sem esconder o número', () => {
    const container = montar(
      painel({
        estado: 'pronto',
        erro: 'Senha do controle ausente ou errada.',
        cota: { desde: null, rede: 180, usos: [], protegido: true },
      }),
    )

    expect(container.textContent).toContain('Senha do controle ausente ou errada.')
    expect(container.textContent).toContain('180')
  })
})

/**
 * O histórico também mudou de dono, e com ele o que cada linha significa.
 *
 * A lista local misturava rede e cache e trazia `termo`/`cidade` separados. A
 * do servidor só tem o que saiu para a rede — o cache nunca chegou lá —, com
 * a `consulta` já montada e o `status` da resposta. O ponto colorido, que
 * antes dizia rede-ou-cache, passa a dizer se a requisição valeu alguma
 * coisa: gastar uma das 200 num 4xx é o que merece ser visto de longe.
 */
describe('PainelControle: o histórico do servidor', () => {
  const USO = {
    quando: '2026-09-04T12:00:00.000Z',
    consulta: 'Técnico de TI in Caxias do Sul',
    janela: 'month',
    remotas: false,
    continuacao: false,
    status: 200,
  }

  const pronto = (usos) =>
    montar(
      <PainelControle
        cota={{ desde: null, rede: 3, usos, protegido: false }}
        estado="pronto"
        erro=""
        doCache={0}
        onTentarDeNovo={() => {}}
        onZerar={() => {}}
        onAjustar={() => {}}
        onLimparCache={() => {}}
        custo={{ chamadas: [], teto: 5 }}
        onZerarCusto={() => {}}
        segredo=""
        onSegredo={() => {}}
      />,
    )

  test('a linha mostra a consulta e o status da resposta', () => {
    const container = pronto([USO])

    expect(container.textContent).toContain('Técnico de TI in Caxias do Sul')
    expect(container.textContent).toContain('200')
  })

  test('uma requisição que falhou mostra o status dela, e não some da lista', () => {
    const container = pronto([{ ...USO, status: 429 }])

    expect(container.textContent).toContain('429')
  })

  /**
   * `continuacao` separa a busca da página seguinte. Sem a marca, duas linhas
   * com a mesma consulta no mesmo minuto pareceriam cobrança dobrada pela
   * mesma pergunta — quando na verdade a segunda é o "Carregar mais", que é
   * uma requisição legítima e diferente.
   */
  test('a página seguinte se distingue da busca que a originou', () => {
    const container = pronto([{ ...USO, continuacao: true }])

    expect(container.textContent).toContain('página seguinte')
  })

  /**
   * O mesmo `.map` que derrubou a aba Banco de Dados (ver `Linha`, acima).
   * O `cotaRemota.js` garante que a resposta é JSON; não garante o formato, e
   * um servidor em atualização é exatamente quando o painel mais precisa
   * desenhar o que já sabe.
   */
  test('histórico que não é lista não derruba o painel', () => {
    const container = pronto(undefined)

    expect(container.textContent).toContain('/ 200 requisições')
  })
})
