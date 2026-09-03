/**
 * O que uma vaga é para quem a guarda.
 *
 * Este módulo existe porque a mesma regra passou a valer nos dois lados: o
 * navegador mescla ao exibir, e o servidor mescla ao gravar. São as quatro
 * regras abaixo, e elas foram aprendidas com defeito — favorito que sumia,
 * nota paga que se perdia, descrição que zerava, teto que virava loteria.
 *
 * Deliberadamente **não** é um `ON CONFLICT DO UPDATE` em SQL. Traduzir estas
 * regras para outra linguagem seria redescobri-las uma a uma, e elas já têm
 * teste aqui.
 *
 * Não importa nada: é o que permite rodar no `node` do servidor e no bundle do
 * navegador sem condicional nenhuma.
 */

/**
 * Vaga sem `id` é recusada em vez de virar lixo.
 *
 * Sem id ela não pode ser desduplicada nem atualizada depois — entraria no
 * acervo como uma linha que nenhuma operação alcança.
 */
export function temId(vaga) {
  return Boolean(vaga) && vaga.id !== undefined && vaga.id !== null && vaga.id !== ''
}

/** Isolado para os testes poderem falar sobre o formato sem espionar `Date`. */
export function agora() {
  return new Date().toISOString()
}

/**
 * A versão velha encontrando a nova.
 *
 * Espalhado, o `...nova` sozinho sobrescreveria tudo — e é isso que as quatro
 * linhas abaixo impedem, cada uma por um motivo diferente.
 */
export function mesclar(velha, nova) {
  return {
    ...velha,
    ...nova,
    // Marcas de quem usa: uma vez ligadas, uma busca nova não as desliga.
    fav: velha.fav || nova.fav || false,
    seen: velha.seen || nova.seen || false,
    // A nota nova vence quando existe — é o que faz reranquear valer alguma
    // coisa. Quando não existe, a antiga fica: ela custou uma chamada paga.
    rank: nova.rank ?? velha.rank ?? null,
    // Resposta sem descrição não zera a que já estava guardada: sem ela, a
    // página de detalhe fica vazia e o reranking não tem o que comparar.
    descricao: nova.descricao || velha.descricao || '',
    // Quando entrou, não quando foi vista de novo. É o critério de descarte do
    // teto, e precisa ser estável.
    entrouEm: velha.entrouEm ?? nova.entrouEm ?? agora(),
  }
}
