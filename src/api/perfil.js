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
import { ErroClaude, MAX_TOKENS, TIPOS, chamarEstruturado } from './claude'

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
})

const REGRA_NULO =
  'Preencha com null todo campo que o currículo não disser. Não invente e não deduza por plausibilidade: null é uma resposta melhor que um chute, porque quem lê depois sabe a diferença. pretensao_min vai em R$ mil (4500 vira 4.5).'

/**
 * PDF vai como bloco `document` — a Claude lê PDF nativamente, o que também
 * cobre currículo escaneado sem OCR próprio. Documento antes do texto porque
 * a pergunta ("extraia isto") só faz sentido depois do "isto" ter sido
 * apresentado.
 *
 * Não se pede mais a transcrição do documento aqui. Havia um campo
 * `texto_extraido` que fazia isso — custava ~US$ 0,075 por upload de PDF,
 * mais que o dobro do resto desta extração, só para alimentar a
 * justificativa detalhada (Task 8) com o texto cru. Removido por custo: para
 * PDF, `curriculo.js` agora grava `texto: ''`, e `justificativa.js` cai no
 * fallback testado de "use só o perfil" (ver `montarPrompt` lá). A
 * consequência é assumida: a justificativa de um PDF sai mais pobre que a de
 * um `.docx` ou texto colado, que sempre têm o texto cru porque o navegador
 * já o extraiu antes de chegar aqui.
 */
export function conteudoDePdf(base64) {
  return [
    {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: base64 },
    },
    {
      type: 'text',
      text: `Extraia o perfil profissional deste currículo. ${REGRA_NULO}`,
    },
  ]
}

/**
 * `.docx` e texto colado chegam como string — o navegador já extraiu. Nada a
 * pedir de volta aqui: o texto cru já está em mãos de quem chamou
 * (`curriculo.js` guarda) e é ele quem alimenta a justificativa detalhada
 * depois — diferente do caminho de PDF, onde esse texto nunca existe.
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
    throw new ErroClaude(
      'A extração não devolveu perfil nenhum. Tente de novo ou cole o texto no campo abaixo.',
      { tipo: 'vazio' },
    )
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
  // Sem isto, `{}` cairia direto em conteudoDeTexto(undefined) e mandaria
  // "Currículo:\n\nundefined" para uma chamada paga — o módulo inteiro é
  // consciente de custo e teto, essa é a única porta que não confere nada
  // antes de gastar. Falha antes da rede, então nem entra na contabilização.
  if (!base64 && !texto) {
    throw new ErroClaude(
      'Nenhum currículo foi enviado. Anexe um PDF ou cole o texto no campo abaixo.',
      { tipo: 'vazio' },
    )
  }

  // `chamarEstruturado` cuida de teto, contabilização e checagem de recusa,
  // na ordem certa — ver o cabeçalho de claude.js para o porquê da ordem ser
  // fixa. Este módulo nunca chama o SDK direto.
  const resposta = await chamarEstruturado(TIPOS.PERFIL, {
    max_tokens: MAX_TOKENS,
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
