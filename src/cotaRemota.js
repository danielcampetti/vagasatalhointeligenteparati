/**
 * A cota, do outro lado da rede.
 *
 * Irmão do `acervoRemoto.js`, e pelas mesmas razões — inclusive a que dá nome
 * ao arquivo dele: **falha nunca vira zero**.
 *
 * Aqui isso é mais grave que no acervo. Um acervo vazio por queda de rede
 * aconselha "faça uma busca"; um contador zerado por queda de rede diz "você
 * tem as 200 inteiras" para quem já gastou 180, e quem acreditar gasta
 * dinheiro. Por isso erro lança, e quem chama decide o que a tela mostra.
 */

const BASE = '/api/cota'

export class ErroCota extends Error {
  constructor(mensagem, { status = 0, causa = '' } = {}) {
    super(mensagem)
    this.name = 'ErroCota'
    this.status = status
    // O texto cru de quem falhou, para o console — nunca para a tela. A
    // mensagem do `fetch` é fixada em inglês pelos browsers.
    this.causa = causa
  }
}

async function ida(caminho, opcoes) {
  let res
  try {
    res = await fetch(`${BASE}${caminho}`, opcoes)
  } catch (err) {
    throw new ErroCota(
      'Não foi possível falar com o servidor da cota. Ele pode estar fora do ar.',
      { causa: err.message },
    )
  }

  let corpo = null
  try {
    corpo = await res.json()
  } catch {
    // Tratado abaixo conforme o status.
  }

  if (!res.ok) {
    throw new ErroCota(corpo?.message || `O servidor respondeu ${res.status}.`, {
      status: res.status,
    })
  }

  // 200 com corpo que não é JSON é falha, não cota zerada. O catch-all da SPA
  // responde `index.html` para qualquer rota desconhecida: renomear
  // `/api/cota` numa manutenção futura transformaria o painel em 0/200.
  if (corpo === null) {
    throw new ErroCota(
      'O servidor respondeu algo que não é a cota. Ele pode estar em atualização.',
      { status: res.status },
    )
  }

  return corpo
}

/** O que o painel desenha. Lança quando não dá para saber. */
export async function lerCotaRemota() {
  return ida('')
}

const COMO_JSON = { 'content-type': 'application/json' }

/** O header do segredo, omitido quando não há — servidor aberto o aceita assim. */
function comSegredo(segredo) {
  return segredo ? { 'x-controle-segredo': segredo } : {}
}

export async function zerarRemoto(segredo = '') {
  return ida('/zerar', { method: 'POST', headers: comSegredo(segredo) })
}

export async function ajustarRemoto(gastas, segredo = '') {
  return ida('/ajustar', {
    method: 'POST',
    headers: { ...COMO_JSON, ...comSegredo(segredo) },
    body: JSON.stringify({ gastas }),
  })
}
