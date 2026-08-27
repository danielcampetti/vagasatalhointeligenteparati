import { AvisoErro, Carregando } from './comuns'
import CampoCidade from './CampoCidade'

/**
 * Aba Vaga Inteligente: a busca que o aluno não precisa saber formular.
 *
 * O mecanismo, ligado:
 *
 *   1. o cargo vem do perfil já extraído no upload (`cargo_deduzido`) — sem
 *      chamada nova à Claude aqui; o aluno informa só a cidade
 *   2. a JSearch busca por (cargo deduzido + cidade), com cache-first: uma
 *      consulta repetida não gasta das 200 requisições do mês
 *   3. a Claude compara as vagas com o currículo e dá uma nota a cada uma
 *   4. a lista aparece assim que a JSearch volta; as notas chegam depois —
 *      `buscando` cobre o passo 2, `ranqueando` cobre o passo 3
 *
 * O currículo é o mesmo da aba Avaliação IA: um só no app inteiro. Sem CV
 * enviado, esta aba não tem o que fazer e manda o aluno para lá.
 */
export default function PainelVagaInteligente({
  cv,
  cidade,
  onCidade,
  buscando,
  ranqueando,
  buscaFeita,
  vagas,
  erro,
  onBuscar,
  onIrParaCurriculo,
}) {
  const cartao = {
    border: '1px solid rgba(255,255,255,0.07)',
    background: '#0B1220',
    borderRadius: 12,
    padding: 20,
  }
  const legenda = {
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
    color: '#7C8699',
  }

  // Sem currículo não há o que deduzir nem com o que comparar: metade do
  // mecanismo depende dele.
  if (!cv) {
    return (
      <div
        style={{
          ...cartao,
          maxWidth: 880,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 14,
          padding: '72px 24px',
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: 16,
            border: '1px solid rgba(139,92,246,0.28)',
            background: 'rgba(139,92,246,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#A78BFA"
            strokeWidth="1.6"
          >
            <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
            <path d="M14 3v5h5M9 13h6M9 17h4" />
          </svg>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600 }}>
          Envie seu currículo para começar
        </div>
        <div
          style={{
            fontSize: 13.5,
            color: '#8A94A6',
            maxWidth: 400,
            lineHeight: 1.6,
          }}
        >
          A busca inteligente parte do currículo: é dele que a IA deduz o cargo
          e é contra ele que cada vaga é comparada. O envio fica na aba
          Avaliação IA — o mesmo currículo vale para as duas.
        </div>
        <button
          onClick={onIrParaCurriculo}
          className="bg-[rgba(139,92,246,0.14)] hover:bg-[rgba(139,92,246,0.22)]"
          style={{
            marginTop: 4,
            padding: '10px 18px',
            borderRadius: 9,
            border: '1px solid rgba(167,139,250,0.42)',
            color: '#C4B5FD',
            fontSize: 13.5,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Ir para Avaliação IA
        </button>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxWidth: 880,
      }}
    >
      <div
        style={{
          ...cartao,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 18px',
        }}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#4ADE80"
          strokeWidth="2.2"
          style={{ flex: '0 0 17px' }}
        >
          <path d="M4 12.5l5 5L20 6.5" />
        </svg>
        <span style={{ fontSize: 13.5, color: '#D3DAE6' }}>
          Currículo: <strong style={{ fontWeight: 600 }}>{cv.arquivo.nome}</strong>
        </span>
        <span style={{ fontSize: 12.5, color: '#7C8699' }}>{cv.arquivo.tamanho}</span>
      </div>

      <div style={cartao}>
        <div style={{ ...legenda, marginBottom: 12 }}>
          Onde você quer trabalhar
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
            padding: '12px 14px',
            borderRadius: 10,
            border: `1px solid ${cidade ? 'rgba(139,92,246,0.35)' : 'rgba(255,255,255,0.09)'}`,
            background: '#0E1729',
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#A78BFA"
            strokeWidth="1.9"
            style={{ flex: '0 0 18px' }}
          >
            <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11Z" />
            <circle cx="12" cy="10" r="2.6" />
          </svg>

          <CampoCidade valor={cidade} onEscolher={onCidade} />

          <button
            onClick={onBuscar}
            // A fase de ranking (`ranqueando`) dura vários segundos com a
            // lista já na tela; sem isto o botão fica clicável e inerte
            // nesse intervalo — `onBuscar` recusaria de qualquer forma
            // (`buscarInteligente` guarda `if (buscandoIa || ranqueandoIa)
            // return`), mas sem avisar por que o clique não fez nada.
            disabled={buscando || ranqueando}
            className={
              buscando
                ? 'bg-[#3F3A63]'
                : 'bg-[#7C3AED] hover:bg-[#6D28D9]'
            }
            style={{
              flex: '0 0 auto',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 18px',
              borderRadius: 9,
              border: 'none',
              color: '#fff',
              fontSize: 13.5,
              fontWeight: 600,
              cursor: buscando ? 'wait' : 'pointer',
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
              <path d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3M6.7 6.7l2.1 2.1M15.2 15.2l2.1 2.1M6.7 17.3l2.1-2.1M15.2 8.8l2.1-2.1" />
            </svg>
            {buscando ? 'Buscando...' : 'Buscar vagas compatíveis'}
          </button>
        </div>

        <div
          style={{
            marginTop: 12,
            fontSize: 12.5,
            color: '#7C8699',
            lineHeight: 1.6,
          }}
        >
          Você não escolhe o cargo: a IA já deduziu do seu currículo quando ele
          foi enviado. Cada busca custa{' '}
          <strong style={{ color: '#B7C0D0' }}>1 requisição JSearch</strong>{' '}
          (ou zero, se a mesma consulta já estiver em cache) mais 1 chamada à
          Claude para comparar as vagas com o currículo. A aba Controle
          registra a parte da JSearch.
        </div>
      </div>

      <div style={{ ...cartao, minHeight: 260 }}>
        {erro && <AvisoErro texto={erro} />}
        {buscando ? (
          <Carregando texto="Buscando vagas para o cargo do seu currículo..." />
        ) : buscaFeita ? (
          <ResultadoInteligente vagas={vagas} ranqueando={ranqueando} />
        ) : (
          !erro && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                minHeight: 220,
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: 15, fontWeight: 600 }}>
                Informe a cidade e busque
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: '#8A94A6',
                  maxWidth: 420,
                  lineHeight: 1.6,
                }}
              >
                A JSearch procura as vagas do cargo já deduzido do seu
                currículo nessa cidade; a Claude compara cada uma com o seu
                perfil. O resultado volta ordenado por compatibilidade.
              </div>
            </div>
          )
        )}
      </div>
    </div>
  )
}

