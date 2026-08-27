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
 * Validar a volta não é zelo: um id que não voltou não grita, vira uma vaga sem
 * nota que ninguém percebe.
 */
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { TIPOS, chamarEstruturado } from './claude'

export const TAMANHO_LOTE = 12

export const NotasSchema = z.object({
  notas: z.array(
    z.object({
      id: z.string(),
      nota: z.number().int().min(0).max(100),
      motivo: z.string().max(90),
    }),
  ),
})

/** Só o que a nota precisa. Campos de tela (fav, seen, status) não vão. */
export function resumirVaga(vaga) {
  return {
    id: vaga.id,
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
export function validarNotas(notas, idsEnviados) {
  const permitidos = new Set(idsEnviados)
  const validas = new Map()

  for (const item of Array.isArray(notas) ? notas : []) {
    if (!permitidos.has(item?.id)) continue
    if (validas.has(item.id)) continue // a primeira vence
    const nota = Number(item.nota)
    if (!Number.isFinite(nota) || nota < 0 || nota > 100) continue
    validas.set(item.id, { nota: Math.round(nota), motivo: item.motivo ?? '' })
  }

  return {
    validas,
    faltando: idsEnviados.filter((id) => !validas.has(id)),
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
  // Cada lote passa pelo invólucro, então o teto é reconferido a cada chamada
  // — inclusive na segunda volta, que sai depois da primeira já ter gasto.
  const resposta = await chamarEstruturado(TIPOS.RANKING, {
    max_tokens: 2000,
    system: `${instrucao}\n\nCampos com null significam que o currículo não informa aquilo. Nesse caso ignore a cláusula correspondente em vez de supor um valor — uma pretensão salarial ausente não é uma pretensão baixa.\n\nDevolva uma nota para CADA vaga recebida, usando o id exatamente como veio. O motivo tem no máximo 10 palavras.`,
    output_config: { format: zodOutputFormat(NotasSchema) },
    messages: [
      {
        role: 'user',
        content: `Perfil do candidato:\n${JSON.stringify(perfil, null, 2)}\n\nVagas:\n${JSON.stringify(vagas.map(resumirVaga), null, 2)}`,
      },
    ],
  })

  // O schema garante a forma de cada item; ele NÃO garante que os ids sejam os
  // que enviamos, nem que todos voltaram. Essa parte é a `validarNotas`.
  return validarNotas(resposta.parsed_output?.notas, vagas.map((v) => v.id))
}

/**
 * Uma chamada, mais uma segunda só com o que faltar. O que sobrar depois disso
 * fica sem nota e a lista aparece do mesmo jeito — tela em branco por causa de
 * um item faltando seria pior que ranking parcial.
 */
export async function ranquear(perfil, instrucao, vagas) {
  const primeira = await pontuarLote(perfil, instrucao, vagas.slice(0, TAMANHO_LOTE))
  let validas = primeira.validas

  if (primeira.faltando.length) {
    console.warn('[claude] sem nota na primeira volta:', primeira.faltando)
    const restantes = vagas.filter((v) => primeira.faltando.includes(v.id))
    const segunda = await pontuarLote(perfil, instrucao, restantes)
    validas = new Map([...validas, ...segunda.validas])
    if (segunda.faltando.length) {
      console.warn('[claude] seguem sem nota:', segunda.faltando)
    }
  }

  return aplicarNotas(vagas, validas)
}
