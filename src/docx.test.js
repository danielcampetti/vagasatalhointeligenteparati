import fs from 'node:fs'
import { describe, expect, test } from 'vitest'
import { extrairDocx } from './docx'

function fixture() {
  const buffer = fs.readFileSync('src/__fixtures__/curriculo.docx')
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  )
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
  })

  test('arquivo corrompido lança com mensagem em português', async () => {
    const lixo = new TextEncoder().encode('isto não é um docx').buffer
    await expect(extrairDocx(lixo)).rejects.toThrow(/não foi possível ler/i)
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
})
