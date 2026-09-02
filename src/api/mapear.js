/**
 * Traduz uma vaga da JSearch para a forma que a tabela do app espera.
 *
 * A API não preenche tudo, e não inventa nada aqui é uma regra: campo ausente
 * vira `null`, e a tela mostra "—". Preencher com um valor plausível faria a
 * tabela mentir sobre o que a busca realmente trouxe.
 *
 * O que a API **não tem**:
 *
 *   rank    a nota de compatibilidade sai da comparação currículo × descrição,
 *           que é a etapa da Claude — ainda não construída
 *
 * O que ela dá pela metade:
 *
 *   salário   `job_min_salary`/`job_max_salary` vêm vazios com frequência, e
 *             um valor anual é descartado em vez de virar salário mensal
 *   status    a API não tem o campo; toda vaga recém-buscada entra como
 *             "Ativa", que é o que se pode afirmar do anúncio
 *
 * Uma lição já paga: os nomes dos campos foram conferidos na documentação, não
 * deduzidos. `job_is_remote` e `job_posted_at_datetime_utc` sozinhos pareciam
 * óbvios e deixaram duas colunas inteiras vazias — o certo é `work_arrangement`
 * e uma cadeia de três campos de data. Ao mexer aqui, confira antes de supor.
 */

/** Cidade com cadeia de fallback: a API nem sempre preenche o campo ideal. */
function cidadeDe(vaga) {
  const partes = [vaga.job_city, vaga.job_state].filter(Boolean)
  if (partes.length) return partes.join(', ')
  if (vaga.job_location) return vaga.job_location
  if (modalidadeDe(vaga) === 'Remoto') return 'Remoto'
  return null
}

/**
 * Dias desde a publicação. A API expõe o mesmo fato de três formas e nem
 * sempre manda as três — daí a cadeia, em ordem de confiabilidade:
 * timestamp numérico, ISO, e por último o texto pronto ("7 days ago"), que é
 * o único que sobra em algumas respostas.
 */
function diasDesde(vaga) {
  const ts = Number(vaga.job_posted_at_timestamp)
  if (Number.isFinite(ts) && ts > 0) {
    return diasAte(ts * 1000)
  }

  const iso = vaga.job_posted_at_datetime_utc
  if (iso) {
    const ms = new Date(iso).getTime()
    if (!Number.isNaN(ms)) return diasAte(ms)
  }

  return dosDiasEmTexto(vaga.job_posted_at)
}

function diasAte(ms) {
  return Math.max(0, Math.round((Date.now() - ms) / 86400000))
}

/** "7 days ago" / "há 7 dias" / "today" -> 7, 7, 0. */
function dosDiasEmTexto(texto) {
  if (!texto || typeof texto !== 'string') return null
  const t = texto.toLowerCase()
  if (/hoje|today|agora|just now/.test(t)) return 0
  if (/ontem|yesterday/.test(t)) return 1

  const n = Number((t.match(/\d+/) ?? [])[0])
  if (!Number.isFinite(n)) return null
  if (/hora|hour|minuto|minute/.test(t)) return 0
  if (/dia|day/.test(t)) return n
  if (/semana|week/.test(t)) return n * 7
  if (/m[êe]s|month/.test(t)) return n * 30
  if (/ano|year/.test(t)) return n * 365
  return null
}

/**
 * Faixa salarial em R$ mil, que é a unidade da tabela (4.5 = R$ 4.500).
 * A API devolve o valor cheio e um período; só converto o que dá para afirmar.
 */
function faixaSalarial(vaga) {
  const min = Number(vaga.job_min_salary)
  const max = Number(vaga.job_max_salary)
  const temMin = Number.isFinite(min) && min > 0
  const temMax = Number.isFinite(max) && max > 0
  if (!temMin && !temMax) return { min: null, max: null }

  // Mensal é o que a tabela assume. Um valor anual entraria como se fosse
  // mensal e mostraria salários absurdos, então é melhor descartar.
  const periodo = String(vaga.job_salary_period || '').toUpperCase()
  if (periodo && periodo !== 'MONTH') return { min: null, max: null }

  const emMil = (v) => Math.round((v / 1000) * 10) / 10
  return {
    min: temMin ? emMil(min) : null,
    max: temMax ? emMil(max) : null,
  }
}

/**
 * O campo é `work_arrangement` — não `job_is_remote`, que não existe na
 * resposta e por isso deixava a coluna inteira vazia.
 *
 * Casa por trecho porque o valor varia entre versões ("onsite", "on_site",
 * "ON_SITE"); `job_is_remote` fica como último recurso caso alguma resposta
 * antiga ainda o traga.
 */
