/**
 * A justificativa detalhada de UMA vaga, quando o usuário a abre.
 *
 * É a única das três chamadas que recebe o **texto cru** do currículo — é para
 * isso que ele fica guardado. No ranking o perfil basta, e é justamente o que
 * torna o lote barato; misturar o texto cru ali destruiria essa economia.
 *
 * Não persiste: reabrir a vaga refaz a chamada, ~US$ 0,02. Guardar exigiria
 * mais um cache para invalidar toda vez que o perfil mudasse — mais estado
 * para uma tela que já é barata de recalcular.
 */
import { TIPOS, chamarTexto } from './claude'
import { resumirVaga } from './ranking'

/**
 * Currículo antigo pode ter sido salvo antes do texto cru existir — por isso
 * a degradação para "use só o perfil" em vez de colar `undefined` numa
 * chamada paga.
 */
export function montarPrompt(perfil, texto, vaga) {
  const curriculo = texto
    ? `\n\nCurrículo completo:\n${texto}`
    : '\n\n(O texto completo do currículo não está disponível — use só o perfil.)'

  return `Perfil do candidato:\n${JSON.stringify(perfil, null, 2)}${curriculo}\n\nVaga:\n${JSON.stringify(resumirVaga(vaga), null, 2)}`
}

export async function justificar(perfil, texto, instrucao, vaga) {
  // `chamarTexto`, não `chamarEstruturado`: a saída aqui é prosa para o
  // aluno ler, sem schema — o invólucro já cuida de teto, contagem e recusa.
  const resposta = await chamarTexto(TIPOS.JUSTIFICATIVA, {
    max_tokens: 2000,
    system: `${instrucao}\n\nExplique em dois ou três parágrafos curtos por que esta vaga combina ou não com este candidato. Seja concreto: cite as tecnologias que casam e as que faltam. Não invente requisito que não está no anúncio nem experiência que não está no currículo. Campo null no perfil significa que o currículo não informa aquilo — diga isso em vez de supor.`,
    messages: [{ role: 'user', content: montarPrompt(perfil, texto, vaga) }],
  })

  // Um bloco por parágrafo é o normal, mas a API pode intercalar outros tipos
  // (ex.: raciocínio interno) — só `type: 'text'` é prosa para mostrar.
  return resposta.content
    .filter((bloco) => bloco.type === 'text')
    .map((bloco) => bloco.text)
    .join('\n\n')
}
