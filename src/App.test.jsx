import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import App, { Linha, PainelControle } from './App'

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

  /**
   * A asserção do "não" mira `'/ 200 requisições'`, e a escolha tem história.
   *
   * A primeira versão dela procurava `'0 / 200'` — uma string que o painel
   * **nunca** produz: o número e o "/ 200 requisições" são dois `<span>`
   * irmãos sem espaço entre eles, então o `textContent` sai `'0/ 200
   * requisições'`. O teste escrito para travar a regra que este plano inteiro
   * existe para garantir passava com a proteção removida.
   *
   * `'/ 200 requisições'` é o rótulo do cartão do número, e ele só existe no
   * ramo 'pronto'. Procurá-lo é perguntar "o cartão do número foi
   * desenhado?", que é a pergunta certa — e não depende de o número ser zero,
   * nem de como o React junta os nós de texto.
   */
  test('estado falhou mostra o erro, e não o número zero', () => {
    const container = montar(painel())

    expect(container.textContent).toContain('O servidor respondeu 500.')
    expect(container.textContent).not.toContain('/ 200 requisições')
    // A segunda metade da mentira: "20 requisições restantes" é tão cara
    // quanto o número em si, e mora noutro parágrafo do mesmo cartão.
    expect(container.textContent).not.toContain('requisições restantes')
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
    expect(container.textContent).not.toContain('/ 200 requisições')
    expect(container.textContent).not.toContain('requisições restantes')
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

  /**
   * Existe um nó, sem filhos de elemento, cujo texto (aparado) é exatamente
   * `texto`? `toContain` de string casa substring em qualquer lugar da
   * árvore; isto casa um span específico, do jeito exato como o painel o
   * desenha — é o que distingue a coluna de status de qualquer outro lugar
   * onde o mesmo número apareça de raspão, como parte de outro rótulo.
   */
  function folhaComTexto(container, texto) {
    return [...container.querySelectorAll('*')].some(
      (el) => el.children.length === 0 && el.textContent.trim() === texto,
    )
  }

  /**
   * Não `toContain('200')`: essa string já aparece sempre, com `rede: 3` e
   * qualquer status, no rótulo "/ 200 requisições" do cartão do número — a
   * asserção passava mesmo com a coluna de status inteiramente apagada.
   * `folhaComTexto` procura um nó-folha cujo texto é *exatamente* '200', sem
   * mais nada em volta, e só a coluna de status desenha um assim: o rótulo
   * do cartão é "/ 200 requisições" por inteiro, nunca '200' sozinho.
   */
  test('a linha mostra a consulta e o status da resposta', () => {
    const container = pronto([USO])

    expect(container.textContent).toContain('Técnico de TI in Caxias do Sul')
    expect(folhaComTexto(container, '200')).toBe(true)
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

/**
 * O número não pode envelhecer na tela — e envelhecer só tem uma direção.
 *
 * O `0 / 200` por queda de rede é o caso agudo; este é o crônico, e mente na
 * mesma direção. A página carrega com 180/200, a pessoa faz 15 buscas, abre
 * Controle para decidir se continua, e lê **180 / 200, "20 requisições
 * restantes"**, com a barra ainda em âmbar. A verdade é 195 e 5 restantes.
 * Pior: a lista "Últimas requisições" está defasada do mesmo jeito, então as
 * buscas da própria sessão não aparecem — e o número parece corroborado por
 * ela.
 *
 * A leitura, portanto, é atrelada à aba: quem abre o Controle recebe o número
 * daquele momento. E só a essa aba — trocar entre Vagas e Banco de Dados não
 * pode disparar requisição nenhuma ao servidor da cota.
 */
describe('a cota é lida quando o painel é aberto, não uma vez por carregamento', () => {
  let pedidos
  let fetchOriginal

  /**
   * Um `fetch` de mentira que só anota quem foi chamado.
   *
   * Objeto cru e não `Response`: o `cotaRemota.js` e o `acervoRemoto.js` usam
   * `ok`, `status` e `json()`, e mais nada — um dublê com a superfície exata
   * do que é consumido falha alto se alguém passar a depender de outra coisa.
   *
   * Atribuição crua, e não `vi.spyOn` — e é por isso que o `afterEach` abaixo
   * existe e não pode ser trocado por `vi.restoreAllMocks()`: este último não
   * desfaz uma atribuição direta em `globalThis.fetch`, só reverte espiões.
   * Sem restaurar à mão, o próximo `describe` deste arquivo herdaria este
   * `fetch`, que responde qualquer URL fora de `/api/cota` com `[]` — um
   * futuro teste de `lerAcervoRemoto` passaria olhando um acervo vazio que
   * nunca pediu, pelo motivo errado.
   */
  beforeEach(() => {
    pedidos = []
    fetchOriginal = globalThis.fetch
    globalThis.fetch = async (url) => {
      const caminho = String(url)
      pedidos.push(caminho)
      const corpo = caminho.startsWith('/api/cota')
        ? { desde: null, rede: 3, usos: [], protegido: false }
        : []
      return { ok: true, status: 200, json: async () => corpo }
    }
  })

  afterEach(() => {
    globalThis.fetch = fetchOriginal
  })

  const daCota = () => pedidos.filter((p) => p.startsWith('/api/cota')).length

  async function montarApp() {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const raiz = createRoot(container)
    raizes.push({ raiz, container })
    // `act` assíncrono para as promessas dos efeitos assentarem antes das
    // asserções — sem ele o teste leria o estado do render que antecede a
    // resposta.
    await act(async () => raiz.render(<App />))
    return container
  }

  /** Clica no item de navegação pelo texto — é assim que a pessoa troca de aba. */
  async function irPara(container, nome) {
    const item = [...container.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === nome,
    )
    expect(item, `não achei a aba "${nome}"`).toBeTruthy()
    await act(async () => item.click())
  }

  test('carregar a página com outra aba aberta não pede a cota', async () => {
    await montarApp()

    expect(daCota()).toBe(0)
  })

  test('abrir o Controle lê a cota do momento', async () => {
    const container = await montarApp()
    await irPara(container, 'Controle')

    expect(daCota()).toBe(1)
    expect(container.textContent).toContain('/ 200 requisições')
  })

  // O caso do defeito: sair e voltar tem que trazer número novo, porque entre
  // uma coisa e outra a pessoa buscou.
  test('voltar ao Controle depois de buscar lê de novo', async () => {
    const container = await montarApp()
    await irPara(container, 'Controle')
    await irPara(container, 'Vagas')
    await irPara(container, 'Controle')

    expect(daCota()).toBe(2)
  })

  // E o outro lado da regra: não é uma requisição por troca de aba.
  test('trocar entre abas que não são o Controle não pede a cota', async () => {
    const container = await montarApp()
    await irPara(container, 'Banco de Dados')
    await irPara(container, 'Vagas')
    await irPara(container, 'Banco de Dados')

    expect(daCota()).toBe(0)
  })
})
