/**
 * A modalidade de trabalho: remota ou presencial.
 *
 * Este módulo é dono do conceito inteiro, como o `janela.js` é da data de
 * publicação — o que vai para a API, o rótulo em português do dropdown, e o
 * corte local. Juntos porque separados é como a tela passa a dizer uma coisa
 * e a requisição a pedir outra.
 *
 * ## O parâmetro da requisição não se chama `work_arrangement`
 *
 * A documentação do `/search-v2` (openwebninja.com/api/jsearch/docs, lida em
 * 2026-09-03) lista os parâmetros aceitos:
 *
 *   query, cursor, num_pages, country, language, date_posted,
 *   work_from_home, employment_types, job_requirements, radius,
 *   exclude_job_publishers, fields
 *
 * `work_arrangement` **não está entre eles**. Esse é o nome do campo na
 * *resposta* — o que o `mapear.js` lê para preencher `vaga.modalidade`.
 * Mandá-lo na requisição seria um 400, e um 400 debita uma das 200 do mês
 * igual a uma busca boa.
 *
 * É a armadilha que o repo já pagou uma vez, invertida: lá o erro foi supor
 * `job_is_remote` na resposta; aqui seria supor `work_arrangement` no pedido.
 *
 * ## Duas opções porque a API só sabe responder duas
 *
 * O que existe é `work_from_home`, booleano: "Only return work from home /
 * remote jobs". Não há parâmetro para híbrido nem para presencial — a API
 * distingue "remotas" de "o resto", e mais nada.
 *
 * O dropdown tem exatamente essa forma, e não é coincidência de desenho: a
 * pergunta que a tela faz e a pergunta que a API responde são a mesma. Uma
 * versão anterior deste módulo oferecia quatro opções ('todas', 'remoto',
 * 'hibrido', 'presencial') e carregava a assimetria entre elas; o dropdown de
 * dois valores fez a assimetria desaparecer em vez de ser administrada.
 *
 *   Presencial  nada na URL          corte local: tudo que não é remoto
 *   Remoto      work_from_home=true  corte local: só o que é remoto
 *
 * ## "Presencial" é o complemento de "Remoto", não uma igualdade
 *
 * Esta é a decisão que impede vaga invisível. Sem um "Todas" no dropdown, uma
 * vaga que não casasse com nenhuma das duas opções não teria por onde
 * aparecer — e há dois casos assim: a **híbrida**, que perdeu a opção
 * própria, e a que vem **sem `work_arrangement`**, que o `mapear.js` mapeia
 * para `null`.
 *
 * Definido como complemento, o conjunto fecha: toda vaga cabe em exatamente
 * uma das duas, e as duas somadas são o resultado inteiro da busca. O preço é
 * uma híbrida aparecer sob o rótulo "Presencial", o que é impreciso —
 * escondê-la seria pior.
 *
 * Medido em 2026-09-03, nas 88 vagas que 5 consultas reais deixaram no cache:
 * 84 presenciais, 4 remotas, nenhuma híbrida, nenhuma sem modalidade. Na
 * prática o campo vem preenchido — mas "na prática" não é "sempre", e o custo
 * de estar preparado aqui é uma negação.
 *
 * ## A economia de cota cai fora de graça
 *
 * Como a opção *é* o booleano, é ele que entra na chave de cache. Presencial
 * não manda parâmetro, então sua chave é a mesma que a busca sem modalidade
 * nenhuma sempre teve — as entradas gravadas por versões anteriores continuam
 * sendo achadas, em vez de virarem órfãs levando junto requisições já pagas.
 *
 * ## Por que o corte local vale até para "Remoto"
 *
 * Porque `date_posted` já ensinou que esta API aceita um filtro e nem sempre
 * o cumpre (sete requisições medidas, ver `janela.js`). Confiar o recorte só
 * ao `work_from_home` repetiria o erro conhecido: bastaria uma híbrida
 * classificada como "work from home" na origem para ela aparecer na tela sob
 * o rótulo "Remoto".
 */

/**
 * A string que o `modalidadeDe` do `mapear.js` produz para uma vaga remota.
 *
 * É o eixo do módulo inteiro: tudo aqui é "isto" ou "não isto". Fica numa
 * constante nomeada porque o acordo entre os dois módulos é por string, eles
 * nunca se importam, e um acento a mais de um lado esvaziaria o filtro do
 * outro sem erro nenhum na tela. O `modalidade.test.js` passa uma resposta
 * crua pelo `mapearVaga` de verdade justamente para essa ligação quebrar
 * ruidosamente.
 */
const REMOTO = 'Remoto'

/**
 * 'presencial' e não 'remoto': é a esmagadora maioria do que a busca traz (84
 * de 88 nas consultas reais medidas), e é a opção que não manda parâmetro —
 * o padrão continua sendo a requisição mais simples possível, e a chave de
 * cache mais compatível.
 */
export const MODALIDADE_PADRAO = 'presencial'

/**
 * `remotas` faz os dois trabalhos de uma vez, e é por isso que o módulo
 * encolheu: é o valor de `work_from_home` na requisição **e** o lado do corte
 * local. Antes eram dois campos (`api` e `local`) que precisavam concordar.
 */
export const MODALIDADES = [
  { valor: 'presencial', rotulo: 'Presencial', remotas: false },
  { valor: 'remoto', rotulo: 'Remoto', remotas: true },
]

/** A modalidade pelo valor, ou `undefined` se o valor não for de nenhuma. */
export function modalidadeDe(valor) {
  return MODALIDADES.find((m) => m.valor === valor)
}

/**
 * Esta escolha vira `work_from_home=true` na requisição?
 *
 * É também o booleano que a chave de cache carrega — veja o cabeçalho.
 *
 * Valor desconhecido devolve `false`, que é o lado seguro: não manda
 * parâmetro nenhum. 'todas' e 'hibrido' existiram numa versão anterior e
 * podem estar no localStorage de alguém; caem aqui, e caem certo.
 */
export function soRemotas(valor) {
  return modalidadeDe(valor)?.remotas === true
}

/**
 * Separa o que é da modalidade pedida do que não é.
 *
 * Devolve a contagem do que saiu junto com o que ficou pelo mesmo motivo que
 * `filtrarPorJanela`: uma busca que trouxe 10 vagas e mostrou 2 sem explicar
 * pareceria uma busca quebrada.
 *
 * A comparação é contra `REMOTO` dos dois lados — é o que faz "Presencial"
 * ser o complemento e não uma igualdade, e portanto o que garante que
 * híbrida e vaga sem modalidade tenham onde aparecer.
 *
 * Modalidade desconhecida não filtra nada, mesma defesa da janela: esvaziar a
 * tabela em silêncio por causa de uma string estranha seria o pior desfecho.
 */
export function filtrarPorModalidade(vagas, valor) {
  const modalidade = modalidadeDe(valor)
  if (!modalidade) return { visiveis: vagas, ocultadas: 0 }

  const visiveis = vagas.filter(
    (v) => (v.modalidade === REMOTO) === modalidade.remotas,
  )
  return { visiveis, ocultadas: vagas.length - visiveis.length }
}