/**
 * O resultado da busca inteligente. Enquanto nada está conectado, o honesto é
 * nomear as três integrações que faltam — senão a tela parece só quebrada.
 *//**
 * O resultado da busca inteligente.
 *
 * Antes daqui existir de verdade, este componente mostrava um texto listando
 * "três ligações que ainda não existem". As três existem agora — cargo deduzido
 * na extração, JSearch, e ranking — então aquele texto virou mentira e saiu.
 *
 * Apresentação própria, mais simples que a tabela da aba Vagas: aquela depende
 * de ordenação, paginação, menu por linha e favoritos, estado que esta aba não
 * tem. Reaproveitá-la exigiria arrastar tudo isso junto para cá.
 */
function ResultadoInteligente({ vagas, ranqueando }) {
  if (!vagas.length) {
    // Busca rodou e não achou nada. Não é erro, e não deve parecer erro: o
    // aluno precisa saber que a consulta funcionou e o mercado é que está vazio.
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 10,
          padding: '30px 10px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600 }}>
          Nenhuma vaga encontrada
        </div>
        <div
          style={{
            fontSize: 13,
            color: '#8A94A6',
            maxWidth: 440,
            lineHeight: 1.6,
          }}
        >
          A busca rodou para o cargo do seu currículo nesta cidade e não trouxe
          resultado. Tente outra cidade, ou ajuste o cargo na aba Avaliação IA
          se ele não descreve bem o que você procura.
        </div>
      </div>
    )
  }

  // Ordena pela nota, maior primeiro. Vaga sem nota vai para o fim em vez de
  // sumir: ela é um resultado legítimo da busca, só não foi pontuada.
  const ordenadas = [...vagas].sort((a, b) => (b.rank ?? -1) - (a.rank ?? -1))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {ranqueando && (
        <div style={{ fontSize: 12.5, color: '#8A94A6', paddingBottom: 2 }}>
          As vagas já estão aqui; as notas estão sendo calculadas...
        </div>
      )}

      {ordenadas.map((vaga) => (
        <div
          key={vaga.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            border: '1px solid rgba(255,255,255,0.06)',
            background: '#0E1626',
            borderRadius: 10,
            padding: '12px 14px',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {vaga.cargo ?? 'Sem título'}
            </div>
            <div style={{ fontSize: 12.5, color: '#8A94A6', marginTop: 3 }}>
              {[vaga.empresa, vaga.cidade, vaga.modalidade]
                .filter(Boolean)
                .join(' · ')}
            </div>
            {vaga.rankMotivo && (
              <div style={{ fontSize: 12, color: '#7C8699', marginTop: 5 }}>
                {vaga.rankMotivo}
              </div>
            )}
          </div>

          <div style={{ textAlign: 'right', minWidth: 76 }}>
            {/* "Rank IA", nunca "%": a nota é relativa ao conjunto desta
                busca, e chamá-la de porcentagem afirmaria o que ela não é. */}
            <div style={{ fontSize: 11, color: '#7C8699' }}>Rank IA</div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                color: vaga.rank === null ? '#5A6478' : '#3B82F6',
              }}
            >
              {vaga.rank === null ? '—' : vaga.rank}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
