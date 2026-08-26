/**
 * `.docx` para texto, no navegador.
 *
 * Existe porque a Claude lê PDF nativamente mas não `.docx`, e porque `.docx` é
 * o formato mais comum de currículo. A saída entra no mesmo caminho do texto
 * colado na textarea — o `mammoth` não cria um fluxo novo, alimenta o que já
 * existe.
 *
 * `.doc` (Word binário, pré-2007) não passa por aqui: não há biblioteca de
 * navegador que o abra. Esse caso é da textarea.
 */
import mammoth from 'mammoth'

/** Aceita o `File` do input ou um `ArrayBuffer` já lido (o teste usa o segundo). */
export async function extrairDocx(arquivoOuBuffer) {
  // `instanceof ArrayBuffer` falha quando o buffer vem de outro realm — como o
  // do `fs.readFileSync` do teste, montado fora do jsdom da suíte. Detectar
  // pelo método `arrayBuffer()` (todo File/Blob tem; nenhum ArrayBuffer tem)
  // funciona nos dois realms e no navegador de verdade do mesmo jeito.
  const arrayBuffer =
    typeof arquivoOuBuffer?.arrayBuffer === 'function'
      ? await arquivoOuBuffer.arrayBuffer()
      : arquivoOuBuffer

  let resultado
  try {
    // O `mammoth` tem duas entradas de zip conforme o bundler resolve
    // `require("mammoth")`: no navegador (build via Vite) só `arrayBuffer` é
    // aceito; em Node puro (é o caso do teste, rodando sob vitest) só `path`
    // ou `buffer` são. Mandar os dois deixa cada build pegar o que reconhece,
    // sem depender de qual delas o empacotador escolheu.
    resultado = await mammoth.extractRawText({
      arrayBuffer,
      buffer:
        typeof Buffer === 'undefined' ? undefined : Buffer.from(arrayBuffer),
    })
  } catch (err) {
    throw new Error(
      `Não foi possível ler este .docx (${err.message}). Se ele estiver protegido por senha, abra no Word e cole o texto no campo abaixo.`,
    )
  }

  const texto = resultado.value.trim()
  // Um .docx que abre e não tem texto viraria um perfil oco lá na frente, longe
  // daqui, onde ninguém saberia o motivo. Falhar aqui deixa oferecer a textarea.
  if (!texto) {
    throw new Error(
      'Este .docx abriu mas não tem texto — se o currículo for uma imagem dentro do documento, exporte como PDF ou cole o texto no campo abaixo.',
    )
  }
  return texto
}
