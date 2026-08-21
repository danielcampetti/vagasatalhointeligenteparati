import { useEffect, useMemo, useState } from 'react'
import {
  CARGOS,
  INSTRUCAO_PADRAO,
  MODALIDADES,
  STATUS,
  VAGAS,
  VAGAS_BANCO,
} from './data/vagas'

/* ------------------------------------------------------------------ *
 * Protótipo frio: todo o estado vive em memória, nesta página.
 * Nada aqui faz requisição de rede — recarregar volta ao estado inicial.
 * ------------------------------------------------------------------ */

const COLUNAS =
  'minmax(150px,1.45fr) minmax(108px,0.9fr) minmax(108px,0.9fr) 96px 112px 104px 76px 96px 34px'

const TITULOS = {
  vagas: ['Vagas', 'Gerencie e acompanhe todas as vagas de TI'],
  banco: ['Banco de Dados', 'Histórico completo de vagas coletadas'],
  ia: ['Avaliação IA', 'Compatibilidade entre vagas e seu perfil'],
}

const ICONE_TITULO = {
  vagas: 'M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Zm6-2V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18',
  banco: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3v12c0 1.7-3.6 3-8 3s-8-1.3-8-3V6Zm0 6c0 1.7 3.6 3 8 3s8-1.3 8-3',
  ia: 'M15.2 12a3.2 3.2 0 1 1-6.4 0 3.2 3.2 0 0 1 6.4 0ZM12 3.5v2.2M12 18.3v2.2M4.6 7.8l1.9 1.1M17.5 15.1l1.9 1.1M4.6 16.2l1.9-1.1M17.5 8.9l1.9-1.1',
}

const SELETOR = {
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.07)',
  background: '#0B1220',
  color: '#C8D1E0',
  fontSize: 13.5,
  outline: 'none',
  cursor: 'pointer',
}

const PILULA = {
  display: 'inline-flex',
  borderRadius: 999,
  fontSize: 12,
  fontWeight: 500,
}

const ESTILO_MODALIDADE = {
  Remoto: {
    ...PILULA,
    padding: '5px 12px',
    background: 'rgba(37,99,235,0.16)',
    border: '1px solid rgba(59,130,246,0.34)',
    color: '#93B4FD',
  },
  Híbrido: {
    ...PILULA,
    padding: '5px 12px',
    background: 'rgba(139,92,246,0.16)',
    border: '1px solid rgba(167,139,250,0.34)',
    color: '#C4B5FD',
  },
  Presencial: {
    ...PILULA,
    padding: '5px 12px',
    background: 'rgba(245,158,11,0.14)',
    border: '1px solid rgba(251,191,36,0.34)',
    color: '#FCD34D',
  },
}

const ESTILO_STATUS = {
  Ativa: {
    ...PILULA,
    padding: '5px 13px',
    background: 'transparent',
    border: '1px solid rgba(52,211,153,0.38)',
    color: '#34D399',
  },
  Encerrada: {
    ...PILULA,
    padding: '5px 13px',
    background: 'transparent',
    border: '1px solid rgba(255,255,255,0.14)',
    color: '#8A94A6',
  },
  'Em análise': {
    ...PILULA,
    padding: '5px 13px',
    background: 'transparent',
    border: '1px solid rgba(59,130,246,0.4)',
    color: '#60A5FA',
  },
}

const CAMPO_MODAL = {
  padding: '10px 12px',
  borderRadius: 9,
  border: '1px solid rgba(255,255,255,0.09)',
  background: '#0E1729',
  color: '#E8ECF4',
  fontSize: 13.5,
  outline: 'none',
}

const FORM_VAZIO = {
  cargo: '',
  empresa: '',
  cidade: '',
  modalidade: 'Remoto',
  techs: '',
  min: '',
  max: '',
}

/* ---------------------------- helpers ---------------------------- */

/** Cor estável do "logo" da empresa, derivada do próprio nome. */
function corDaEmpresa(nome) {
  let h = 0
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) % 360
  return `hsl(${h} 52% 34%)`
}

function iniciais(nome) {
  const partes = nome
    .replace(/[^A-Za-zÀ-ÿ ]/g, ' ')
    .trim()
    .split(/\s+/)
  if (partes.length > 1) return (partes[0][0] + partes[1][0]).toUpperCase()
  return partes[0].slice(0, 2).toLowerCase()
}

