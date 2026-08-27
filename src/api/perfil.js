/**
 * Currículo → perfil estruturado. Uma chamada, no upload.
 *
 * Por que estruturar em vez de guardar o texto cru: o perfil tem ~500 tokens
 * contra ~3.000 do texto, e ele viaja em **toda** busca. Mas o ganho maior não
 * é preço — é que `pretensao_min: null` é um fato que o modelo pode usar, e o
 * silêncio de um texto corrido não é. A instrução de ranking tem cláusulas
 * sobre pretensão e cidade; sem campo explícito elas pontuam contra nada.
 *
 * A dedução do cargo sai daqui junto, sem chamada extra — é o que a aba Vaga
 * Inteligente precisa saber antes de buscar.
 */
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { ErroClaude, TIPOS, chamarEstruturado } from './claude'

/**
 * `.nullable()` em quase tudo é a decisão central deste módulo: null significa
 * "o currículo não diz", e é diferente de um chute plausível. Campo obrigatório
 * e nulável, nunca opcional — assim a ausência é uma afirmação, não um silêncio.
 */
export const PerfilSchema = z.object({
  cargo_deduzido: z.string().nullable(),
  senioridade: z
    .enum(['junior', 'pleno', 'senior', 'especialista'])
    .nullable(),
  cidade: z.string().nullable(),
  aceita_remoto: z.boolean().nullable(),
  // Em R$ mil, igual ao min/max do mapear.js (4.5 = R$ 4.500). Unidade
  // diferente entre os dois lados vira lixo silencioso.
  pretensao_min: z.number().nullable(),
  tecnologias: z.array(
    z.object({
      nome: z.string(),
      // "operou em produção" é o que a instrução pede e o que um currículo
      // revela; anos por tecnologia quase nunca está escrito.
      profundidade: z.enum(['producao', 'projeto', 'contato']),
      anos: z.number().nullable(),
    }),
  ),
  formacao: z.string().nullable(),
  resumo: z.string().nullable(),
  texto_extraido: z.string().nullable(),
})
