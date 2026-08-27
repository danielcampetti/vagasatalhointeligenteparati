/**
 * Quanto a Claude já custou neste ciclo.
 *
 * O `cota.js` cuida das 200 requisições mensais do JSearch — uma contagem, com
 * teto imposto pelo provedor. Aqui a unidade é outra: dólares por token, sem
 * teto nenhum do lado de lá. A Claude só para quando o cartão para, então o
 * teto é nosso.
 *
 * Guarda token, calcula dólar na leitura. Preço muda; um valor em dólar gravado
 * vira mentira no dia do reajuste. Token é fato.
 */

/**
 * US$ por 1M de tokens. Fonte: precificação da Anthropic.
 *
 * `claude-opus-5` não é mais o MODELO ativo (trocado por `claude-sonnet-5`
 * para baratear), mas a entrada fica: chamadas antigas gravadas no
 * localStorage do aluno ainda citam esse modelo em `chamadas[].modelo`, e
 * `dolares()` trata modelo fora da tabela como US$ 0 — apagar a entrada
 * zeraria o gasto histórico em silêncio, não só o futuro.
 */
export const PRECOS = {
  'claude-opus-5': { entrada: 5, saida: 25 },
  'claude-sonnet-5': { entrada: 2, saida: 10 },
}

/** Teto mensal de partida. Seguro barato contra um bug de laço. */
export const LIMITE_PADRAO_USD = 5

const CHAVE = 'vagas:custo'

const VAZIO = { desde: null, chamadas: [], teto: LIMITE_PADRAO_USD, acumulado: {} }

/**
 * `dados.acumulado` inválido ou ausente (localStorage de antes desta
 * correção, ou valor adulterado) vira `{}` — não recomputado a partir de
 * `chamadas`, porque `chamadas` já é só o anel das 200 mais recentes e
 * reconstituir dali reintroduziria o mesmo viés que este campo existe para
 * evitar. Um aluno que atualiza no meio do ciclo perde o acumulado até ali;
 * mais seguro que inventar um número.
 */
function acumuladoValido(bruto) {
  if (!bruto || typeof bruto !== 'object') return {}
  const limpo = {}
  for (const [modelo, tokens] of Object.entries(bruto)) {
    const entrada = Number(tokens?.entrada)
    const saida = Number(tokens?.saida)
    if (Number.isFinite(entrada) && Number.isFinite(saida)) {
      limpo[modelo] = { entrada, saida }
    }
  }
  return limpo
}

export function lerCusto() {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return { ...VAZIO, chamadas: [], acumulado: {} }
    const dados = JSON.parse(cru)
    return {
      desde: typeof dados.desde === 'string' ? dados.desde : null,
      chamadas: Array.isArray(dados.chamadas) ? dados.chamadas : [],
      teto:
        typeof dados.teto === 'number' && dados.teto > 0
          ? dados.teto
          : LIMITE_PADRAO_USD,
      acumulado: acumuladoValido(dados.acumulado),
    }
  } catch {
    return { ...VAZIO, chamadas: [], acumulado: {} }
  }
}

function gravar(custo) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(custo))
  } catch {
    // Storage cheio ou bloqueado: o medidor vira volátil nesta sessão, mas a
    // chamada em si não tem por que falhar.
  }
  return custo
}

/**
 * `uso` é o `response.usage` do SDK. Modelo desconhecido é guardado do mesmo
 * jeito — o registro é histórico, e o preço a gente resolve na leitura.
 *
 * `chamadas` grava só as 200 mais recentes (`.slice(0, 200)`, logo abaixo) —
 * é o histórico que a aba Controle lista, não precisa de mais. `acumulado`,
 * ao lado, soma para sempre, sem `slice`: é dele que `excedeuTeto` lê. Ver o
 * comentário do próprio `acumulado`, mais abaixo, para o porquê dos dois
 * existirem separados.
 */
export function registrarChamada(tipo, uso, modelo, agora = new Date()) {
  const custo = lerCusto()
  const quando = agora.toISOString()
  const entrada = uso?.input_tokens ?? 0
  const saida = uso?.output_tokens ?? 0
  const acumuladoDoModelo = custo.acumulado[modelo] ?? { entrada: 0, saida: 0 }
  return gravar({
    ...custo,
    desde: custo.desde ?? quando,
    chamadas: [
      { quando, tipo, entrada, saida, modelo },
      ...custo.chamadas,
    ].slice(0, 200),
    acumulado: {
      ...custo.acumulado,
      [modelo]: {
        entrada: acumuladoDoModelo.entrada + entrada,
        saida: acumuladoDoModelo.saida + saida,
      },
    },
  })
}

/**
 * Modelo fora da tabela conta como zero em vez de lançar: um preço
 * desconhecido não pode derrubar a aba Controle.
 */
export function dolares(chamadas) {
  return chamadas.reduce((soma, c) => {
    const preco = PRECOS[c.modelo]
    if (!preco) return soma
    return soma + (c.entrada * preco.entrada + c.saida * preco.saida) / 1_000_000
  }, 0)
}

/**
 * `acumulado` é `{ [modelo]: { entrada, saida } }` — token, não dólar, pela
 * mesma razão do arquivo inteiro (comentário do topo): preço muda, token é
 * fato. Reaproveita `dolares()` tratando cada modelo acumulado como se fosse
 * uma "chamada" só, com o total de tokens daquele modelo.
 */
export function dolaresAcumulados(acumulado) {
  return dolares(
    Object.entries(acumulado ?? {}).map(([modelo, tokens]) => ({
      modelo,
      entrada: tokens.entrada,
      saida: tokens.saida,
    })),
  )
}

/**
 * Corrigido depois de revisão: isto lia `dolares(custo.chamadas)` — o anel
 * das 200 mais recentes. Com `claude-opus-5` (US$5/25) 200 chamadas somavam
 * mais que um teto de poucos dólares antes do anel girar, então o defeito
 * não aparecia. Com `claude-sonnet-5` (US$2/10, a troca que fizemos para
 * baratear) 200 chamadas não somam mais tanto assim, e o anel passou a girar
 * de verdade: a partir da 201ª chamada, uma velha sai do anel a cada nova
 * que entra, e `dolares(custo.chamadas)` pode CAIR em vez de subir — o teto
 * deixando de disparar bem quando mais se gastou, não menos. `acumulado`
 * nunca gira, então é a base certa para o teto; `chamadas` continua servindo
 * só à lista da tela.
 */
export function excedeuTeto(custo) {
  return dolaresAcumulados(custo.acumulado) >= custo.teto
}

export function zerarCusto(agora = new Date()) {
  const custo = lerCusto()
  return gravar({ ...custo, desde: agora.toISOString(), chamadas: [], acumulado: {} })
}

export function definirTeto(usd) {
  return gravar({ ...lerCusto(), teto: usd })
}
