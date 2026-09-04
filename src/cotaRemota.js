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

  // Mesma guarda, agora sobre o número em si: veio JSON, mas `rede` não é um
  // inteiro não-negativo — um rename de campo no servidor, por exemplo. Sem
  // isto o defeito não é a tela quebrar: é `App.jsx` fazer `Math.max(0, 200 -
  // null)` e desenhar "200 requisições restantes" com a barra verde — a
  // mentira que este módulo existe para impedir, só que em branco em vez de
  // zero, o que o teste do `corpo === null` acima não pega.
  if (!Number.isInteger(corpo.rede) || corpo.rede < 0) {
    throw new ErroCota(
      'O servidor respondeu uma cota sem número válido. Ele pode estar em atualização.',
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
