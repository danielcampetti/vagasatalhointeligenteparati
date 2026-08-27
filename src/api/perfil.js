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

const REGRA_NULO =
  'Preencha com null todo campo que o currículo não disser. Não invente e não deduza por plausibilidade: null é uma resposta melhor que um chute, porque quem lê depois sabe a diferença. pretensao_min vai em R$ mil (4500 vira 4.5).'

/**
 * PDF vai como bloco `document` — a Claude lê PDF nativamente, o que também
 * cobre currículo escaneado sem OCR próprio. `texto_extraido` só é pedido
 * aqui: para PDF o navegador nunca viu o texto, e a justificativa detalhada
 * (Task 8) precisa dele depois. Documento antes do texto porque a pergunta
 * ("extraia isto") só faz sentido depois do "isto" ter sido apresentado.
 */
export function conteudoDePdf(base64) {
  return [
    {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64 },
    },
    {
      type: 'text',
      text: `Extraia o perfil profissional deste currículo. ${REGRA_NULO}\n\nEm texto_extraido, transcreva o documento inteiro literalmente — é a única fonte de texto que existe para um PDF, porque o navegador não o abriu.`,
    },
  ]
}

/**
 * `.docx` e texto colado chegam como string — o navegador já extraiu. Pedir
 * a transcrição de volta custaria ~3.000 tokens de saída para reproduzir o
 * que já está em mãos, então texto_extraido fica null por instrução.
 */
export function conteudoDeTexto(texto) {
  return [
    {
      type: 'text',
      text: `Extraia o perfil profissional deste currículo. ${REGRA_NULO}\n\nDeixe texto_extraido como null.\n\nCurrículo:\n\n${texto}`,
    },
  ]
}