/** 4.5 -> "4.500" */
function fmtMil(v) {
  return (v * 1000).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

/** Data de publicação = hoje menos `days`, para a lista nunca envelhecer. */
function fmtData(dias) {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

function faixaDoRank(n) {
  if (n >= 90) return { cor: '#22C55E', label: 'Excelente' }
  if (n >= 80) return { cor: '#22C55E', label: 'Muito bom' }
  if (n >= 70) return { cor: '#86EFAC', label: 'Bom' }
  if (n >= 60) return { cor: '#FACC15', label: 'Regular' }
  return { cor: '#FACC15', label: 'Baixo' }
}

/** Campos derivados usados tanto na tabela quanto nos cards. */
function derivar(vaga) {
  const faixa = faixaDoRank(vaga.rank)
  const circunferencia = 2 * Math.PI * 17
  return {
    salario: `R$ ${fmtMil(vaga.min)} – ${fmtMil(vaga.max)}`,
    data: fmtData(vaga.days),
    desde:
      vaga.days === 0
        ? 'Hoje'
        : vaga.days === 1
          ? 'Há 1 dia'
          : `Há ${vaga.days} dias`,
    rankCor: faixa.cor,
    rankLabel: faixa.label,
    dash: `${((circunferencia * vaga.rank) / 100).toFixed(1)} ${circunferencia.toFixed(1)}`,
    logoBg: corDaEmpresa(vaga.empresa),
    logoTexto: iniciais(vaga.empresa),
    pontoCor: vaga.seen ? 'transparent' : '#3B82F6',
  }
}

function ordenar(lista, chave, direcao) {
  const dir = direcao === 'asc' ? 1 : -1
  return lista.slice().sort((a, b) => {
    if (chave === 'rank') return (a.rank - b.rank) * dir
    if (chave === 'salario') return (a.max - b.max) * dir
    return (b.days - a.days) * dir
  })
}

function unicos(lista, campo) {
  return Array.from(new Set(lista.map((j) => j[campo]))).sort((a, b) =>
    a.localeCompare(b, 'pt-BR'),
  )
}

/* -------------------------- componentes -------------------------- */

function Rosca({ tamanho, rank, cor, dash, fontSize }) {
  return (
    <div style={{ position: 'relative', width: tamanho, height: tamanho }}>
      <svg
        width={tamanho}
        height={tamanho}
        viewBox="0 0 42 42"
        style={{ transform: 'rotate(-90deg)' }}
      >
        <circle
          cx="21"
          cy="21"
          r="17"
          fill="none"
          stroke="rgba(255,255,255,0.07)"
          strokeWidth="3"
        />
        <circle
          cx="21"
          cy="21"
          r="17"
          fill="none"
          stroke={cor}
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={dash}
        />
      </svg>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize,
          fontWeight: 600,
          color: '#E8ECF4',
        }}
      >
        {rank}
      </div>
    </div>
  )
}

function ItemNav({ ativo, onClick, icone, children }) {
  return (
    <button
      onClick={onClick}
      className={
        ativo
          ? 'hover:brightness-[1.12]'
          : 'bg-transparent text-[#8A94A6] hover:bg-white/[0.04] hover:text-[#E8ECF4]'
      }
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 11,
        width: '100%',
        textAlign: 'left',
        padding: '11px 13px',
        borderRadius: 10,
        fontSize: 14,
        fontWeight: ativo ? 600 : 400,
        cursor: 'pointer',
        transition: 'background .12s',
        border: `1px solid ${ativo ? 'rgba(59,130,246,0.35)' : 'transparent'}`,
        ...(ativo
          ? {
              background:
                'linear-gradient(100deg, rgba(37,99,235,0.28), rgba(37,99,235,0.10))',
              color: '#DCE7FF',
            }
          : null),
      }}
    >
      {icone}
      <span>{children}</span>
    </button>
  )
}

function Lateral({ aba, onAba }) {
  return (
    <aside
      style={{
        width: 260,
        flex: '0 0 260px',
        borderRight: '1px solid rgba(255,255,255,0.06)',
        background: '#080C15',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 16px',
        position: 'sticky',
        top: 0,
        alignSelf: 'flex-start',
        height: '100vh',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '0 6px 22px',
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 9,
            background: 'linear-gradient(150deg,#3B82F6,#1D4ED8)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            fontWeight: 700,
            color: '#fff',
            boxShadow: '0 0 0 1px rgba(59,130,246,0.35)',
          }}
        >
          V
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '0.06em' }}>
            VAGAS
          </div>
          <div
            style={{ fontSize: 10.5, color: '#8A94A6', letterSpacing: '0.01em' }}
          >
            Atalho Inteligente para TI
          </div>
        </div>
      </div>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <ItemNav
          ativo={aba === 'vagas'}
          onClick={() => onAba('vagas')}
          icone={
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <rect x="3" y="7" width="18" height="13" rx="2" />
              <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
              <path d="M3 12h18" />
            </svg>
          }
        >
          Vagas
        </ItemNav>

        <ItemNav
          ativo={aba === 'banco'}
          onClick={() => onAba('banco')}
          icone={
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <ellipse cx="12" cy="6" rx="8" ry="3" />
              <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
              <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
            </svg>
          }
        >
          Banco de Dados
        </ItemNav>

        <ItemNav
          ativo={aba === 'ia'}
          onClick={() => onAba('ia')}
          icone={
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="12" cy="12" r="3.2" />
              <path d="M12 3.5v2.2M12 18.3v2.2M4.6 7.8l1.9 1.1M17.5 15.1l1.9 1.1M4.6 16.2l1.9-1.1M17.5 8.9l1.9-1.1" />
            </svg>
          }
        >
          Avaliação IA
        </ItemNav>
      </nav>

      <div style={{ flex: 1 }} />

      <div
        style={{
          border: '1px solid rgba(255,255,255,0.07)',
          background: '#0B1220',
          borderRadius: 12,
          padding: 14,
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 9,
            marginBottom: 12,
          }}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#60A5FA"
            strokeWidth="1.7"
            style={{ marginTop: 2 }}
          >
            <path d="M12 3c3 2 4.5 5 4.5 8.2L12 16l-4.5-4.8C7.5 8 9 5 12 3Z" />
            <circle cx="12" cy="10" r="1.6" />
            <path d="M9 17l-1.5 4 4-1.8 4 1.8L14 17" />
          </svg>
          <div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>
              Plano Profissional
            </div>
            <div style={{ fontSize: 11.5, color: '#8A94A6', marginTop: 2 }}>
              Mais recursos e insights
            </div>
          </div>
        </div>
        <button
          className="hover:brightness-110"
          style={{
            width: '100%',
            padding: '9px 12px',
            borderRadius: 9,
            border: 'none',
            background: 'linear-gradient(180deg,#3B82F6,#2563EB)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Fazer upgrade
        </button>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: 10,
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12,
          background: '#0A0F1A',
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: '50%',
            background: '#1E293B',
            color: '#B9C4D6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          AM
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>Admin</div>
          <div style={{ fontSize: 11, color: '#8A94A6' }}>Administrador</div>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#8A94A6"
          strokeWidth="2"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </div>
    </aside>
  )
}

