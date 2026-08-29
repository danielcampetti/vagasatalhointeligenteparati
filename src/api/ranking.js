/**
 * Perfil + N vagas → N notas, numa chamada só.
 *
 * Por que em lote: o currículo viaja uma vez em vez de N, e a saída — que custa
 * 5× a entrada — encolhe para `{id, nota, motivo}`. Dá ~3,5× mais barato que
 * uma chamada por vaga. Lote de 10 a 15; com 50 a qualidade cai.
 *
 * A nota é **relativa ao conjunto** desta busca: o modelo calibra dentro do que
 * vê, e as mesmas vagas contra outras dez dariam números diferentes. Serve para
 * ranquear, não é porcentagem de compatibilidade — por isso a tela escreve
 * "Rank IA 87" e não "87%".
 *
 * Essa relatividade tem um limite: acima de TAMANHO_LOTE vagas, a busca inteira
 * não cabe numa chamada, e `ranquear` fatia em vários lotes (ver `emLotes`) —
 * cada lote calibra sozinho, contra só quem está nele. A nota de um lote não é
 * a mesma escala da nota de outro, e ordenar a tabela inteira por Rank IA
 * mistura essas escalas sem avisar. Aceito de propósito, não corrigido: o
 * fatiamento é equilibrado (nenhum lote pequeno demais para ter conjunto de
 * comparação), e um ranqueamento aproximado sobre a busca inteira vale mais
 * para quem está lendo do que um ranqueamento fino só nas primeiras
 * TAMANHO_LOTE vagas e "—" no resto. Renormalizar entre lotes resolveria a
 * mistura de escalas, mas hoje o caminho quase não dispara — `jsearch.js` fixa
 * `num_pages: '1'` e a API devolve por volta de 10 resultados, abaixo de
 * TAMANHO_LOTE — e complexidade num módulo que existe para pegar falha
 * silenciosa tem custo real. Quem for aumentar o volume de resultados um dia
 * esbarra nesta nota antes de ser mordido por ela.
 *
 * Validar a volta não é zelo: um id que não voltou não grita, vira uma vaga sem
 * nota que ninguém percebe.
 */
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { MAX_TOKENS, TIPOS, chamarEstruturado } from './claude'

/**
 * Por que 30 e não 12: com a paginação ("Carregar mais"), a lista passa a
 * crescer, e um lote menor que ela a partiria em pedaços com escalas
 * independentes. Isso foi **medido**, não suposto — as mesmas 10 vagas, num
 * lote só e partidas em dois de 5: diferença média de 9,1 pontos, máxima de
 * 14, e o primeiro lugar trocou. O lote fraco sobe em bloco (as 5 do segundo
 * lote subiram todas, +6 a +10), porque avaliado só contra si mesmo ele é
 * graduado na curva.
 *
 * O teto não é arbitrário: o lote de 10 medido gastou 3.421 tokens de saída
 * (2.980 de pensamento) contra os 16.000 de `MAX_TOKENS`, e a nota de desenho
 * acima diz que a qualidade cai por volta de 50 vagas. 30 fica confortável nos
 * dois limites.
 *
 * Acima de 30 o fatiamento volta, e com ele a mistura de escalas — o
 * `emLotes` segue existindo para esse caso, e a advertência do cabeçalho
 * continua valendo.
 */
export const TAMANHO_LOTE = 30

/**
 * Sem `min`/`max` em número e sem `max` em string, de propósito — mas **com**
 * `.int()`. A diferença entre os dois casos é o que vale entender aqui.
 *
 * `integer` é um tipo que a saída estruturada suporta: a API o impõe na hora
 * de gerar, então a nota chega inteira e pronto.
 *
 * `minimum`, `maximum` e `maxLength` **não** são suportados. O
 * `zodOutputFormat` não os descarta: ele os serializa para dentro da
 * `description` do campo, depois do texto de um `.describe()` explícito.
 * Medido contra o SDK instalado, `z.number().int().min(0).max(100)` sai como
 * `{"type":"integer","description":"{minimum: 0, maximum: 100}"}`. O modelo
 * até recebe a faixa; recebe como lixo serializado em vez de instrução.
 *
 * O problema não é esse. É que o SDK revalida a resposta contra o schema
 * inteiro do lado do cliente, e essa revalidação é tudo-ou-nada: **uma** nota
 * fora da faixa, ou **um** motivo longo demais, faz o `parsed_output` vir null
 * e leva o lote inteiro junto. As outras onze notas, boas, morrem com a ruim.
 *
 * É o oposto do que este módulo existe para fazer. O `validarNotas` logo
 * abaixo já filtra por item — descarta a nota inválida e mantém o resto. Ele é
 * o lugar certo para a faixa, e agora é o único.
 *
 * A faixa vai ao modelo pelo `.describe()`, que é texto de verdade. O preço é
 * que o `.int()` gruda os limites de inteiro seguro do JS ali no fim; é feio,
 * mas é ruído inofensivo, e vale menos que perder a garantia do tipo.
 */
