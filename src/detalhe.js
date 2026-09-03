/**
 * De onde sai a vaga que a página de detalhe mostra.
 *
 * Existiu uma lista só — o `banco` — até a página de detalhe passar a abrir
 * também da aba Vaga Inteligente. A lista dela (`vagasIa`) é separada de
 * propósito: repor o `banco` com o resultado da busca inteligente vazaria os
 * resultados de uma aba para a outra (ver o comentário de `ranquearIa`).
 *
 * A terceira é o `acervo`, e ela entrou depois — junto com a correção que fez
 * a aba Banco de Dados acumular. Enquanto as duas abas liam o `banco`, procurar
 * ali dava conta das duas; quando a Banco de Dados passou a ler o acervo,
 * abrir uma vaga de lá parou de achar coisa nenhuma. O clique marcava como
 * lida e não abria nada — a vaga estava na tela, na frente de quem clicou.
 *
 * A lição é a de sempre com esta função: **toda lista que vira linha na tela
 * precisa estar aqui**. Ela é o ponto único onde "o que a tela mostra" e "o
 * que a página de detalhe encontra" se reconciliam, e uma lista nova que
 * esqueça de passar por aqui vira página em branco.
 */

/**
 * A vaga de id `aberta`, ou `null`.
 *
 * A ordem não é arbitrária: a mesma vaga cai em mais de uma lista, e vence a
 * cópia com mais informação.
 *
 *   banco    a busca corrente — o dado mais recente da API (salário e dias
 *            podem ter mudado desde que a vaga entrou no acervo), e carrega
 *            `seen`, `fav` e `status`
 *   acervo   o que ficou guardado: também tem `seen` e `fav`, mas os campos da
 *            API são do dia em que entrou
 *   vagasIa  só o que a busca inteligente devolveu; nunca teve estado de tela
 *
 * Cada uma só perde para quem tem tudo o que ela tem, e mais.
 */
export function acharVaga(aberta, banco = [], vagasIa = [], acervo = []) {
  if (!aberta) return null
  return (
    banco.find((v) => v.id === aberta) ??
    acervo.find((v) => v.id === aberta) ??
    vagasIa.find((v) => v.id === aberta) ??
    null
  )
}