function Cabecalho({ aba, busca, onBusca }) {
  const [titulo, subtitulo] = TITULOS[aba]
  const botaoIcone = {
    width: 38,
    height: 38,
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.07)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  }
  const classeBotaoIcone =
    'bg-[#0B1220] text-[#9AA5B8] hover:bg-[#111A2B] hover:text-[#E8ECF4]'

  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 20,
        marginBottom: 22,
        flexWrap: 'wrap',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 12,
          flex: '1 1 320px',
          minWidth: 0,
        }}
      >
        <div
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            background: 'rgba(37,99,235,0.14)',
            border: '1px solid rgba(59,130,246,0.28)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginTop: 3,
          }}
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#60A5FA"
            strokeWidth="1.8"
          >
            <path d={ICONE_TITULO[aba]} />
          </svg>
        </div>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 27,
              fontWeight: 600,
              letterSpacing: '-0.01em',
            }}
          >
            {titulo}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#8A94A6' }}>
            {subtitulo}
          </p>
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          paddingTop: 2,
          flex: '0 1 auto',
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            flex: '1 1 240px',
            minWidth: 0,
            maxWidth: 390,
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.07)',
            background: '#0B1220',
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#8A94A6"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M16.5 16.5 21 21" />
          </svg>
          <input
            value={busca}
            onChange={onBusca}
            placeholder="Buscar vaga, tecnologia ou empresa..."
            style={{
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: '#E8ECF4',
              fontSize: 13.5,
            }}
          />
          <span
            style={{ display: 'flex', gap: 4, color: '#6E7789', fontSize: 11 }}
          >
            <kbd
              style={{
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 5,
                padding: '2px 5px',
                fontFamily: 'inherit',
              }}
            >
              ⌘
            </kbd>
            <kbd
              style={{
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 5,
                padding: '2px 5px',
                fontFamily: 'inherit',
              }}
            >
              K
            </kbd>
          </span>
        </div>

        <button
          className={classeBotaoIcone}
          style={{ ...botaoIcone, position: 'relative' }}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z" />
            <path d="M10.5 19a1.8 1.8 0 0 0 3 0" />
          </svg>
          <span
            style={{
              position: 'absolute',
              top: -5,
              right: -5,
              minWidth: 17,
              height: 17,
              borderRadius: 9,
              background: '#2563EB',
              color: '#fff',
              fontSize: 10.5,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              border: '2px solid #060910',
            }}
          >
            3
          </span>
        </button>

        <button className={classeBotaoIcone} style={botaoIcone}>
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2.5v2.3M12 19.2v2.3M2.5 12h2.3M19.2 12h2.3M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M5.2 18.8l1.6-1.6M17.2 6.8l1.6-1.6" />
          </svg>
        </button>

        <button className={classeBotaoIcone} style={botaoIcone}>
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" />
            <path d="M10 8l-4 4 4 4M6 12h9" />
          </svg>
        </button>
      </div>
    </header>
  )
}

