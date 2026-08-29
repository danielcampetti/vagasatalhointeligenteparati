/**
 * De onde sai a vaga que a página de detalhe mostra.
 *
 * Existiu uma lista só — o `banco` — até a página de detalhe passar a abrir
 * também da aba Vaga Inteligente. A lista dela (`vagasIa`) é separada de
 * propósito: repor o `banco` com o resultado da busca inteligente vazaria os
 * resultados de uma aba para a outra (ver o comentário de `ranquearIa`). Como
 * as duas listas coexistem, quem procura a vaga aberta precisa olhar as duas.
 */

/**
 * A vaga de id `aberta`, ou `null`.
 *
 * O `banco` vem primeiro, e isso não é arbitrário: a mesma vaga cai nas duas
 * listas quando se busca o mesmo cargo e a mesma cidade nas duas abas, e a
 * cópia do banco carrega `seen`, `fav` e `status` — estado de tela que a cópia
 * da Vaga Inteligente nunca teve. A da IA não tem nada que a do banco não
 * tenha, então preferir o banco só ganha informação.
 */
export function acharVaga(aberta, banco = [], vagasIa = []) {
  if (!aberta) return null
  return (
    banco.find((v) => v.id === aberta) ??
    vagasIa.find((v) => v.id === aberta) ??
    null
  )
}
