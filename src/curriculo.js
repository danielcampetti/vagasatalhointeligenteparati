/**
 * O currículo do candidato, persistido.
 *
 * Chave própria, separada do `vagas:cota`: ciclo de vida diferente, e "Limpar
 * cache" não pode levar o currículo junto.
 *
 * Guarda três coisas que parecem uma só:
 *
 *   perfil      o que a IA extraiu
 *   correcoes   o que o aluno corrigiu por cima
 *   texto       o texto cru, para a justificativa detalhada
 *
 * `correcoes` fica separado de propósito. Se o schema melhorar e o perfil for
 * re-extraído, a correção do aluno sobrevive — e dá para oferecer "voltar ao
 * que a IA entendeu", impossível se a correção sobrescrevesse.
 *
 * Toda leitura é defensiva, pelo mesmo motivo do `cota.js`: aba anônima,
 * storage bloqueado ou valor corrompido por uma versão anterior fazem o acesso
 * lançar, e a tela não pode quebrar por causa disso.
 */

/** Sobe quando a forma do perfil mudar. Versão desconhecida é descartada. */
export const VERSAO = 1

const CHAVE = 'vagas:cv'

export function lerCurriculo() {
  try {
    const cru = localStorage.getItem(CHAVE)
    if (!cru) return null
    const dados = JSON.parse(cru)
    // Migrar um formato antigo daria mais erro que valor: o perfil velho
    // alimentaria um prompt novo em silêncio. Melhor pedir o currículo de novo.
    if (dados?.versao !== VERSAO) return null
    return {
      versao: VERSAO,
      arquivo: dados.arquivo ?? null,
      texto: typeof dados.texto === 'string' ? dados.texto : '',
      perfil: dados.perfil ?? null,
      correcoes:
        dados.correcoes && typeof dados.correcoes === 'object'
          ? dados.correcoes
          : {},
      instrucao: typeof dados.instrucao === 'string' ? dados.instrucao : null,
    }
  } catch {
    return null
  }
}

function gravar(cv) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(cv))
  } catch {
    // Storage cheio ou bloqueado: vale nesta sessão e some no reload.
  }
  return cv
}

/**
 * Grava um currículo novo. As correções e a instrução do anterior ficam —
 * trocar o arquivo não é motivo para o aluno redigitar a pretensão salarial.
 */
export function gravarCurriculo({ arquivo, texto, perfil }) {
  const anterior = lerCurriculo()
  return gravar({
    versao: VERSAO,
    arquivo,
    texto: texto ?? '',
    perfil,
    correcoes: anterior?.correcoes ?? {},
    instrucao: anterior?.instrucao ?? null,
  })
}

/** O perfil que as chamadas usam: o extraído, com as correções por cima. */
export function perfilEfetivo(cv) {
  if (!cv?.perfil) return null
  return { ...cv.perfil, ...cv.correcoes }
}

export function corrigirPerfil(campo, valor) {
  const cv = lerCurriculo()
  if (!cv) return null
  return gravar({ ...cv, correcoes: { ...cv.correcoes, [campo]: valor } })
}

export function limparCorrecoes() {
  const cv = lerCurriculo()
  if (!cv) return null
  return gravar({ ...cv, correcoes: {} })
}

export function definirInstrucao(texto) {
  const cv = lerCurriculo()
  if (!cv) return null
  return gravar({ ...cv, instrucao: texto })
}

/** Apaga de verdade. O botão da tela chama isto, não um setState. */
export function removerCurriculo() {
  try {
    localStorage.removeItem(CHAVE)
  } catch {
    // Nada a fazer: se não dá para escrever, não dá para apagar.
  }
}