function modalidadeDe(vaga) {
  const arranjo = String(vaga.work_arrangement ?? '')
    .toLowerCase()
    .replace(/[_-]/g, '')

  if (arranjo.includes('hybrid') || arranjo.includes('hibrid')) return 'Híbrido'
  if (arranjo.includes('remote') || arranjo.includes('remoto')) return 'Remoto'
  if (arranjo.includes('onsite') || arranjo.includes('presencial')) {
    return 'Presencial'
  }

  if (vaga.job_is_remote === true) return 'Remoto'
  if (vaga.job_is_remote === false) return 'Presencial'
  return null
}

/**
 * O link de candidatura, ou `null` — e só se for seguro pôr num `href`.
 *
 * A cadeia de reserva (`apply_options`) já existia: a API nem sempre traz o
 * link direto. O que é novo é a peneira, e ela entrou junto com a coluna "Ver
 * Vaga", que transformou este valor num `<a href>` clicável em toda linha da
 * tabela.
 *
 * Antes o link só existia na página de detalhe, atrás de um clique
 * deliberado. Dez âncoras por tela, montadas com URLs que vieram de uma API de
 * terceiros e que ninguém leu, é outro cálculo: um `javascript:` num `href`
 * executa ao clique, na origem da própria página.
 *
 * O saneamento mora aqui, e não na tela, porque este é o ponto onde o link
 * nasce. Barrado na origem, o valor perigoso nunca chega a existir no estado
 * do app — e nenhuma tela futura precisa lembrar de conferir.
 *
 * A peneira é por candidato, não uma desistência no primeiro tropeço: link
 * principal recusado ainda deixa a reserva ser avaliada.
 */
export function linkDeCandidatura(vaga) {
  const candidatos = [vaga?.job_apply_link, vaga?.apply_options?.[0]?.apply_link]
  for (const cru of candidatos) {
    if (typeof cru !== 'string') continue
    const url = cru.trim()
    if (!url) continue
    // Lista de permissão, não de bloqueio: esquema novo e estranho é recusado
    // por omissão, que é o lado certo para errar aqui.
    if (/^https?:\/\//i.test(url)) return url
  }
  return null
}

/**
 * As "techs" da tabela não existem na API — ela devolve a descrição inteira.
 * Extrair tecnologias dali é trabalho para a etapa da Claude; por ora fica
 * vazio, e a descrição crua é guardada para essa comparação futura.
 */
export function mapearVaga(vaga, indice) {
  const { min, max } = faixaSalarial(vaga)
  return {
    id: vaga.job_id ?? `js${indice}`,
    cargo: vaga.job_title ?? null,
    techs: [],
    empresa: vaga.employer_name ?? null,
    cidade: cidadeDe(vaga),
    modalidade: modalidadeDe(vaga),
    min,
    max,
    days: diasDesde(vaga),
    rank: null,
    // Veio de uma busca agora: o anúncio está no ar. A API não tem campo de
    // status, e "Em análise"/"Encerrada" são estados do processo seletivo,
    // não do anúncio — para esses não há fonte.
    status: 'Ativa',
    seen: false,
    fav: false,
    // Guardada para a etapa da Claude comparar com o currículo.
    descricao: vaga.job_description ?? '',
    // `apply_options` costuma trazer alternativas quando o link direto falta,
    // e a URL passa por uma peneira antes de virar `href` — veja acima.
    link: linkDeCandidatura(vaga),
  }
}

export function mapearVagas(lista) {
  // Um retrato da primeira vaga no console. Custa zero requisição e mostra os
  // nomes reais dos campos — é o que teria evitado o chute que deixou
  // modalidade e data vazias.
  if (lista.length) {
    const bruta = lista[0]
    console.log('[jsearch] campos da resposta:', Object.keys(bruta).sort())
    console.log('[jsearch] amostra:', {
      work_arrangement: bruta.work_arrangement,
      job_employment_type: bruta.job_employment_type,
      job_posted_at: bruta.job_posted_at,
      job_posted_at_timestamp: bruta.job_posted_at_timestamp,
      job_posted_at_datetime_utc: bruta.job_posted_at_datetime_utc,
      job_min_salary: bruta.job_min_salary,
      job_max_salary: bruta.job_max_salary,
      job_salary_period: bruta.job_salary_period,
    })
  }
  return lista.map(mapearVaga)
}
