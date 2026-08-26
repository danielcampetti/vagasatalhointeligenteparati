import fs from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test, vi } from 'vitest'
import mammoth from 'mammoth'
import { extrairDocx } from './docx'

// `require`, não `import`: é o jeito mais direto de pegar exatamente o
// arquivo que o campo "browser" do package.json do mammoth substitui na hora
// de empacotar pra produção, sem depender de o Vite replicar essa resolução
// dentro do vitest (que ele não replica — ver o teste mais abaixo).
const require = createRequire(import.meta.url)
const { openZip: abrirZipDeNavegador } = require('mammoth/browser/unzip.js')

// `path.join` a partir da pasta deste arquivo em vez de um caminho relativo
// ao cwd: o vitest normalmente já roda da raiz do projeto, mas isso não
// depende disso continuar sendo verdade. `new URL('./x', import.meta.url)`
// faria o mesmo em Node puro, mas o Vite trata essa forma exata como
// referência de asset e reescreve para uma URL http do dev server — que o
// `fs.readFileSync` recusa. `fileURLToPath` não cai nesse tratamento especial.
const PASTA_DESTE_ARQUIVO = path.dirname(fileURLToPath(import.meta.url))

function fixture() {
  const buffer = fs.readFileSync(
    path.join(PASTA_DESTE_ARQUIVO, '__fixtures__', 'curriculo.docx'),
  )
  // Cópia para um ArrayBuffer construído neste realm (o do jsdom da suíte),
  // não o do node:fs — mesmo motivo do duck typing em docx.js: o jszip por
  // baixo do mammoth faz `instanceof ArrayBuffer` internamente, e isso falha
  // contra um ArrayBuffer de outro realm mesmo sendo estruturalmente igual.
  // Só aparece quando o teste do build de navegador (mais abaixo) chama o
  // jszip com o ArrayBuffer cru — os outros testes passam pelo build de Node,
  // que converte tudo para Buffer antes, escondendo o problema.
  const arrayBuffer = new ArrayBuffer(buffer.byteLength)
  new Uint8Array(arrayBuffer).set(buffer)
  return arrayBuffer
}

// Um .docx válido, com as três partes mínimas de sempre, mas cujo único
// parágrafo não tem `<w:t>` nenhum. Vem embutido em base64 em vez de virar um
// segundo arquivo em __fixtures__ porque só serve a este teste — a diferença
// para o "corrompido" é justamente essa: aqui o zip abre igual ao da fixture
// principal, só que sem texto dentro.
const DOCX_SEM_TEXTO_BASE64 =
  'UEsDBBQAAAAIACuXGl2ZCVxZiwAAAK4AAAARAAAAd29yZC9kb2N1bWVudC54bWxFjUEOgjAQRa9CZi+DLowhFHaeQA9Q2xFI6EzTqSK3tyyMq5+Xn7zXDZ+wVG9KOgsbONYNVMRO/MyjgfvterhApdmyt4swGdhIYei7tfXiXoE4V0XA2q4Gppxji6huomC1lkhcvqekYHPBNOIqycckjlSLPyx4apozBjsz7MqH+G3fiH2HP8R/qv8CUEsDBBQAAAAIACuXGl2WsN0u5AAAAHUBAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbJWQvVLDMAzHX8WnlUscGDiOS9KBjxEYygPobCXx1ZZ9llvat8dpoQMbo/3/+EnqN8fg1YGyuMgD3LYdKGITreN5gM/ta/MASgqyRR+ZBjiRwGbst6dEomqWZYCllPSotZiFAkobE3FVppgDlvrMs05odjiTvuu6e20iF+LSlLUDxv6ZJtz7ol6O9fsyRyYvoJ4uxpU1AKbkncFSdX1g+4fS/BDamjx7ZHFJbqoB9Ni/1wWzs6Q+MJc3DLVOf8VstY1mHyqiXY3/4sVpcoau+bUt5WhIpF4u+PaqBHT8O4c+n238BlBLAwQUAAAACAArlxpdm/036q0AAAApAQAACwAAAF9yZWxzLy5yZWxzjc87DsIwDAbgq0TeaVoGhFDTLgipKyoHsBI3rWgeSsKjtycDA0UMjLZ/f5br9mlmdqcQJ2cFVEUJjKx0arJawKU/bfbAYkKrcHaWBCwUoW3qM82Y8kocJx9ZNmwUMKbkD5xHOZLBWDhPNk8GFwymXAbNPcorauLbstzx8GnA2mSdEhA6VQHrF0//2G4YJklHJ2+GbPpx4iuRZQyakoCHC4qrd7vILPCm5qsXmxdQSwECFAAUAAAACAArlxpdmQlcWYsAAACuAAAAEQAAAAAAAAAAAAAAAAAAAAAAd29yZC9kb2N1bWVudC54bWxQSwECFAAUAAAACAArlxpdlrDdLuQAAAB1AQAAEwAAAAAAAAAAAAAAAAC6AAAAW0NvbnRlbnRfVHlwZXNdLnhtbFBLAQIUABQAAAAIACuXGl2b/TfqrQAAACkBAAALAAAAAAAAAAAAAAAAAM8BAABfcmVscy8ucmVsc1BLBQYAAAAAAwADALkAAAClAgAAAAA='

