/**
 * A janela de publicação: quão recente uma vaga precisa ser para entrar na
 * lista.
 *
 * Este módulo é dono do conceito inteiro — o valor que vai para a API
 * (`date_posted`), o rótulo em português do dropdown, e o corte local em
 * dias. Ficarem juntos é o que impede o caso em que a tela diz "Última
 * semana" e a requisição pede outra coisa.
 *
 * ## Por que existe um corte local, se a API já tem o parâmetro
 *
 * Porque a API não cumpre o que promete. Sete requisições reais em
 * 2026-09-02, mesma consulta ("Técnico de TI em Caxias do Sul, RS",
 * country=br, language=pt), variando só o `date_posted`:
 *
 *   (ausente)  10 vagas — 9, 20, 21, 22, 26 dias + 5 sem data
 *   all        10 vagas — idem
 *   today       0 vagas
 *   3days       0 vagas
 *   week       10 vagas — 9, 21, 22, 26 dias + 5 sem data
 *   month      10 vagas — 9 a 27 dias, nenhuma sem data
 *
 * `today` e `3days` filtram de verdade. `week` voltou vaga de 26 dias: a
 * janela *mais estreita* deixou passar mais coisa velha que a *mais larga*.
 * Não dá para confiar o corte só à API, então ele acontece duas vezes — lá
 * para economizar transferência, aqui para valer.
 *
 * ## Por que vaga sem data é descartada
 *
 * Era esse o segundo defeito: vaga encerrada aparecendo na lista. A resposta
 * do `search-v2` **não tem campo de expiração** — conferi a união dos campos
 * das 10 vagas, são 35 e nenhum é de validade. Não existe como perguntar à
 * API se o anúncio caiu.
 *
 * O que existe é a correlação: as 5 vagas sem `job_posted_at` vinham de
 * agregadores que copiam anúncio e nunca o tiram do ar (Jobfy, Solides
 * Vagas, Empregos Hub, BNE) — e `date_posted=month` devolveu zero delas.
 * Idade desconhecida é o proxy mais próximo de "encerrada" que a resposta
 * oferece, e quem escolheu uma janela pediu vagas recentes, não vagas de
 * idade incerta.
 *
 * Em 'Qualquer data' elas voltam a aparecer, porque aí o pedido foi ver tudo.
 */

/**
 * `month` e não `all`: era o `all` — o comportamento anterior, que nem
 * mandava o parâmetro — que deixava as vagas sem data entrarem.
 */
export const JANELA_PADRAO = 'month'

/**
 * `valor` é o que a API recebe em `date_posted`, sem tradução no meio.
 * `dias` é o teto do corte local; `null` significa "não corta".
 */
export const JANELAS = [
  { valor: 'today', rotulo: 'Hoje', dias: 0 },
  { valor: '3days', rotulo: 'Últimos 3 dias', dias: 3 },
  { valor: 'week', rotulo: 'Última semana', dias: 7 },
  { valor: 'month', rotulo: 'Último mês', dias: 30 },
  { valor: 'all', rotulo: 'Qualquer data', dias: null },
]

/** A janela pelo valor, ou `undefined` se o valor não for de nenhuma. */
export function janelaDe(valor) {
  return JANELAS.find((j) => j.valor === valor)
}

/**
 * Separa o que cabe na janela do que não cabe.
 *
 * Devolve a contagem do que saiu junto com o que ficou porque a tela precisa
 * das duas coisas: uma busca que trouxe 10 vagas e mostrou 2 sem explicar
 * pareceria uma busca quebrada.
 *
 * Janela desconhecida — gravada por uma versão anterior, ou adulterada no
 * localStorage — não filtra nada. Esvaziar a tabela em silêncio por causa de
 * uma string estranha seria o pior desfecho possível.
 */
export function filtrarPorJanela(vagas, valor) {
  const janela = janelaDe(valor)
  if (!janela || janela.dias === null) {
    return { visiveis: vagas, ocultadas: 0 }
  }

  const visiveis = vagas.filter(
    (v) => Number.isFinite(v.days) && v.days <= janela.dias,
  )
  return { visiveis, ocultadas: vagas.length - visiveis.length }
}

/**
 * A janela `nova` cabe inteira no que já foi baixado com a janela `atual`?
 *
 * Serve para não gastar requisição à toa. "Última semana" é um subconjunto do
 * que "Último mês" já trouxe: o corte local dá conta sozinho, sem rede.
 * Alargar é o contrário — o que ficou de fora nunca chegou a ser baixado, e
 * filtrar o que está em memória mostraria uma lista incompleta como se fosse
 * o resultado inteiro.
 *
 * São 200 requisições por mês. Sem esta distinção, mexer no dropdown para ver
 * o resultado apertar queimaria a cota sem trazer uma vaga nova sequer.
 *
 * Janela desconhecida devolve `false`: na dúvida, buscar. Gastar uma
 * requisição a mais é um erro barato; mostrar meia lista como se fosse
 * inteira, não.
 */
export function cabeNoQueJaTemos(nova, atual) {
  const a = janelaDe(nova)
  const b = janelaDe(atual)
  if (!a || !b) return false

  // `all` é a mais larga: tudo cabe nela, ela não cabe em nenhuma outra.
  const largura = (j) => (j.dias === null ? Infinity : j.dias)
  return largura(a) <= largura(b)
}