function Filtros({
  cargo,
  empresa,
  cidade,
  modalidade,
  status,
  empresas,
  cidades,
  onCargo,
  onEmpresa,
  onCidade,
  onModalidade,
  onStatus,
  onLimpar,
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexWrap: 'wrap',
        marginBottom: 16,
      }}
    >
      <select value={cargo} onChange={onCargo} style={{ ...SELETOR, width: 250 }}>
        <option value="">Todos os cargos</option>
        {CARGOS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        value={empresa}
        onChange={onEmpresa}
        style={{ ...SELETOR, width: 215 }}
      >
        <option value="">Todas as empresas</option>
        {empresas.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </select>

      <select
        value={cidade}
        onChange={onCidade}
        style={{ ...SELETOR, width: 195 }}
      >
        <option value="">Todas as cidades</option>
        {cidades.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <select
        value={modalidade}
        onChange={onModalidade}
        style={{ ...SELETOR, width: 195 }}
      >
        <option value="">Todas as modalidades</option>
        {MODALIDADES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>

      <select
        value={status}
        onChange={onStatus}
        style={{ ...SELETOR, width: 200 }}
      >
        <option value="">Todos os status</option>
        {STATUS.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>

      <button
        onClick={onLimpar}
        className="bg-[#0B1220] text-[#C8D1E0] hover:bg-[#111A2B]"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderRadius: 10,
          border: '1px solid rgba(255,255,255,0.09)',
          fontSize: 13.5,
          cursor: 'pointer',
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
          <path d="M4 7h16M7 12h10M10 17h4" />
        </svg>
        Filtros
      </button>
    </div>
  )
}

function CabecalhoTabela({
  ordem,
  direcao,
  onOrdenar,
  dicaAberta,
  onDica,
}) {
  const seta = (chave) =>
    ordem !== chave ? '' : direcao === 'asc' ? '↑' : '↓'
  const clicavel = {
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: COLUNAS,
        alignItems: 'center',
        gap: 10,
        padding: '16px 16px 16px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: '#0C1424',
        fontSize: 12.5,
        color: '#8A94A6',
        fontWeight: 500,
      }}
    >
      <div>Cargo</div>
      <div>Empresa</div>
      <div>Localização</div>
      <div>Modalidade</div>
      <div
        onClick={() => onOrdenar('salario')}
        className="hover:text-[#E8ECF4]"
        style={clicavel}
      >
        Salário <span style={{ color: '#3B82F6' }}>{seta('salario')}</span>
      </div>
      <div
        onClick={() => onOrdenar('data')}
        className="hover:text-[#E8ECF4]"
        style={clicavel}
      >
        Data de publicação{' '}
        <span style={{ color: '#3B82F6' }}>{seta('data')}</span>
      </div>
      <div
        onClick={() => onOrdenar('rank')}
        onMouseEnter={() => onDica(true)}
        onMouseLeave={() => onDica(false)}
        className="hover:text-[#E8ECF4]"
        style={{ ...clicavel, position: 'relative' }}
      >
        Rank IA <span style={{ color: '#3B82F6' }}>{seta('rank')}</span>
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5.5M12 7.6v0.1" />
        </svg>
        {dicaAberta && (
          <div
            style={{
              position: 'absolute',
              top: 26,
              left: 0,
              width: 250,
              padding: '10px 12px',
              borderRadius: 9,
              border: '1px solid rgba(255,255,255,0.1)',
              background: '#111A2B',
              color: '#C8D1E0',
              fontSize: 11.5,
              lineHeight: 1.5,
              zIndex: 20,
              boxShadow: '0 12px 30px rgba(0,0,0,0.5)',
            }}
          >
            Compatibilidade estimada entre a vaga e o seu perfil, de 0 a 100.
          </div>
        )}
      </div>
      <div>Status</div>
      <div />
    </div>
  )
}

function Linha({ vaga, menuAberto, onMenu, onDetalhes, onFavorito, onArquivar }) {
  const d = derivar(vaga)
  const itemMenu = {
    width: '100%',
    textAlign: 'left',
    padding: '8px 10px',
    borderRadius: 7,
    border: 'none',
    fontSize: 13,
    cursor: 'pointer',
  }
  const classeItemMenu =
    'bg-transparent text-[#D3DAE6] hover:bg-white/[0.06]'

  return (
    <div
      className="hover:bg-[#0E1729]"
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: COLUNAS,
        alignItems: 'center',
        gap: 10,
        padding: '15px 16px 15px 24px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        transition: 'background .12s',
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 12,
          top: '50%',
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: d.pontoCor,
          transform: 'translateY(-50%)',
        }}
      />

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: '#E8ECF4',
            lineHeight: 1.3,
          }}
        >
          {vaga.cargo}
        </div>
        <div
          style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 5 }}
        >
          {vaga.techs.map((t) => (
            <span key={t} style={{ fontSize: 11.5, color: '#7C8699' }}>
              {t}
            </span>
          ))}
        </div>
      </div>

      <div
        style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}
      >
        <div
          style={{
            width: 30,
            height: 30,
            flex: '0 0 30px',
            borderRadius: 7,
            background: d.logoBg,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11.5,
            fontWeight: 700,
          }}
        >
          {d.logoTexto}
        </div>
        <span style={{ fontSize: 13.5, color: '#D3DAE6' }}>{vaga.empresa}</span>
      </div>

      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: '#D3DAE6',
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#8A94A6"
            strokeWidth="1.9"
          >
            <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
            <circle cx="12" cy="10" r="2.4" />
          </svg>
          {vaga.cidade}
        </div>
        <div
          style={{
            fontSize: 11.5,
            color: '#7C8699',
            marginTop: 3,
            paddingLeft: 19,
          }}
        >
          Brasil
        </div>
      </div>

      <div>
        <span style={ESTILO_MODALIDADE[vaga.modalidade]}>{vaga.modalidade}</span>
      </div>

      <div>
        <div style={{ fontSize: 13, color: '#D3DAE6' }}>{d.salario}</div>
        <div style={{ fontSize: 11.5, color: '#7C8699', marginTop: 3 }}>CLT</div>
      </div>

      <div>
        <div style={{ fontSize: 13, color: '#D3DAE6' }}>{d.data}</div>
        <div style={{ fontSize: 11.5, color: '#7C8699', marginTop: 3 }}>
          {d.desde}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 3,
        }}
      >
        <Rosca
          tamanho={42}
          rank={vaga.rank}
          cor={d.rankCor}
          dash={d.dash}
          fontSize={13}
        />
        <div style={{ fontSize: 10.5, color: d.rankCor }}>{d.rankLabel}</div>
      </div>

      <div>
        <span style={ESTILO_STATUS[vaga.status]}>{vaga.status}</span>
      </div>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        <button
          onClick={onMenu}
          className="bg-transparent text-[#7C8699] hover:bg-white/[0.06] hover:text-[#E8ECF4]"
          style={{
            width: 28,
            height: 28,
            borderRadius: 7,
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="12" cy="6" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="12" cy="18" r="1.6" />
          </svg>
        </button>

        {menuAberto && (
          <div
            style={{
              position: 'absolute',
              top: 30,
              right: 0,
              width: 158,
              padding: 5,
              borderRadius: 10,
              border: '1px solid rgba(255,255,255,0.1)',
              background: '#111A2B',
              zIndex: 30,
              boxShadow: '0 16px 36px rgba(0,0,0,0.55)',
            }}
          >
            <button
              onClick={onDetalhes}
              className={classeItemMenu}
              style={itemMenu}
            >
              Ver detalhes
            </button>
            <button
              onClick={onFavorito}
              className={classeItemMenu}
              style={itemMenu}
            >
              {vaga.fav ? 'Remover favorito' : 'Favoritar'}
            </button>
            <button
              onClick={onArquivar}
              className={classeItemMenu}
              style={itemMenu}
            >
              Arquivar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function Card({ vaga }) {
  const d = derivar(vaga)
  return (
    <div
      style={{
        padding: 16,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: d.pontoCor,
            }}
          />
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{vaga.cargo}</div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 6,
              background: d.logoBg,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              fontWeight: 700,
            }}
          >
            {d.logoTexto}
          </div>
          <span style={{ fontSize: 13, color: '#D3DAE6' }}>{vaga.empresa}</span>
          <span style={{ fontSize: 12.5, color: '#7C8699' }}>
            · {vaga.cidade}
          </span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 10,
            flexWrap: 'wrap',
          }}
        >
          <span style={ESTILO_MODALIDADE[vaga.modalidade]}>
            {vaga.modalidade}
          </span>
          <span style={ESTILO_STATUS[vaga.status]}>{vaga.status}</span>
          <span style={{ fontSize: 12.5, color: '#D3DAE6' }}>{d.salario}</span>
          <span style={{ fontSize: 12, color: '#7C8699' }}>{d.desde}</span>
        </div>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
        }}
      >
        <Rosca
          tamanho={40}
          rank={vaga.rank}
          cor={d.rankCor}
          dash={d.dash}
          fontSize={12.5}
        />
        <div style={{ fontSize: 10, color: d.rankCor }}>{d.rankLabel}</div>
      </div>
    </div>
  )
}

