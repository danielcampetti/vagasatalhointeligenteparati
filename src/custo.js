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

/** US$ por 1M de tokens. Fonte: precificação da Anthropic. */
export const PRECOS = {
  'claude-opus-5': { entrada: 5, saida: 25 },
}

/** Teto mensal de partida. Seguro barato contra um bug de laço. */
export const LIMITE_PADRAO_USD = 5

const CHAVE = 'vagas:custo'

const VAZIO = { desde: null, chamadas: [], teto: LIMITE_PADRAO_USD }

export function lerCusto() {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return { ...VAZIO, chamadas: [] }
    const dados = JSON.parse(cru)
    return {
      desde: typeof dados.desde === 'string' ? dados.desde : null,
      chamadas: Array.isArray(dados.chamadas) ? dados.chamadas : [],
      teto:
        typeof dados.teto === 'number' && dados.teto > 0
          ? dados.teto
          : LIMITE_PADRAO_USD,
    }
  } catch {
    return { ...VAZIO, chamadas: [] }
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
 */
export function registrarChamada(tipo, uso, modelo, agora = new Date()) {
  const custo = lerCusto()
  const quando = agora.toISOString()
  return gravar({
    ...custo,
    desde: custo.desde ?? quando,
    chamadas: [
      {
        quando,
        tipo,
        entrada: uso?.input_tokens ?? 0,
        saida: uso?.output_tokens ?? 0,
        modelo,
      },
      ...custo.chamadas,
    ].slice(0, 200),
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

export function excedeuTeto(custo) {
  return dolares(custo.chamadas) >= custo.teto
}

export function zerarCusto(agora = new Date()) {
  const custo = lerCusto()
  return gravar({ ...custo, desde: agora.toISOString(), chamadas: [] })
}

export function definirTeto(usd) {
  return gravar({ ...lerCusto(), teto: usd })
}
