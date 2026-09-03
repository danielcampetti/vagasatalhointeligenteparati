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
 * `valor` identifica a janela na tela e no localStorage. `api` é o que vai em
 * `date_posted`. `dias` é o teto do corte local; `null` significa "não corta".
 *
 * Os dois primeiros foram um campo só até "Últimos 15 dias" existir, e a
 * separação é o que a tornou possível. O `date_posted` é um enum fechado —
 * all, today, 3days, week, month — e `15days` não está nele: mandá-lo seria
 * 400, e um 400 debita uma das 200 do mês igual a uma busca boa.
 *
 * Então ela pede `month`, a janela mais estreita que **contém** 15 dias, e
 * corta em 15 aqui. É exatamente o desenho de dois portões que este módulo já
 * tinha por outro motivo — a API não cumprir a janela que promete —, agora
 * servindo também para oferecer uma janela que ela nem tem.
 */
export const JANELAS = [
  { valor: 'today', rotulo: 'Hoje', api: 'today', dias: 0 },
  { valor: '3days', rotulo: 'Últimos 3 dias', api: '3days', dias: 3 },
  { valor: 'week', rotulo: 'Última semana', api: 'week', dias: 7 },
  { valor: '15dias', rotulo: 'Últimos 15 dias', api: 'month', dias: 15 },
  { valor: 'month', rotulo: 'Último mês', api: 'month', dias: 30 },
  { valor: 'all', rotulo: 'Qualquer data', api: 'all', dias: null },
]

/** A janela pelo valor, ou `undefined` se o valor não for de nenhuma. */
export function janelaDe(valor) {
  return JANELAS.find((j) => j.valor === valor)
}

/**
 * O `date_posted` que esta janela pede à API.
 *
 * É também o que entra na chave de cache, e essa é a parte que economiza cota:
 * "Último mês" e "Últimos 15 dias" fazem a mesma requisição, então têm de
 * dividir a mesma entrada. Guardá-las separadas gastaria uma das 200 para
 * rebaixar vagas que já estão na tela.
 *
 * Janela desconhecida cai no padrão em vez de seguir para a API — vale para
 * uma gravada por versão anterior e para uma adulterada no localStorage.
 */
export function apiDaJanela(valor) {
  return janelaDe(valor)?.api ?? JANELA_PADRAO
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
