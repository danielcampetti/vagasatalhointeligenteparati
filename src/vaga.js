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
 * O que uma marca pode valer, por marca.
 *
 * As três marcas são o único pedaço da vaga que a tela escreve, e por isso o
 * único que atravessa a rede vindo de fora. `MARCAS` diz **quais** chaves são
 * marcas; estas funções dizem **o que** cada uma pode valer.
 *
 * A distinção custou um defeito: a rota de PATCH filtrava os nomes dos campos e
 * não olhava os valores, então `rank` aceitava uma string de 50 mil caracteres.
 * E `rank` volta em toda listagem — o peso ia junto, para sempre, num banco
 * onde por decisão do dono do projeto não existe `DELETE` para desfazer.
 *
 * `rank` só aceita número finito: `JSON.stringify` já transforma `Infinity` e
 * `NaN` em `null` na ida ao banco, e o que sobreviveria à volta seria um valor
 * que a tela não sabe ordenar.
 */
const COMO_SANEAR = {
  fav: (valor) => Boolean(valor),
  seen: (valor) => Boolean(valor),
  rank: (valor) => (typeof valor === 'number' && Number.isFinite(valor) ? valor : null),
}

/**
 * As marcas de quem usa: o que é compartilhado e o que a tela escreve.
 *
 * Uma lista só, derivada do `COMO_SANEAR`, para não haver duas — a rota que
 * aceita, o cliente que envia e o banco que grava falam todos deste array.
 */
export const MARCAS = Object.keys(COMO_SANEAR)

/**
 * As marcas de `campos`, coagidas ao tipo que cada uma aceita.
 *
 * Só as chaves presentes entram: uma marca ausente tem que continuar ausente,
 * porque é a ausência que o `mesclar` lê como "não mexe nisso". Trocar ausência
 * por `undefined` explícito faria um patch parcial apagar o resto.
 */
export function sanearMarcas(campos = {}) {
  const limpos = {}
  for (const marca of MARCAS) {
    if (campos && marca in campos) limpos[marca] = COMO_SANEAR[marca](campos[marca])
  }
  return limpos
}

/**
 * Só as marcas que de fato mudaram entre `antes` e `depois`.
 *
 * Existe porque mandar as três sempre é como a nota paga de outra pessoa
 * morria: a aba que carregou antes da Avaliação IA tem `rank: null` na sua
 * cópia, e um PATCH com as três marcas leva esse `null` junto com o `seen` que
 * o clique acabou de ligar. O servidor também se defende disso, mas mandar o
 * que não mudou é pedir para o servidor adivinhar intenção.
 */
export function marcasMudadas(antes, depois) {
  const mudou = {}
  for (const marca of MARCAS) {
    if (depois?.[marca] !== antes?.[marca]) mudou[marca] = depois?.[marca]
  }
  return mudou
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
