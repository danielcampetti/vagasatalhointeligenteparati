export default function PainelIA({
  cv,
  arrastando,
  onArquivo,
  onArrastarSobre,
  onArrastarSair,
  onSoltar,
  onRemoverCv,
  instrucao,
  onInstrucao,
  onRestaurar,
}) {
  const cartao = {
    border: '1px solid rgba(255,255,255,0.06)',
    background: '#0B1220',
    borderRadius: 12,
    padding: 20,
    marginBottom: 18,
    maxWidth: 820,
  }
  const palavras = instrucao.trim().split(/\s+/).filter(Boolean).length

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

        {!cv && (
          <label
            onDragOver={onArrastarSobre}
            onDragLeave={onArrastarSair}
            onDrop={onSoltar}
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
              accept=".pdf,.doc,.docx"
              onChange={onArquivo}
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
              PDF, DOC ou DOCX até 5 MB
            </div>
          </label>
        )}

        {cv && (
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
                {cv.nome}
              </div>
              <div style={{ fontSize: 11.5, color: '#8A94A6', marginTop: 2 }}>
                {cv.tamanho} · enviado agora
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
                accept=".pdf,.doc,.docx"
                onChange={onArquivo}
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