function SemResultados({ onLimpar }) {
  return (
    <div
      style={{
        padding: '64px 20px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
      }}
    >
      <div
        style={{
          width: 50,
          height: 50,
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.08)',
          background: '#0E1729',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#8A94A6"
          strokeWidth="1.7"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M16.5 16.5 21 21" />
        </svg>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600 }}>Nenhuma vaga encontrada</div>
      <div
        style={{
          fontSize: 13,
          color: '#8A94A6',
          textAlign: 'center',
          maxWidth: 320,
        }}
      >
        Tente outros termos ou remova alguns filtros para ver mais resultados.
      </div>
      <button
        onClick={onLimpar}
        className="bg-[rgba(37,99,235,0.12)] hover:bg-[rgba(37,99,235,0.2)]"
        style={{
          marginTop: 4,
          padding: '9px 16px',
          borderRadius: 9,
          border: '1px solid rgba(59,130,246,0.4)',
          color: '#93B4FD',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Limpar filtros
      </button>
    </div>
  )
}

function Paginacao({
  total,
  inicio,
  porPagina,
  pagina,
  maxPagina,
  onPagina,
  onPorPagina,
}) {
  const numeros = []
  if (maxPagina <= 6) {
    for (let i = 1; i <= maxPagina; i++) numeros.push({ n: i })
  } else {
    numeros.push({ n: 1 })
    if (pagina > 3) numeros.push({ reticencias: 'inicio' })
    for (
      let i = Math.max(2, pagina - 1);
      i <= Math.min(maxPagina - 1, pagina + 1);
      i++
    ) {
      numeros.push({ n: i })
    }
    if (pagina < maxPagina - 2) numeros.push({ reticencias: 'fim' })
    numeros.push({ n: maxPagina })
  }

  const seta = {
    width: 32,
    height: 32,
    borderRadius: 8,
    border: '1px solid rgba(255,255,255,0.08)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }
  const classeSeta =
    'bg-[#0B1220] text-[#9AA5B8] hover:bg-[#131E33] hover:text-[#E8ECF4]'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
        padding: '14px 18px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        background: '#0A111E',
      }}
    >
      <div style={{ fontSize: 12.5, color: '#8A94A6' }}>
        {total === 0
          ? 'Nenhuma vaga para exibir'
          : `Mostrando ${inicio + 1} a ${Math.min(inicio + porPagina, total)} de ${total} vagas`}
      </div>
      <div style={{ flex: 1 }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button
          onClick={() => onPagina(Math.max(1, pagina - 1))}
          className={classeSeta}
          style={seta}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M14 6l-6 6 6 6" />
          </svg>
        </button>

        {numeros.map((item) =>
          item.reticencias ? (
            <span
              key={item.reticencias}
              style={{
                width: 26,
                height: 32,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6E7789',
                fontSize: 13,
              }}
            >
              …
            </span>
          ) : (
            <button
              key={item.n}
              onClick={() => onPagina(item.n)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                fontSize: 12.5,
                cursor: 'pointer',
                border: `1px solid ${item.n === pagina ? 'transparent' : 'rgba(255,255,255,0.08)'}`,
                background: item.n === pagina ? '#2563EB' : '#0B1220',
                color: item.n === pagina ? '#fff' : '#9AA5B8',
                fontWeight: item.n === pagina ? 600 : 400,
              }}
            >
              {item.n}
            </button>
          ),
        )}

        <button
          onClick={() => onPagina(Math.min(maxPagina, pagina + 1))}
          className={classeSeta}
          style={seta}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M10 6l6 6-6 6" />
          </svg>
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span style={{ fontSize: 12.5, color: '#8A94A6' }}>Itens por página</span>
        <select
          value={String(porPagina)}
          onChange={onPorPagina}
          style={{
            padding: '7px 10px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.08)',
            background: '#0B1220',
            color: '#C8D1E0',
            fontSize: 12.5,
            cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="10">10</option>
          <option value="25">25</option>
          <option value="50">50</option>
        </select>
      </div>
    </div>
  )
}

function PainelIA({
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

/**
 * Modal de nova vaga. Como no protótipo original do Claude Design, ele existe
 * pronto mas nenhum botão da tela o abre — está aqui para quando a ação for
 * definida. Para ligar: chamar `setModalAberto(true)` de algum gatilho.
 */
function ModalNovaVaga({ form, onCampo, onFechar, onSalvar }) {
  const rotulo = {
    display: 'flex',
    flexDirection: 'column',
    gap: 6,
  }
  const legenda = { fontSize: 12, color: '#8A94A6' }

  return (
    <div
      onClick={onFechar}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(3,6,12,0.72)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 60,
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 520,
          maxWidth: '100%',
          borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.09)',
          background: '#0B1220',
          padding: 22,
          boxShadow: '0 30px 70px rgba(0,0,0,0.6)',
          animation: 'vagasFade .18s ease-out',
        }}
      >
        <div style={{ fontSize: 17, fontWeight: 600 }}>Nova vaga</div>
        <div
          style={{
            fontSize: 12.5,
            color: '#8A94A6',
            marginTop: 4,
            marginBottom: 18,
          }}
        >
          Protótipo — a vaga é adicionada apenas nesta sessão.
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
          }}
        >
          <label style={{ ...rotulo, gridColumn: 'span 2' }}>
            <span style={legenda}>Cargo</span>
            <input
              value={form.cargo}
              onChange={(e) => onCampo('cargo', e.target.value)}
              placeholder="Desenvolvedor Full Stack"
              style={CAMPO_MODAL}
            />
          </label>

          <label style={rotulo}>
            <span style={legenda}>Empresa</span>
            <input
              value={form.empresa}
              onChange={(e) => onCampo('empresa', e.target.value)}
              placeholder="ACME Solutions"
              style={CAMPO_MODAL}
            />
          </label>

          <label style={rotulo}>
            <span style={legenda}>Localização</span>
            <input
              value={form.cidade}
              onChange={(e) => onCampo('cidade', e.target.value)}
              placeholder="São Paulo, SP"
              style={CAMPO_MODAL}
            />
          </label>

          <label style={rotulo}>
            <span style={legenda}>Modalidade</span>
            <select
              value={form.modalidade}
              onChange={(e) => onCampo('modalidade', e.target.value)}
              style={{ ...CAMPO_MODAL, cursor: 'pointer' }}
            >
              {MODALIDADES.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </label>

          <label style={rotulo}>
            <span style={legenda}>Tecnologias</span>
            <input
              value={form.techs}
              onChange={(e) => onCampo('techs', e.target.value)}
              placeholder="React, Node.js, AWS"
              style={CAMPO_MODAL}
            />
          </label>

          <label style={rotulo}>
            <span style={legenda}>Salário mínimo (R$ mil)</span>
            <input
              value={form.min}
              onChange={(e) => onCampo('min', e.target.value)}
              placeholder="8"
              style={CAMPO_MODAL}
            />
          </label>

          <label style={rotulo}>
            <span style={legenda}>Salário máximo (R$ mil)</span>
            <input
              value={form.max}
              onChange={(e) => onCampo('max', e.target.value)}
              placeholder="12"
              style={CAMPO_MODAL}
            />
          </label>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            marginTop: 20,
          }}
        >
          <button
            onClick={onFechar}
            className="bg-transparent hover:bg-white/[0.05]"
            style={{
              padding: '9px 16px',
              borderRadius: 9,
              border: '1px solid rgba(255,255,255,0.1)',
              color: '#C8D1E0',
              fontSize: 13.5,
              cursor: 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={onSalvar}
            className="hover:brightness-110"
            style={{
              padding: '9px 18px',
              borderRadius: 9,
              border: 'none',
              background: 'linear-gradient(180deg,#3B82F6,#2563EB)',
              color: '#fff',
              fontSize: 13.5,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Salvar vaga
          </button>
        </div>
      </div>
    </div>
  )
}

/* ------------------------------ app ------------------------------ */

export default function App() {
  const [vagas, setVagas] = useState(VAGAS)
  const [vagasBanco, setVagasBanco] = useState(VAGAS_BANCO)

  const [aba, setAba] = useState('vagas')
  const [cargo, setCargo] = useState('')
  const [busca, setBusca] = useState('')
  const [empresa, setEmpresa] = useState('')
  const [cidade, setCidade] = useState('')
  const [modalidade, setModalidade] = useState('')
  const [status, setStatus] = useState('')

  const [ordem, setOrdem] = useState('rank')
  const [direcao, setDirecao] = useState('desc')
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(10)

  const [menu, setMenu] = useState(null)
  const [dicaAberta, setDicaAberta] = useState(false)
  const [modalAberto, setModalAberto] = useState(false)
  const [estreito, setEstreito] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1024,
  )

  const [instrucao, setInstrucao] = useState(INSTRUCAO_PADRAO)
  const [cv, setCv] = useState(null)
  const [arrastando, setArrastando] = useState(false)
  const [form, setForm] = useState(FORM_VAZIO)

  // Tabela vira lista de cards abaixo de 1024px.
  useEffect(() => {
    const aoRedimensionar = () => setEstreito(window.innerWidth < 1024)
    aoRedimensionar()
    window.addEventListener('resize', aoRedimensionar)
    return () => window.removeEventListener('resize', aoRedimensionar)
  }, [])

  // Clique fora fecha o menu de contexto da linha.
  useEffect(() => {
    const aoClicar = () => setMenu(null)
    window.addEventListener('click', aoClicar)
    return () => window.removeEventListener('click', aoClicar)
  }, [])

  const fonte = aba === 'banco' ? vagasBanco : vagas
  const atualizarFonte = aba === 'banco' ? setVagasBanco : setVagas

  const filtradas = useMemo(() => {
    const termos = busca.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const lista = fonte.filter((j) => {
      if (cargo && j.cargo !== cargo) return false
      if (empresa && j.empresa !== empresa) return false
      if (cidade && j.cidade !== cidade) return false
      if (modalidade && j.modalidade !== modalidade) return false
      if (status && j.status !== status) return false
      if (!termos.length) return true
      const alvo =
        `${j.cargo} ${j.empresa} ${j.techs.join(' ')} ${j.cidade}`.toLowerCase()
      return termos.every((t) => alvo.includes(t))
    })
    return ordenar(lista, ordem, direcao)
  }, [fonte, cargo, busca, empresa, cidade, modalidade, status, ordem, direcao])

  const empresas = useMemo(() => unicos(fonte, 'empresa'), [fonte])
  const cidades = useMemo(() => unicos(fonte, 'cidade'), [fonte])

  const total = filtradas.length
  const maxPagina = Math.max(1, Math.ceil(total / porPagina))
  const paginaAtual = Math.min(pagina, maxPagina)
  const inicio = (paginaAtual - 1) * porPagina
  const visiveis = filtradas.slice(inicio, inicio + porPagina)

  const ehTabela = aba === 'vagas' || aba === 'banco'

  function irParaAba(nova) {
    setAba(nova)
    setPagina(1)
    setCargo('')
    setBusca('')
    setEmpresa('')
    setCidade('')
    setModalidade('')
    setStatus('')
    setMenu(null)
  }

  function limparFiltros() {
    setCargo('')
    setBusca('')
    setEmpresa('')
    setCidade('')
    setModalidade('')
    setStatus('')
    setPagina(1)
  }

  function ordenarPor(chave) {
    setDirecao((d) => (ordem === chave ? (d === 'asc' ? 'desc' : 'asc') : 'desc'))
    setOrdem(chave)
    setPagina(1)
  }

  function alterarVaga(id, fn) {
    setMenu(null)
    atualizarFonte((lista) => lista.map((x) => (x.id === id ? fn(x) : x)))
  }

  function arquivarVaga(id) {
    setMenu(null)
    atualizarFonte((lista) => lista.filter((x) => x.id !== id))
  }

  function registrarCv(arquivo) {
    const kb = arquivo.size / 1024
    setCv({
      nome: arquivo.name,
      tamanho:
        kb > 1024
          ? `${(kb / 1024).toFixed(1)} MB`
          : `${Math.max(1, Math.round(kb))} KB`,
    })
  }

  function salvarVaga() {
    if (!form.cargo.trim()) {
      setModalAberto(false)
      return
    }
    const min = parseFloat(form.min) || 6
    const max = parseFloat(form.max) || min + 4
    const nova = {
      id: `n${Date.now()}`,
      cargo: form.cargo.trim(),
      techs: form.techs
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .slice(0, 3),
      empresa: form.empresa.trim() || 'Nova Empresa',
      cidade: form.cidade.trim() || 'São Paulo, SP',
      modalidade: form.modalidade,
      min,
      max,
      days: 0,
      rank: 70 + Math.floor(Math.random() * 26),
      status: 'Em análise',
      seen: false,
      fav: false,
    }
    setVagas((lista) => [nova, ...lista])
    setModalAberto(false)
    setPagina(1)
    setForm(FORM_VAZIO)
  }

  return (
    <div
      style={{
        display: 'flex',
        minHeight: '100vh',
        background: '#060910',
        color: '#E8ECF4',
        fontSize: 14,
      }}
    >
      <Lateral aba={aba} onAba={irParaAba} />

      <main
        style={{
          flex: 1,
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          padding: '22px 26px 30px',
        }}
      >
        <Cabecalho
          aba={aba}
          busca={busca}
          onBusca={(e) => {
            setBusca(e.target.value)
            setPagina(1)
          }}
        />

        {ehTabela && (
          <div>
            <Filtros
              cargo={cargo}
              empresa={empresa}
              cidade={cidade}
              modalidade={modalidade}
              status={status}
              empresas={empresas}
              cidades={cidades}
              onCargo={(e) => {
                setCargo(e.target.value)
                setPagina(1)
              }}
              onEmpresa={(e) => {
                setEmpresa(e.target.value)
                setPagina(1)
              }}
              onCidade={(e) => {
                setCidade(e.target.value)
                setPagina(1)
              }}
              onModalidade={(e) => {
                setModalidade(e.target.value)
                setPagina(1)
              }}
              onStatus={(e) => {
                setStatus(e.target.value)
                setPagina(1)
              }}
              onLimpar={limparFiltros}
            />

            <div
              style={{
                border: '1px solid rgba(255,255,255,0.06)',
                background: '#0B1220',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              {!estreito && total > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <CabecalhoTabela
                    ordem={ordem}
                    direcao={direcao}
                    onOrdenar={ordenarPor}
                    dicaAberta={dicaAberta}
                    onDica={setDicaAberta}
                  />
                  {visiveis.map((vaga) => (
                    <Linha
                      key={vaga.id}
                      vaga={vaga}
                      menuAberto={menu === vaga.id}
                      onMenu={(e) => {
                        e.stopPropagation()
                        setMenu((atual) => (atual === vaga.id ? null : vaga.id))
                      }}
                      onDetalhes={(e) => {
                        e.stopPropagation()
                        alterarVaga(vaga.id, (x) => ({ ...x, seen: true }))
                      }}
                      onFavorito={(e) => {
                        e.stopPropagation()
                        alterarVaga(vaga.id, (x) => ({ ...x, fav: !x.fav }))
                      }}
                      onArquivar={(e) => {
                        e.stopPropagation()
                        arquivarVaga(vaga.id)
                      }}
                    />
                  ))}
                </div>
              )}

              {estreito && total > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {visiveis.map((vaga) => (
                    <Card key={vaga.id} vaga={vaga} />
                  ))}
                </div>
              )}

              {total === 0 && <SemResultados onLimpar={limparFiltros} />}

              <Paginacao
                total={total}
                inicio={inicio}
                porPagina={porPagina}
                pagina={paginaAtual}
                maxPagina={maxPagina}
                onPagina={setPagina}
                onPorPagina={(e) => {
                  setPorPagina(parseInt(e.target.value, 10))
                  setPagina(1)
                }}
              />
            </div>
          </div>
        )}

        {aba === 'ia' && (
          <PainelIA
            cv={cv}
            arrastando={arrastando}
            onArquivo={(e) => {
              const arquivo = e.target.files && e.target.files[0]
              if (arquivo) registrarCv(arquivo)
            }}
            onArrastarSobre={(e) => {
              e.preventDefault()
              if (!arrastando) setArrastando(true)
            }}
            onArrastarSair={() => setArrastando(false)}
            onSoltar={(e) => {
              e.preventDefault()
              const arquivo = e.dataTransfer.files && e.dataTransfer.files[0]
              setArrastando(false)
              if (arquivo) registrarCv(arquivo)
            }}
            onRemoverCv={() => setCv(null)}
            instrucao={instrucao}
            onInstrucao={(e) => setInstrucao(e.target.value)}
            onRestaurar={() => setInstrucao(INSTRUCAO_PADRAO)}
          />
        )}
      </main>

      {modalAberto && (
        <ModalNovaVaga
          form={form}
          onCampo={(campo, valor) =>
            setForm((atual) => ({ ...atual, [campo]: valor }))
          }
          onFechar={() => setModalAberto(false)}
          onSalvar={salvarVaga}
        />
      )}
    </div>
  )
}
