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
  // A descrição vai no schema (viaja em output_config, não no texto do
  // prompt) de propósito: é o único lugar onde dá pra explicar quando este
  // campo se aplica sem nomeá-lo no bloco de texto do caminho de texto — ver
  // conteudoDeTexto, que não pode mencionar este campo (custaria os ~3.000
  // tokens de saída que ele existe para evitar nesse caminho).
  texto_extraido: z
    .string()
    .nullable()
    .describe(
      'Transcrição literal e completa do documento. Preencha só quando o currículo chegar como anexo PDF (bloco document); quando o currículo já vier como texto no prompt, deixe null — o texto já está com quem chamou, reproduzi-lo aqui é desperdício.',
    ),
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
 * `.docx` e texto colado chegam como string — o navegador já extraiu. Não se
 * pede a transcrição de volta aqui, nem citando o nome do campo: já está em
 * mãos, e pedir custaria ~3.000 tokens de saída à toa. Quem faz o campo
 * sair null é a descrição em PerfilSchema — este texto não precisa (e não
 * deve) tocar no assunto.
 */
export function conteudoDeTexto(texto) {
  return [
    {
      type: 'text',
      text: `Extraia o perfil profissional deste currículo. ${REGRA_NULO}\n\nCurrículo:\n\n${texto}`,
    },
  ]
}

/**
 * Um perfil sem tecnologia nenhuma não dá para ranquear: as dez notas sairiam
 * plausíveis e sem fundamento nenhum no currículo. Melhor falhar aqui — onde a
 * tela pode oferecer a textarea de colar texto — do que produzir um ranking
 * inventado silenciosamente.
 */
export function conferirPerfil(perfil) {
  if (!perfil) {
    throw new ErroClaude('A extração não devolveu perfil nenhum.', {
      tipo: 'vazio',
    })
  }
  if (!Array.isArray(perfil.tecnologias) || perfil.tecnologias.length === 0) {
    throw new ErroClaude(
      'Não consegui ler tecnologia nenhuma neste currículo. Se ele for um PDF escaneado de baixa qualidade, cole o texto no campo abaixo.',
      { tipo: 'vazio' },
    )
  }
}

/**
 * Ponto de entrada do módulo: currículo (PDF em base64 ou texto já
 * extraído) → perfil validado. Uma chamada só, com a dedução do cargo
 * embutida na mesma resposta.
 */
export async function extrairPerfil({ base64, texto }) {
  // `chamarEstruturado` cuida de teto, contabilização e checagem de recusa,
  // na ordem certa — ver o cabeçalho de claude.js para o porquê da ordem ser
  // fixa. Este módulo nunca chama o SDK direto.
  const resposta = await chamarEstruturado(TIPOS.PERFIL, {
    max_tokens: 8000, // folga para o texto_extraido do PDF
    output_config: { format: zodOutputFormat(PerfilSchema) },
    messages: [
      {
        role: 'user',
        content: base64 ? conteudoDePdf(base64) : conteudoDeTexto(texto),
      },
    ],
  })

  // `parsed_output` vem null quando a validação do schema falha — não
  // confiar sem checar, e checar tecnologias vazias mesmo quando o schema
  // passou (um perfil bem-formado ainda pode estar vazio de conteúdo útil).
  conferirPerfil(resposta.parsed_output)
  return resposta.parsed_output
}