export const NotasSchema = z.object({
  notas: z.array(
    z.object({
      ref: z.number().int().describe('O ref da vaga, exatamente como veio.'),
      nota: z.number().int().describe('Nota de 0 a 100.'),
      motivo: z.string().describe('Motivo em até 10 palavras.'),
    }),
  ),
})

/** Só o que a nota precisa. Campos de tela (fav, seen, status) não vão. */
export function resumirVaga(vaga) {
  return {
    cargo: vaga.cargo,
    empresa: vaga.empresa,
    cidade: vaga.cidade,
    modalidade: vaga.modalidade,
    salario_min: vaga.min,
    salario_max: vaga.max,
    dias_desde_publicacao: vaga.days,
    descricao: vaga.descricao,
  }
}

/**
 * Três conferências: id existe no conjunto enviado, nota é número de 0 a 100,
 * e duplicata não sobrescreve. O que não passar entra em `faltando` e vai numa
 * segunda chamada.
 */
export function validarNotas(notas, refsEnviados) {
  const permitidos = new Set(refsEnviados)
  const validas = new Map()

  for (const item of Array.isArray(notas) ? notas : []) {
    // O schema já pede inteiro, mas este módulo existe para pegar falha
    // silenciosa: um ref que chegasse como texto casaria falso contra um Set
    // de números e viraria vaga sem nota, sem ninguém perceber.
    const ref = Number(item?.ref)
    if (!Number.isInteger(ref)) continue
    if (!permitidos.has(ref)) continue
    if (validas.has(ref)) continue // a primeira vence
    const nota = Number(item.nota)
    if (!Number.isFinite(nota) || nota < 0 || nota > 100) continue
    validas.set(ref, { nota: Math.round(nota), motivo: item.motivo ?? '' })
  }

  return {
    validas,
    faltando: refsEnviados.filter((ref) => !validas.has(ref)),
  }
}

/** Vaga sem nota fica com `rank: null`; a tabela já sabe mostrar "—". */
export function aplicarNotas(vagas, validas) {
  return vagas.map((vaga) => {
    const achado = validas.get(vaga.id)
    return achado
      ? { ...vaga, rank: achado.nota, rankMotivo: achado.motivo }
      : { ...vaga, rank: null, rankMotivo: null }
  })
}

async function pontuarLote(perfil, instrucao, vagas) {
  // O `ref` é a posição no lote: 0, 1, 2. Ele existe porque o `job_id` da
  // JSearch é base64 de ~400 caracteres, e pedir ao modelo que ecoasse esse id
  // para as 12 vagas do lote gastava ~1.930 tokens de saída contra um
  // `max_tokens` de 2.000 — a resposta vinha cortada no meio de uma string e o
  // lote inteiro morria, com "—" em toda vaga na tela. Nenhum teste pegou isso
  // porque todos usavam id de dois caracteres: o defeito só existe em função
  // do tamanho do id, e o mock não tinha como exibi-lo.
  //
  // O ref não escapa desta função. Ele é posicional DENTRO do lote, e a
  // segunda volta remonta um lote só com quem faltou, onde o ref 0 já é outra
  // vaga. Traduzir de volta aqui, antes de devolver, é o que impede a nota de
  // pousar na vaga errada.
  const enviadas = vagas.map((vaga, ref) => ({ ref, ...resumirVaga(vaga) }))
  // Cada lote passa pelo invólucro, então o teto é reconferido a cada chamada
  // — inclusive na segunda volta, que sai depois da primeira já ter gasto.
  const resposta = await chamarEstruturado(TIPOS.RANKING, {
    max_tokens: MAX_TOKENS,
    system: `${instrucao}\n\nCampos com null significam que o currículo não informa aquilo. Nesse caso ignore a cláusula correspondente em vez de supor um valor — uma pretensão salarial ausente não é uma pretensão baixa.\n\nDevolva uma nota para CADA vaga recebida, usando o ref exatamente como veio. O motivo tem no máximo 10 palavras.`,
    output_config: { format: zodOutputFormat(NotasSchema) },
    messages: [
      {
        role: 'user',
        content: `Perfil do candidato:\n${JSON.stringify(perfil, null, 2)}\n\nVagas:\n${JSON.stringify(enviadas, null, 2)}`,
      },
    ],
  })

  // O schema garante a forma de cada item; ele NÃO garante que os refs sejam
  // os que enviamos, nem que todos voltaram. Essa parte é a `validarNotas`.
  const { validas, faltando } = validarNotas(
    resposta.parsed_output?.notas,
    enviadas.map((v) => v.ref),
  )

  // Do ref de volta ao id real: daqui para cima o módulo inteiro fala em id.
  return {
    validas: new Map([...validas].map(([ref, valor]) => [vagas[ref].id, valor])),
    faltando: faltando.map((ref) => vagas[ref].id),
  }
}

