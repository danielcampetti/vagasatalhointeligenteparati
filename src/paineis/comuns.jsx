/*
 * Componentes pequenos extraídos do App.jsx que não pertencem a nenhum painel
 * específico: usados tanto pelo App quanto pelos painéis, por isso moram num
 * arquivo neutro em vez de dentro de um dos dois (o que criaria import circular).
 */

/**
 * Erro da busca. As mensagens vêm do `jsearch.js` já traduzidas — dizem o que
 * fazer (conferir o .env, esperar a renovação da cota) em vez de só o status.
 */
export function AvisoErro({ texto }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 14,
        padding: '13px 16px',
        borderRadius: 10,
        border: '1px solid rgba(248,113,113,0.32)',
        background: 'rgba(248,113,113,0.08)',
        fontSize: 13,
        color: '#F0A0A0',
        lineHeight: 1.6,
        maxWidth: 860,
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        style={{ flex: '0 0 16px', marginTop: 2 }}
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7.5v5M12 16h.01" />
      </svg>
      <span>{texto}</span>
    </div>
  )
}

/** Espera de uma chamada de rede. Um giro só, sem etapa detalhada. */
export function Carregando({ texto = 'Analisando currículo e comparando vagas...' }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
        minHeight: 220,
      }}
    >
      <div
        style={{
          width: 34,
          height: 34,
          borderRadius: '50%',
          border: '2.5px solid rgba(167,139,250,0.22)',
          borderTopColor: '#A78BFA',
          animation: 'girar 0.8s linear infinite',
        }}
      />
      <div style={{ fontSize: 13.5, color: '#8A94A6' }}>
        {texto}
      </div>
    </div>
  )
}
