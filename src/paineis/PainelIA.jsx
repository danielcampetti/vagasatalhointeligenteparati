import { useState } from 'react'
import { mensagemDoErro } from '../api/claude'
import { extrairPerfil } from '../api/perfil'
import { gravarCurriculo } from '../curriculo'
import { extrairDocx } from '../docx'
import { AvisoErro, Carregando } from './comuns'

/** `FileReader` devolve `data:...;base64,XXXX` — só o pedaço depois da vírgula
 * é o que a Claude aceita como bloco `document`. */
function paraBase64(arquivo) {
  return new Promise((ok, falha) => {
    const leitor = new FileReader()
    leitor.onload = () => ok(String(leitor.result).split(',')[1])
    leitor.onerror = () => falha(new Error('Não foi possível ler o arquivo.'))
    leitor.readAsDataURL(arquivo)
  })
}

function formatarTamanho(bytes) {
  const kb = bytes / 1024
  return kb > 1024
    ? `${(kb / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(kb))} KB`
}

export default function PainelIA({
  cv,
  onCv,
  arrastando,
  onArrastarSobre,
  onArrastarSair,
  onRemoverCv,
  instrucao,
  onInstrucao,
  onRestaurar,
}) {
  const [lendo, setLendo] = useState(false)
  const [erro, setErro] = useState(null)
  const [textoColado, setTextoColado] = useState('')

  const cartao = {
    border: '1px solid rgba(255,255,255,0.06)',
    background: '#0B1220',
    borderRadius: 12,
    padding: 20,
    marginBottom: 18,
    maxWidth: 820,
  }
  const palavras = instrucao.trim().split(/\s+/).filter(Boolean).length

  // `.pdf` vai pro bloco `document` da Claude, que lê nativamente. Qualquer
  // outra extensão passa pelo caminho de texto (`extrairDocx`, via mammoth):
  // um `.doc` renomeado ou um arquivo não relacionado caem lá também, e o
  // `mammoth` já lança a mensagem certa pros dois casos — não precisa de
  // guarda extra aqui.
  async function enviarArquivo(arquivo) {
    setErro(null)
    setLendo(true)
    const ehPdf = arquivo.name.toLowerCase().endsWith('.pdf')

    // Leitura local (mammoth para .docx, FileReader para .pdf em base64) não
    // fala com a Claude — nunca sai da máquina. O erro daqui já é um Error
    // comum com mensagem própria, pronta e em português (ver docx.js e
    // paraBase64 acima); mostrar `err.message` direto, sem passar por
    // `mensagemDoErro`, que prefixaria "Erro inesperado:" numa mensagem que
    // não tem nada de inesperado — é esperada e diz o que fazer.
    let conteudo
    try {
      conteudo = ehPdf
        ? { base64: await paraBase64(arquivo) }
        : { texto: await extrairDocx(arquivo) }
    } catch (err) {
      setErro(err.message)
      setLendo(false)
      return
    }

    // Daqui em diante é a chamada à Claude: erro de teto, de rede, de recusa
    // ou de perfil oco, todos cobertos por `mensagemDoErro`.
    try {
      const perfil = await extrairPerfil(conteudo)
      const novoCv = gravarCurriculo({
        arquivo: {
          nome: arquivo.name,
          tamanho: formatarTamanho(arquivo.size),
          quando: new Date().toISOString(),
        },
        texto: conteudo.texto ?? '',
        perfil,
      })
      onCv(novoCv)
    } catch (err) {
      setErro(mensagemDoErro(err))
    } finally {
      setLendo(false)
    }
  }

  // Sem leitura local: o texto já chegou pronto da textarea. Mesmo caminho do
  // `.docx` depois da extração — `extrairPerfil({ texto })` — porque colar é
  // só outra forma de chegar no mesmo texto que o mammoth devolveria.
  async function enviarTexto() {
    setErro(null)
    setLendo(true)
    try {
      const perfil = await extrairPerfil({ texto: textoColado })
      const novoCv = gravarCurriculo({
        arquivo: {
          nome: 'texto colado',
          tamanho: formatarTamanho(new Blob([textoColado]).size),
          quando: new Date().toISOString(),
        },
        texto: textoColado,
        perfil,
      })
      onCv(novoCv)
      setTextoColado('')
    } catch (err) {
      setErro(mensagemDoErro(err))
    } finally {
      setLendo(false)
    }
  }

  function aoEscolherArquivo(e) {
    const arquivo = e.target.files && e.target.files[0]
    if (arquivo) enviarArquivo(arquivo)
  }

  function aoSoltar(e) {
    e.preventDefault()
    onArrastarSair()
    const arquivo = e.dataTransfer.files && e.dataTransfer.files[0]
    if (arquivo) enviarArquivo(arquivo)
  }

  return (
    <>
      <div style={cartao}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            marginBottom: 4,
          }}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#60A5FA"
            strokeWidth="1.8"
          >
            <path d="M14 3v5h5" />
            <path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
            <path d="M9 13h6M9 17h4" />
          </svg>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            Currículo do candidato
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: '#8A94A6', marginBottom: 12 }}>
          A IA compara este currículo com cada vaga para calcular o Rank IA.
        </div>

        {erro && <AvisoErro texto={erro} />}

        {lendo && <Carregando texto="Lendo currículo..." />}

        {!lendo && !cv && (
          <>
            <label
              onDragOver={onArrastarSobre}
              onDragLeave={onArrastarSair}
              onDrop={aoSoltar}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                padding: '28px 20px',
                borderRadius: 10,
                cursor: 'pointer',
                textAlign: 'center',
                border: `1px dashed ${arrastando ? 'rgba(59,130,246,0.6)' : 'rgba(255,255,255,0.14)'}`,
                background: arrastando ? 'rgba(37,99,235,0.12)' : '#0E1729',
              }}
            >
              <input
                type="file"
                accept=".pdf,.docx"
                onChange={aoEscolherArquivo}
                style={{ display: 'none' }}
              />
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#60A5FA"
                strokeWidth="1.7"
              >
                <path d="M12 16V4M8 8l4-4 4 4" />
                <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
              </svg>
              <div style={{ fontSize: 13.5, color: '#D3DAE6', fontWeight: 500 }}>
                Arraste seu currículo aqui ou clique para selecionar
              </div>
              <div style={{ fontSize: 11.5, color: '#7C8699' }}>
                PDF ou DOCX até 5 MB
              </div>
            </label>

            {/* .doc, .odt, exportação do LinkedIn e qualquer formato que o
             * dropzone não lê caem aqui — e é também para onde toda mensagem
             * de erro do sistema manda quem esbarrou num arquivo que não
             * abre. Por isso fica sempre junto do dropzone, não escondida
             * atrás de um "outra opção". */}
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 12, color: '#7C8699', marginBottom: 8 }}>
                Currículo em .doc, .odt, exportado do LinkedIn ou outro
                formato? Cole o texto aqui.
              </div>
              <textarea
                value={textoColado}
                onChange={(e) => setTextoColado(e.target.value)}
                rows={6}
                placeholder="Cole aqui o texto do currículo"
                style={{
                  width: '100%',
                  padding: 12,
                  borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.09)',
                  background: '#0E1729',
                  color: '#D3DAE6',
                  fontSize: 13,
                  lineHeight: 1.55,
                  outline: 'none',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                }}
              />
              <button
                onClick={enviarTexto}
                disabled={!textoColado.trim() || lendo}
                className={
                  !textoColado.trim() || lendo
                    ? 'bg-[#2A3B5E]'
                    : 'bg-[#2563EB] hover:bg-[#1D4FD8]'
                }
                style={{
                  marginTop: 10,
                  padding: '9px 16px',
                  borderRadius: 9,
                  border: 'none',
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: !textoColado.trim() || lendo ? 'not-allowed' : 'pointer',
                }}
              >
                Usar este texto
              </button>
            </div>
          </>
        )}

        {!lendo && cv && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: 14,
              borderRadius: 10,
              border: '1px solid rgba(59,130,246,0.28)',
              background: 'rgba(37,99,235,0.08)',
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                flex: '0 0 36px',
                borderRadius: 9,
                background: 'rgba(37,99,235,0.18)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#93B4FD"
                strokeWidth="1.8"
              >
                <path d="M14 3v5h5" />
                <path d="M6 3h8l5 5v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontSize: 13.5,
                  fontWeight: 500,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {cv.arquivo.nome}
              </div>
              <div style={{ fontSize: 11.5, color: '#8A94A6', marginTop: 2 }}>
                {cv.arquivo.tamanho} · enviado agora
              </div>
            </div>
            <label
              className="hover:bg-white/[0.05]"
              style={{
                padding: '8px 13px',
                borderRadius: 9,
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#C8D1E0',
                fontSize: 12.5,
                cursor: 'pointer',
              }}
            >
              Substituir
              <input
                type="file"
                accept=".pdf,.docx"
                onChange={aoEscolherArquivo}
                style={{ display: 'none' }}
              />
            </label>
            <button
              onClick={onRemoverCv}
              className="bg-transparent text-[#8A94A6] hover:bg-[rgba(239,68,68,0.1)] hover:text-[#FCA5A5]"
              style={{
                width: 32,
                height: 32,
                borderRadius: 9,
                border: '1px solid rgba(255,255,255,0.1)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.9"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        )}
      </div>

      <div style={cartao}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            marginBottom: 4,
          }}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#60A5FA"
            strokeWidth="1.8"
          >
            <circle cx="12" cy="12" r="3.2" />
            <path d="M12 3.5v2.2M12 18.3v2.2M4.6 7.8l1.9 1.1M17.5 15.1l1.9 1.1M4.6 16.2l1.9-1.1M17.5 8.9l1.9-1.1" />
          </svg>
          <div style={{ fontSize: 15, fontWeight: 600 }}>
            Instrução de Avaliação de Ranking
          </div>
        </div>
        <div style={{ fontSize: 12.5, color: '#8A94A6', marginBottom: 12 }}>
          Este texto orienta como a IA pontua cada vaga de 0 a 100.
        </div>
        <textarea
          value={instrucao}
          onChange={onInstrucao}
          rows={11}
          style={{
            width: '100%',
            padding: 14,
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.09)',
            background: '#0E1729',
            color: '#D3DAE6',
            fontSize: 13,
            lineHeight: 1.65,
            outline: 'none',
            resize: 'vertical',
            fontFamily: 'inherit',
          }}
        />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 12,
          }}
        >
          <button
            onClick={onRestaurar}
            className="bg-transparent hover:bg-white/[0.05]"
            style={{
              padding: '9px 16px',
              borderRadius: 9,
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#C8D1E0',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Restaurar padrão
          </button>
          <span style={{ fontSize: 12, color: '#7C8699' }}>
            {palavras} palavras
          </span>
        </div>
      </div>
    </>
  )
}