function fixtureSemTexto() {
  const buffer = Buffer.from(DOCX_SEM_TEXTO_BASE64, 'base64')
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  )
}

describe('extrairDocx', () => {
  test('devolve o texto do documento', async () => {
    const texto = await extrairDocx(fixture())
    expect(texto).toContain('Maria Silva')
    expect(texto).toContain('Caxias do Sul')
  })

  test('não devolve marcação XML', async () => {
    const texto = await extrairDocx(fixture())
    expect(texto).not.toContain('<w:')
  })

  // A entrada do navegador é um File, não um ArrayBuffer — os outros testes
  // usam o segundo porque é mais simples de montar aqui, mas se o caminho do
  // File quebrasse nenhum deles perceberia.
  test('aceita também um File, que é o que o input do navegador dá', async () => {
    const arquivo = new File([fixture()], 'curriculo.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    })
    const texto = await extrairDocx(arquivo)
    expect(texto).toContain('Maria Silva')
    expect(texto).toContain('Caxias do Sul')
  })

  // Simula o arquivo sumindo entre a seleção e a leitura (movido, renomeado,
  // permissão revogada): um objeto que se parece com File o bastante para
  // passar na detecção por duck typing, mas cujo `arrayBuffer()` rejeita como
  // o navegador faria (DOMException NotReadableError). Um File de verdade lido
  // em memória, como nos outros testes, nunca falha desse jeito — por isso
  // precisa ser simulado.
  test('arquivo que some antes da leitura lança em português, sem DOMException crua', async () => {
    const arquivoInacessivel = {
      arrayBuffer: () =>
        Promise.reject(new DOMException('boom', 'NotReadableError')),
    }
    const erro = await extrairDocx(arquivoInacessivel).catch((e) => e)
    expect(erro).toBeInstanceOf(Error)
    expect(erro.message).toMatch(/não foi possível abrir este arquivo/i)
    expect(erro.message).toMatch(/selecione o arquivo de novo|cole o texto/i)
    expect(erro.message).not.toMatch(/NotReadableError/i)
  })

  test('arquivo corrompido lança mensagem em português, sem detalhe técnico do jszip', async () => {
    const lixo = new TextEncoder().encode('isto não é um docx').buffer
    const erro = await extrairDocx(lixo).catch((e) => e)
    expect(erro).toBeInstanceOf(Error)
    expect(erro.message).toMatch(/não foi possível ler/i)
    // As causas citadas têm que ser reais (doc antigo ou corrompido), não a
    // string do jszip vazando pra tela do aluno com link de documentação.
    expect(erro.message).toMatch(/doc antigo|corrompido/i)
    expect(erro.message).not.toMatch(/jszip|http/i)
  })

  test('documento sem texto lança em vez de devolver vazio', async () => {
    // Um .docx válido e vazio é indistinguível de uma falha silenciosa lá na
    // frente: melhor falhar aqui, onde dá para oferecer a textarea. Por isso
    // a entrada aqui precisa ser um zip que abre de verdade (fixtureSemTexto),
    // e não bytes quaisquer — bytes quaisquer testariam de novo o caminho do
    // arquivo corrompido, não este.
    await expect(extrairDocx(fixtureSemTexto())).rejects.toThrow(
      /não tem texto/i,
    )
  })

  // O vitest resolve `mammoth/lib/unzip.js` (o build de Node: só olha `path`
  // e `buffer`); o app publicado, empacotado pelo Vite, resolve
  // `mammoth/browser/unzip.js` (só olha `arrayBuffer`) via o campo "browser"
  // do package.json do mammoth — o vitest não replica essa troca. Isso quer
  // dizer que nenhum teste acima nota se a chave `arrayBuffer` sumir da
  // chamada em docx.js: a suíte inteira continuaria verde enquanto todo
  // upload real, no navegador, quebraria com "Could not find file in
  // options". Este teste captura as opções que `extrairDocx` de fato manda
  // pro mammoth e roda essas mesmas opções pelo `openZip` do build de
  // navegador de verdade — o único jeito de travar a chave que a suíte,
  // sozinha, não protege.
  test('as opções mandadas pro mammoth abrem também no build de navegador', async () => {
    const espiao = vi.spyOn(mammoth, 'extractRawText')
    await extrairDocx(fixture())
    const opcoesEnviadas = espiao.mock.calls.at(-1)[0]
    espiao.mockRestore()

    await expect(abrirZipDeNavegador(opcoesEnviadas)).resolves.toBeTruthy()
  })
})
