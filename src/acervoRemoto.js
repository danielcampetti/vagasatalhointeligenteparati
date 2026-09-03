/**
 * O acervo, agora do outro lado da rede.
 *
 * Substitui o `acervo.js` como fonte das vagas. A diferença que atravessa a
 * tela inteira é que estas funções são **assíncronas e podem falhar** — o
 * `localStorage` não fazia nem uma coisa nem outra.
 *
 * ## Falha nunca vira lista vazia
 *
 * É a regra que este módulo existe para garantir. Acervo vazio por queda de
 * rede é visualmente idêntico a acervo vazio de verdade, e a tela de vazio
 * aconselha "faça uma busca" — conselho errado, e o tipo de falha silenciosa
 * que o ONDE-PARAMOS já registra três vezes como a pior. Por isso erro lança
 * `ErroAcervo`, e quem chama decide o que mostrar.
 *
 * A exceção é o 404 de uma vaga: ele é **resposta**, não falha — a vaga saiu
 * do acervo pelo teto. Aí devolve `null`.
 */

const BASE = '/api/acervo'

export class ErroAcervo extends Error {
  constructor(mensagem, { status = 0, causa = '' } = {}) {
    super(mensagem)
    this.name = 'ErroAcervo'
    this.status = status
    /**
     * O texto cru de quem falhou, para o console — nunca para a tela.
     *
     * A mensagem do `fetch` é fixada em inglês pelos browsers ("Failed to
     * fetch" no Chromium), independentemente do idioma do usuário. Concatená-la
     * na `message` punha inglês na única tela que existe para explicar a falha.
     * Aqui ela continua disponível para diagnóstico sem chegar a quem lê.
     */
    this.causa = causa
  }
}

/**
 * Uma ida ao servidor, com as duas falhas separadas.
 *
 * `fetch` só rejeita quando a requisição não sai; status de erro chega como
 * resposta normal e precisa ser conferido à mão. Confundir os dois é como um
 * 500 vira "tudo certo, acervo vazio".
 */
async function ida(caminho, opcoes) {
  let res
  try {
    res = await fetch(`${BASE}${caminho}`, opcoes)
  } catch (err) {
    throw new ErroAcervo(
      'Não foi possível falar com o servidor do acervo. Ele pode estar fora do ar.',
      { causa: err.message },
    )
  }

  let corpo = null
  try {
    corpo = await res.json()
  } catch {
    // Deixa nulo: tratado abaixo conforme o status.
  }

  if (!res.ok) {
    throw new ErroAcervo(
      corpo?.message || `O servidor respondeu ${res.status}.`,
      { status: res.status },
    )
  }

  return corpo
}

const COMO_JSON = { 'content-type': 'application/json' }

/** Todas as vagas do acervo, sem descrição. Lança quando não dá para saber. */
export async function lerAcervoRemoto() {
  const corpo = await ida('')
  return Array.isArray(corpo?.vagas) ? corpo.vagas : []
}

/**
 * Arquiva o que uma busca trouxe e devolve o acervo atualizado.
 *
 * Lista vazia não vai à rede: a busca sem resultado chamaria isto, e o
 * servidor devolveria o acervo inteiro para nada.
 */
export async function guardarVagasRemoto(vagas) {
  const lista = Array.isArray(vagas) ? vagas : []
  if (lista.length === 0) return []

  const corpo = await ida('', {
    method: 'POST',
    headers: COMO_JSON,
    body: JSON.stringify({ vagas: lista }),
  })
  return Array.isArray(corpo?.vagas) ? corpo.vagas : []
}

/** 404 vira `null`: a vaga saiu pelo teto, e isso é resposta, não falha. */
function nuloNoQuatroCentoQuatro(err) {
  if (err instanceof ErroAcervo && err.status === 404) return null
  throw err
}

/** A vaga inteira, com descrição — para a página de detalhe. */
export async function buscarVagaRemota(id) {
  return ida(`/${encodeURIComponent(id)}`).catch(nuloNoQuatroCentoQuatro)
}

/** Liga `fav`, `seen` ou `rank`. Outros campos o servidor ignora. */
export async function atualizarVagaRemota(id, campos) {
  return ida(`/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: COMO_JSON,
    body: JSON.stringify(campos),
  }).catch(nuloNoQuatroCentoQuatro)
}