/**
 * Fatia em `ceil(itens.length / tamanho)` lotes, distribuídos o mais uniforme
 * possível — 13 itens com `tamanho` 12 viram `[7, 6]`, não `[12, 1]`. Um lote
 * de 1 teria conjunto de comparação vazio, e a nota que saísse dali não seria
 * relativa a nada. O número de lotes (e portanto de chamadas) é o mesmo dos
 * dois jeitos; só a distribuição muda.
 */
function emLotes(itens, tamanho) {
  const numLotes = Math.ceil(itens.length / tamanho)
  if (numLotes === 0) return []

  const base = Math.floor(itens.length / numLotes)
  const comSobra = itens.length % numLotes // os `comSobra` primeiros lotes levam +1

  const lotes = []
  let i = 0
  for (let l = 0; l < numLotes; l++) {
    const tamanhoDoLote = base + (l < comSobra ? 1 : 0)
    lotes.push(itens.slice(i, i + tamanhoDoLote))
    i += tamanhoDoLote
  }
  return lotes
}

/**
 * Pontua a lista inteira, em quantos lotes de TAMANHO_LOTE forem precisos —
 * corrigido depois de revisão: um `.slice(0, TAMANHO_LOTE)` sozinho aqui
 * descartava em silêncio tudo além da vaga 12 (nunca ia pra rede, nunca
 * entrava em `faltando`, saía com `rank: null` sem aviso da causa real).
 * Cada lote passa por `chamarEstruturado`, então o teto é reconferido a cada
 * um, por construção do invólucro — não é preciso checar à mão.
 *
 * Corrigido de novo depois de outra revisão: o `await` acima não tinha
 * try/catch. Um lote que lançasse — o gatilho mais provável é o próprio teto
 * de custo, já que o lote 1 pode empurrar o gasto além do limite e o lote 2
 * lançar em `conferirTeto` — derrubava o `for` inteiro, e as `validas` já
 * acumuladas dos lotes anteriores, **já cobradas**, morriam com ele. O
 * caminho degradado deste módulo existe desde `validarNotas` para nota
 * individual faltando; um lote inteiro falhando merece o mesmo tratamento,
 * não um throw que apaga o que já foi pago. Por isso cada lote entra em seu
 * próprio try/catch: quem falha vira `faltando` (tentado de novo na segunda
 * volta, e se persistir sai com `rank: null`), quem já respondeu fica de pé.
 */
async function pontuarTodos(perfil, instrucao, vagas) {
  let validas = new Map()
  const faltando = []
  for (const lote of emLotes(vagas, TAMANHO_LOTE)) {
    try {
      const resultado = await pontuarLote(perfil, instrucao, lote)
      validas = new Map([...validas, ...resultado.validas])
      faltando.push(...resultado.faltando)
    } catch (err) {
      console.warn('[claude] lote falhou, mantendo o que já foi pago:', err)
      faltando.push(...lote.map((v) => v.id))
    }
  }
  return { validas, faltando }
}

/**
 * Todos os lotes, mais uma segunda volta só com o que faltou em qualquer um
 * deles (também fatiada, se for grande). O que sobrar depois disso fica sem
 * nota e a lista aparece do mesmo jeito — tela em branco por causa de um item
 * faltando seria pior que ranking parcial.
 */
export async function ranquear(perfil, instrucao, vagas) {
  const primeira = await pontuarTodos(perfil, instrucao, vagas)
  let validas = primeira.validas

  if (primeira.faltando.length) {
    console.warn('[claude] sem nota na primeira volta:', primeira.faltando)
    const restantes = vagas.filter((v) => primeira.faltando.includes(v.id))
    const segunda = await pontuarTodos(perfil, instrucao, restantes)
    validas = new Map([...validas, ...segunda.validas])
    if (segunda.faltando.length) {
      console.warn('[claude] seguem sem nota:', segunda.faltando)
    }
  }

  return aplicarNotas(vagas, validas)
}
