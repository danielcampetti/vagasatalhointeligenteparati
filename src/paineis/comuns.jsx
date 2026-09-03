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

/**
 * Uma ressalva sobre algo que deu certo pela metade.
 *
 * Não é o `AvisoErro`: em âmbar e dispensável, porque o que a pessoa pediu
 * aconteceu — o acessório é que não. O caso que o trouxe é o arquivamento: a
 * busca foi à API, gastou cota e as vagas estão na tela; o que falhou foi
 * mandá-las para o acervo compartilhado. Pintar isso de vermelho diria que a
 * busca falhou, e não falhou; não dizer nada deixaria quem buscou acreditando
 * que o resultado foi guardado.
 *
 * Dispensável porque é informação, não pendência: quem leu já sabe, e a linha
 * não pode ficar entre a pessoa e a lista que ela pediu.
 */
export function AvisoRessalva({ texto, onDispensar }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 14,
        padding: '11px 14px',
        borderRadius: 10,
        border: '1px solid rgba(251,191,36,0.28)',
        background: 'rgba(251,191,36,0.07)',
        fontSize: 13,
        color: '#E3C078',
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
        <path d="M12 4.5 2.5 20h19L12 4.5z" />
        <path d="M12 10v4M12 17h.01" />
      </svg>
      <span style={{ flex: 1 }}>{texto}</span>
      <button
        type="button"
        onClick={onDispensar}
        aria-label="Dispensar aviso"
        title="Dispensar"
        style={{
          flex: '0 0 auto',
          background: 'none',
          border: 'none',
          color: 'inherit',
          cursor: 'pointer',
          fontSize: 16,
          lineHeight: 1,
          padding: '0 2px',
          opacity: 0.7,
        }}
      >
        ×
      </button>
    </div>
  )
}

/**
 * Espera de uma chamada de rede.
 *
 * O `detalhe` é a segunda linha, opcional. Ele existe para a espera do
 * ranking, que dura ~25s: quem está olhando precisa saber que a lista não vem
 * antes da nota, senão a demora parece defeito — que é exatamente a impressão
 * que a tabela-primeiro-notas-depois causava antes. Quem tem uma etapa só
 * continua passando só `texto`.
 */
export function Carregando({
  texto = 'Analisando currículo e comparando vagas...',
  detalhe = null,
}) {
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
      {detalhe && (
        <div
          style={{
            fontSize: 12.5,
            color: '#5F6B7E',
            marginTop: -8,
            maxWidth: 320,
            textAlign: 'center',
            lineHeight: 1.6,
          }}
        >
          {detalhe}
        </div>
      )}
    </div>
  )
}
