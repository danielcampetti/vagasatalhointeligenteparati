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
  //
  // A leitura do File entra no try: o arquivo pode ter sido movido, renomeado
  // ou perdido a permissão entre a seleção no input e este ponto, e aí
  // `.arrayBuffer()` lança um DOMException cru (NotReadableError) que não
  // pode vazar pra tela em inglês, sem menção à textarea.
  let arrayBuffer
  try {
    arrayBuffer =
      typeof arquivoOuBuffer?.arrayBuffer === 'function'
        ? await arquivoOuBuffer.arrayBuffer()
        : arquivoOuBuffer
  } catch (err) {
    console.warn('[docx] falha ao ler o arquivo selecionado:', err)
    throw new Error(
      'Não foi possível abrir este arquivo — ele pode ter sido movido, renomeado ou perdido a permissão de leitura depois que você o selecionou. Selecione o arquivo de novo, ou cole o texto no campo abaixo.',
    )
  }

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
    // A mensagem do jszip é inglês cru com URL de documentação — inútil pro
    // aluno. As causas reais de um .docx que não abre são duas: um .doc
    // antigo (Word 97-2003) só renomeado (o caso que o topo deste arquivo já
    // marca como fora de escopo), ou o arquivo genuinamente corrompido.
    // "Senha" foi removido daqui por ser um chute, não uma causa observada.
    console.warn('[docx] falha ao interpretar o .docx:', err)
    throw new Error(
      'Não foi possível ler este arquivo como .docx — pode ser um .doc antigo (Word 97-2003) só renomeado, ou o arquivo pode estar corrompido. Abra-o e cole o texto no campo abaixo.',
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
