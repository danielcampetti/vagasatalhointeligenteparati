import { useEffect, useMemo, useRef, useState } from 'react'
import { BANCO_DE_VAGAS, INSTRUCAO_PADRAO, MODALIDADES } from './data/vagas'
import { CIDADES } from './data/cidades'
import {
  LIMITE_MENSAL,
  consultarCache,
  lerCota,
  limparCache,
  registrarUso,
  servidasDoCache,
  usadas,
  zerarContagem,
} from './cota'
import { ErroJSearch, buscarVagas, montarConsulta, vagasDaResposta } from './api/jsearch'
import { mapearVagas } from './api/mapear'

/* ------------------------------------------------------------------ *
 * Protótipo frio: todo o estado vive em memória, nesta página.
 * Nada aqui faz requisição de rede — recarregar volta ao estado inicial.
 * ------------------------------------------------------------------ */

const COLUNAS =
  'minmax(150px,1.45fr) minmax(108px,0.9fr) minmax(108px,0.9fr) 96px 112px 104px 76px 96px 34px'

const TITULOS = {
  vagas: ['Vagas', 'Encontre vagas de TI por cargo e cidade'],
  inteligente: [
    'Vaga Inteligente',
    'A IA lê seu currículo, escolhe o cargo e ranqueia as vagas',
  ],
  banco: ['Banco de Dados', 'Histórico completo de vagas coletadas'],
  ia: ['Avaliação IA', 'Compatibilidade entre vagas e seu perfil'],
  controle: ['Controle', 'Consumo da cota mensal da API de vagas'],
}

const ICONE_TITULO = {
  vagas: 'M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9Zm6-2V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 12h18',
  banco: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3v12c0 1.7-3.6 3-8 3s-8-1.3-8-3V6Zm0 6c0 1.7 3.6 3 8 3s8-1.3 8-3',
  ia: 'M15.2 12a3.2 3.2 0 1 1-6.4 0 3.2 3.2 0 0 1 6.4 0ZM12 3.5v2.2M12 18.3v2.2M4.6 7.8l1.9 1.1M17.5 15.1l1.9 1.1M4.6 16.2l1.9-1.1M17.5 8.9l1.9-1.1',
  controle: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  inteligente:
    'M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3M6.7 6.7l2.1 2.1M15.2 15.2l2.1 2.1M6.7 17.3l2.1-2.1M15.2 8.8l2.1-2.1',
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

/** "São Paulo, SP" -> "sao paulo, sp", para casar com o que se digita. */
function semAcento(texto) {
  return texto
    .normalize('NFD')
    // Faixa dos sinais diacríticos combinantes, escapada de propósito: os
    // caracteres em si são invisíveis num editor.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/** 4.5 -> "4.500" */
function fmtMil(v) {
  return (v * 1000).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })
}

/** ISO -> "25/08 14:02" ou "25/08/2026". Data inválida não quebra a tela. */
function fmtDataHora(iso, comHora) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const p = (n) => String(n).padStart(2, '0')
  const dia = `${p(d.getDate())}/${p(d.getMonth() + 1)}`
  return comHora
    ? `${dia} ${p(d.getHours())}:${p(d.getMinutes())}`
    : `${dia}/${d.getFullYear()}`
}

/** Data de publicação = hoje menos `days`, para a lista nunca envelhecer. */
function fmtData(dias) {
  const d = new Date()
  d.setDate(d.getDate() - dias)
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

/** Rank ausente não é rank baixo: a nota da IA ainda não existe. */
function faixaDoRank(n) {
  if (!Number.isFinite(n)) return { cor: '#4A5468', label: '—' }
  if (n >= 90) return { cor: '#22C55E', label: 'Excelente' }
  if (n >= 80) return { cor: '#22C55E', label: 'Muito bom' }
  if (n >= 70) return { cor: '#86EFAC', label: 'Bom' }
  if (n >= 60) return { cor: '#FACC15', label: 'Regular' }
  return { cor: '#FACC15', label: 'Baixo' }
}

/**
 * A faixa como a API a entrega: às vezes só o mínimo, às vezes nada. Um campo
 * vazio vira "—", nunca "R$ 0" — a vaga não paga zero, o anúncio é que não diz.
 */
function fmtSalario(min, max) {
  const temMin = Number.isFinite(min) && min > 0
  const temMax = Number.isFinite(max) && max > 0
  if (temMin && temMax) return `R$ ${fmtMil(min)} – ${fmtMil(max)}`
  if (temMin) return `A partir de R$ ${fmtMil(min)}`
  if (temMax) return `Até R$ ${fmtMil(max)}`
  return '—'
}

/**
 * O título da vaga, abrindo a página de detalhe *dentro* do app.
 *
 * Já foi link externo direto e estava errado: expulsava o usuário para outro
 * site na primeira interação com um resultado. O link para fora existe, mas na
 * página de detalhe, depois de ele ver o que temos sobre a vaga.
 *
 * É um `<button>`, não um `<a>`: não há URL para onde apontar — o app não tem
 * router. Fingir uma âncora daria menu de contexto e "abrir em nova aba" que
 * não levariam a lugar nenhum.
 */
function TituloDaVaga({ vaga, onAbrir }) {
  if (!vaga.cargo) return <span style={{ color: '#4A5468' }}>—</span>

  return (
    <button
      onClick={(e) => {
        // Sem isto o clique também alcança a linha e fecha/abre o menu.
        e.stopPropagation()
        onAbrir()
      }}
      title="Ver os detalhes desta vaga"
      className="bg-transparent hover:text-[#93B4FD]"
      style={{
        padding: 0,
        border: 'none',
        font: 'inherit',
        color: 'inherit',
        textAlign: 'left',
        cursor: 'pointer',
      }}
    >
      {vaga.cargo}
    </button>
  )
}

/** Campos derivados usados tanto na tabela quanto nos cards. */
function derivar(vaga) {
  const faixa = faixaDoRank(vaga.rank)
  const circunferencia = 2 * Math.PI * 17
  const temDias = Number.isFinite(vaga.days)
  const temRank = Number.isFinite(vaga.rank)
  return {
    salario: fmtSalario(vaga.min, vaga.max),
    data: temDias ? fmtData(vaga.days) : '—',
    desde: !temDias
      ? ''
      : vaga.days === 0
        ? 'Hoje'
        : vaga.days === 1
          ? 'Há 1 dia'
          : `Há ${vaga.days} dias`,
    temRank,
    rankCor: faixa.cor,
    rankLabel: faixa.label,
    dash: `${((circunferencia * (temRank ? vaga.rank : 0)) / 100).toFixed(1)} ${circunferencia.toFixed(1)}`,
    pontoCor: vaga.seen ? 'transparent' : '#3B82F6',
  }
}

/**
 * Ordena tratando campo ausente como "vai para o fim", em qualquer direção.
 * Sem isso, `null - 5` vira NaN e o sort embaralha a lista inteira.
 */
function ordenar(lista, chave, direcao) {
  const dir = direcao === 'asc' ? 1 : -1
  const valor = (v) => {
    if (chave === 'rank') return v.rank
    if (chave === 'salario') return v.max
    return -v.days // mais recente primeiro quando desc
  }
  return lista.slice().sort((a, b) => {
    const x = valor(a)
    const y = valor(b)
    const temX = Number.isFinite(x)
    const temY = Number.isFinite(y)
    if (!temX && !temY) return 0
    if (!temX) return 1
    if (!temY) return -1
    return (x - y) * dir
  })
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
          ativo={aba === 'inteligente'}
          onClick={() => onAba('inteligente')}
          icone={
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3M6.7 6.7l2.1 2.1M15.2 15.2l2.1 2.1M6.7 17.3l2.1-2.1M15.2 8.8l2.1-2.1" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          }
        >
          Vaga Inteligente
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

        <ItemNav
          ativo={aba === 'controle'}
          onClick={() => onAba('controle')}
          icone={
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
            </svg>
          }
        >
          Controle
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

function Cabecalho({ aba }) {
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

/**
 * Índice de busca das cidades, montado uma vez no carregamento do módulo.
 *
 * `sem` é o rótulo sem acento e em minúsculas. Sem isso, digitar "sao paulo"
 * não acharia "São Paulo" — e como quase ninguém digita acento, o campo
 * pareceria quebrado logo no caso mais óbvio.
 */
const CIDADES_INDEXADAS = CIDADES.map((rotulo) => ({
  rotulo,
  sem: semAcento(rotulo),
  // O nome sem a UF, para reconhecer quem digitou a cidade inteira.
  nomeSem: semAcento(rotulo.slice(0, rotulo.lastIndexOf(', '))),
}))

/** Quantas linhas o dropdown mostra por vez. "santa" casa com 199 cidades. */
const TETO_SUGESTOES = 40

/**
 * Campo de cidade com filtro por digitação. Você digita, a lista se estreita,
 * e escolher só é possível dentro dela — o texto digitado nunca vira valor.
 *
 * Substituiu um par de seletores em cascata (estado, depois cidade). Com 5.571
 * municípios, rolar era inviável, e o `<select>` nativo só salta pela primeira
 * letra: "cax" não levava a Caxias.
 *
 * Casa por trecho, não só por prefixo — "sul" encontra "Caxias do Sul" —, mas
 * quem começa com o termo vem primeiro, senão "cax" enterraria Caxias sob
 * qualquer município que só a contenha no meio do nome.
 */
function CampoCidade({ valor, onEscolher }) {
  const [texto, setTexto] = useState('')
  const [aberto, setAberto] = useState(false)
  const [destaque, setDestaque] = useState(0)
  const listaRef = useRef(null)

  const termo = semAcento(texto.trim())

  /*
   * Três níveis de relevância, nesta ordem:
   *
   *   1. o nome inteiro é o que se digitou — "sao paulo" tem de pôr a capital
   *      no topo, não "São Paulo das Missões", que vem antes no alfabeto;
   *   2. começa com o termo — "cax" antes de quem só contém "cax" no meio;
   *   3. contém o termo em qualquer posição — é o que faz "sul" achar
   *      "Caxias do Sul".
   *
   * Varre as 5.571 a cada tecla, sem parar na metade: é uma comparação de
   * string por item, abaixo de um milissegundo, e parar cedo faria a lista
   * perder o casamento exato quando ele cai depois do teto.
   */
  const { lista: sugestoes, total } = useMemo(() => {
    if (!termo) {
      return {
        lista: CIDADES_INDEXADAS.slice(0, TETO_SUGESTOES),
        total: CIDADES_INDEXADAS.length,
      }
    }
    const exatas = []
    const comeca = []
    const contem = []
    for (const c of CIDADES_INDEXADAS) {
      if (c.nomeSem === termo) exatas.push(c)
      else if (c.sem.startsWith(termo)) comeca.push(c)
      else if (c.sem.includes(termo)) contem.push(c)
    }
    const todas = [...exatas, ...comeca, ...contem]
    return { lista: todas.slice(0, TETO_SUGESTOES), total: todas.length }
  }, [termo])

  // Mantém a linha destacada visível ao navegar pelo teclado.
  useEffect(() => {
    listaRef.current
      ?.querySelector('[data-destacado="sim"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [destaque, aberto])

  function escolher(rotulo) {
    onEscolher(rotulo)
    setTexto('')
    setAberto(false)
    setDestaque(0)
  }

  function aoTeclar(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (!aberto) return setAberto(true)
      const passo = e.key === 'ArrowDown' ? 1 : -1
      setDestaque((i) => {
        const n = sugestoes.length
        return n ? (i + passo + n) % n : 0
      })
    } else if (e.key === 'Enter') {
      if (aberto && sugestoes[destaque]) {
        e.preventDefault()
        escolher(sugestoes[destaque].rotulo)
      }
    } else if (e.key === 'Escape') {
      setAberto(false)
      setTexto('')
    }
  }

  return (
    <div
      style={{ position: 'relative', flex: '1 1 230px', minWidth: 0 }}
      // Fecha ao clicar fora ou sair com Tab. O texto digitado é descartado:
      // vale o que foi escolhido da lista, nunca o que ficou no campo.
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) {
          setAberto(false)
          setTexto('')
        }
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          value={aberto ? texto : valor}
          onChange={(e) => {
            setTexto(e.target.value)
            setAberto(true)
            setDestaque(0)
          }}
          onFocus={() => setAberto(true)}
          onKeyDown={aoTeclar}
          placeholder="Digite a cidade..."
          role="combobox"
          aria-expanded={aberto}
          aria-controls="lista-cidades"
          aria-autocomplete="list"
          aria-label="Cidade"
          spellCheck={false}
          autoComplete="off"
          style={{
            flex: 1,
            minWidth: 0,
            background: '#0B1220',
            border: 'none',
            outline: 'none',
            color: valor || texto ? '#E8ECF4' : '#8A94A6',
            fontSize: 15,
          }}
        />
        {valor && !aberto && (
          <button
            onClick={() => onEscolher('')}
            aria-label="Limpar cidade"
            className="bg-transparent text-[#7C8699] hover:bg-white/[0.06] hover:text-[#E8ECF4]"
            style={{
              flex: '0 0 22px',
              width: 22,
              height: 22,
              borderRadius: 6,
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
      </div>

      {aberto && (
        <div
          id="lista-cidades"
          role="listbox"
          ref={listaRef}
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            left: -8,
            right: -8,
            zIndex: 30,
            maxHeight: 280,
            overflowY: 'auto',
            borderRadius: 10,
            border: '1px solid rgba(255,255,255,0.1)',
            background: '#0E1729',
            boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
            padding: 4,
          }}
        >
          {sugestoes.length === 0 ? (
            <div
              style={{ padding: '12px 10px', fontSize: 13, color: '#8A94A6' }}
            >
              Nenhuma cidade com “{texto.trim()}”.
            </div>
          ) : (
            <>
              {sugestoes.map((c, i) => (
                <div
                  key={c.rotulo}
                  role="option"
                  aria-selected={i === destaque}
                  data-destacado={i === destaque ? 'sim' : 'nao'}
                  // Sem isto o campo perde o foco antes do clique registrar.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolher(c.rotulo)}
                  onMouseEnter={() => setDestaque(i)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: 7,
                    fontSize: 13.5,
                    cursor: 'pointer',
                    color: i === destaque ? '#E8ECF4' : '#C8D1E0',
                    background:
                      i === destaque ? 'rgba(37,99,235,0.22)' : 'transparent',
                  }}
                >
                  {c.rotulo}
                </div>
              ))}
              {total > sugestoes.length && (
                <div
                  style={{
                    padding: '8px 10px 6px',
                    fontSize: 12,
                    color: '#6E7789',
                  }}
                >
                  e mais {total - sugestoes.length} — refine o texto
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Bloco de consulta da aba Vagas: cargo, cidade e o botão Buscar.
 *
 * Os dois campos se comportam de formas diferentes de propósito. O cargo é
 * texto livre — é o termo que vai para a API, e uma API de vagas recebe texto.
 * A cidade é lista fechada, porque localização errada não devolve resultado
 * ruim, devolve resultado nenhum.
 *
 * Ambos são *deferidos*: digitar altera só o rascunho, e a tabela muda quando
 * `onBuscar` promove o rascunho para os critérios da consulta. É a forma que a
 * busca vai precisar ter quando o clique disparar uma API — assíncrona, com
 * carregamento e erro.
 *
 * É o único controle da tela: não há filtro nenhum sobre o resultado. A aba
 * Banco de Dados não tem este bloco — ela lista o acervo direto.
 */
function ConsultaDestaque({
  cargo,
  cidade,
  onCargo,
  onCidade,
  onBuscar,
  pendente,
  buscando,
}) {
  return (
    <div style={{ maxWidth: 860, marginBottom: 14 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          padding: '14px 16px',
          borderRadius: 12,
          border: `1px solid ${cargo || cidade ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.09)'}`,
          background: '#0B1220',
        }}
      >
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#60A5FA"
          strokeWidth="1.9"
          style={{ flex: '0 0 19px' }}
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M16.5 16.5 21 21" />
        </svg>

        <input
          value={cargo}
          onChange={onCargo}
          // Enter num campo de busca dispara a busca — é o que qualquer um
          // espera. No campo de cidade, Enter escolhe a sugestão destacada.
          onKeyDown={(e) => e.key === 'Enter' && onBuscar()}
          placeholder="Digite o cargo..."
          aria-label="Cargo"
          // Nome de cargo não é prosa: o corretor sublinharia metade dos
          // termos técnicos, e o autocompletar do navegador ofereceria o
          // histórico de outros formulários.
          spellCheck={false}
          autoComplete="off"
          style={{
            flex: '1 1 200px',
            minWidth: 0,
            background: '#0B1220',
            border: 'none',
            outline: 'none',
            color: cargo ? '#E8ECF4' : '#8A94A6',
            fontSize: 15,
          }}
        />

        <span
          aria-hidden="true"
          style={{
            flex: '0 0 1px',
            alignSelf: 'stretch',
            background: 'rgba(255,255,255,0.08)',
          }}
        />

        <CampoCidade valor={cidade} onEscolher={onCidade} />

        <button
          onClick={onBuscar}
          disabled={buscando}
          className={buscando ? 'bg-[#2A3B5E]' : 'bg-[#2563EB] hover:bg-[#1D4FD8]'}
          style={{
            flex: '0 0 auto',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 20px',
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
            strokeWidth="2.1"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M16.5 16.5 21 21" />
          </svg>
          {buscando ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {/* Sem este aviso o modelo deferido engana: troca-se a cidade, a tabela
          não mexe, e a tela parece quebrada. */}
      {pendente && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 8,
            fontSize: 12.5,
            color: '#D9A441',
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5M12 16h.01" />
          </svg>
          Critérios alterados — clique em Buscar para aplicar.
        </div>
      )}
    </div>
  )
}

/** Estado da aba Vagas enquanto nenhum cargo ou filtro foi escolhido. */
function EsperaBusca() {
  return (
    <div
      style={{
        border: '1px solid rgba(255,255,255,0.06)',
        background: '#0B1220',
        borderRadius: 12,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: '80px 24px',
        minHeight: 340,
      }}
    >
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          border: '1px solid rgba(59,130,246,0.22)',
          background: 'rgba(37,99,235,0.1)',
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
          stroke="#60A5FA"
          strokeWidth="1.6"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M16.5 16.5 21 21" />
        </svg>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600 }}>
        Informe os critérios e clique em Buscar
      </div>
      <div
        style={{
          fontSize: 13.5,
          color: '#8A94A6',
          maxWidth: 380,
          textAlign: 'center',
          lineHeight: 1.6,
        }}
      >
        Informe o cargo e a cidade acima e clique em Buscar. A consulta vai à
        API de vagas e consome uma das 200 requisições do mês — repetir uma
        busca já feita sai do cache, sem custo.
      </div>
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

function Linha({ vaga, menuAberto, onMenu, onAbrir, onFavorito, onArquivar }) {
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
          <TituloDaVaga vaga={vaga} onAbrir={onAbrir} />
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
        <span style={{ fontSize: 13.5, color: '#D3DAE6' }}>
          {vaga.empresa ?? <span style={{ color: '#4A5468' }}>—</span>}
        </span>
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
          {vaga.cidade ?? <span style={{ color: '#4A5468' }}>—</span>}
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
        {vaga.modalidade ? (
          <span style={ESTILO_MODALIDADE[vaga.modalidade]}>
            {vaga.modalidade}
          </span>
        ) : (
          <span style={{ color: '#4A5468' }}>—</span>
        )}
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
        {d.temRank ? (
          <>
            <Rosca
              tamanho={42}
              rank={vaga.rank}
              cor={d.rankCor}
              dash={d.dash}
              fontSize={13}
            />
            <div style={{ fontSize: 10.5, color: d.rankCor }}>{d.rankLabel}</div>
          </>
        ) : (
          // Rosca vazia enganaria: pareceria nota zero, não nota ausente.
          <span style={{ color: '#4A5468', fontSize: 15 }}>—</span>
        )}
      </div>

      <div>
        {vaga.status ? (
          <span style={ESTILO_STATUS[vaga.status]}>{vaga.status}</span>
        ) : (
          <span style={{ color: '#4A5468' }}>—</span>
        )}
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
              onClick={onAbrir}
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

function Card({ vaga, onAbrir }) {
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
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>
            <TituloDaVaga vaga={vaga} onAbrir={onAbrir} />
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginTop: 8,
          }}
        >
          <span style={{ fontSize: 13, color: '#D3DAE6' }}>
            {vaga.empresa ?? <span style={{ color: '#4A5468' }}>—</span>}
          </span>
          <span style={{ fontSize: 12.5, color: '#7C8699' }}>
            · {vaga.cidade ?? '—'}
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
          {vaga.modalidade && (
            <span style={ESTILO_MODALIDADE[vaga.modalidade]}>
              {vaga.modalidade}
            </span>
          )}
          {vaga.status && (
            <span style={ESTILO_STATUS[vaga.status]}>{vaga.status}</span>
          )}
          <span style={{ fontSize: 12.5, color: '#D3DAE6' }}>{d.salario}</span>
          {d.desde && (
            <span style={{ fontSize: 12, color: '#7C8699' }}>{d.desde}</span>
          )}
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
        {d.temRank ? (
          <>
            <Rosca
              tamanho={40}
              rank={vaga.rank}
              cor={d.rankCor}
              dash={d.dash}
              fontSize={12.5}
            />
            <div style={{ fontSize: 10, color: d.rankCor }}>{d.rankLabel}</div>
          </>
        ) : (
          <span style={{ color: '#4A5468', fontSize: 15 }}>—</span>
        )}
      </div>
    </div>
  )
}

/**
 * Com o banco vazio, este é o estado normal da tela — não uma exceção. O texto
 * precisa dizer *por que* está vazio, senão parece defeito: hoje é porque não
 * há fonte de vagas ligada, e não porque a consulta não achou nada.
 */
function SemResultados({ cidade }) {
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
      <div style={{ fontSize: 15, fontWeight: 600 }}>
        {cidade ? `Nenhuma vaga em ${cidade}` : 'Nenhuma vaga encontrada'}
      </div>
      <div
        style={{
          fontSize: 13,
          color: '#8A94A6',
          textAlign: 'center',
          maxWidth: 380,
          lineHeight: 1.6,
        }}
      >
        A API não devolveu resultados para esta consulta. Tente outro cargo ou
        outra cidade — e lembre que cada nova consulta consome uma das 200
        requisições do mês, enquanto repetir uma já feita sai do cache.
      </div>
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
              placeholder="Caxias do Sul, RS"
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

/**
 * A vaga por inteiro. Ocupa o lugar da tabela em vez de virar modal: é a
 * descrição completa do anúncio, texto longo que pede a largura da página.
 *
 * Aqui — e só aqui — mora o link externo. O título na listagem levava direto
 * para fora do app, o que expulsava o usuário na primeira interação; agora ele
 * chega primeiro ao que já sabemos da vaga, e sai para o anúncio original se
 * quiser mesmo se candidatar.
 */
function PaginaVaga({ vaga, onVoltar }) {
  const d = derivar(vaga)

  const cartao = {
    border: '1px solid rgba(255,255,255,0.07)',
    background: '#0B1220',
    borderRadius: 12,
    padding: 22,
  }
  const legenda = {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
    color: '#7C8699',
    marginBottom: 6,
  }
  const valor = { fontSize: 14, color: '#D3DAE6' }
  const vazio = <span style={{ color: '#4A5468' }}>—</span>

  const dados = [
    ['Empresa', vaga.empresa],
    ['Localização', vaga.cidade],
    ['Salário', d.salario === '—' ? null : d.salario],
    ['Publicada', d.desde ? `${d.data} · ${d.desde}` : null],
  ]

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        maxWidth: 880,
      }}
    >
      <button
        onClick={onVoltar}
        className="bg-transparent text-[#9AA5B8] hover:text-[#E8ECF4]"
        style={{
          alignSelf: 'flex-start',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '6px 2px',
          border: 'none',
          fontSize: 13.5,
          cursor: 'pointer',
        }}
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M15 5l-7 7 7 7" />
        </svg>
        Voltar aos resultados
      </button>

      <div style={cartao}>
        <h2
          style={{
            margin: 0,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: '-0.01em',
            lineHeight: 1.3,
          }}
        >
          {vaga.cargo ?? vazio}
        </h2>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
            marginTop: 12,
          }}
        >
          {vaga.modalidade && (
            <span style={ESTILO_MODALIDADE[vaga.modalidade]}>
              {vaga.modalidade}
            </span>
          )}
          {vaga.status && (
            <span style={ESTILO_STATUS[vaga.status]}>{vaga.status}</span>
          )}
          {d.temRank ? (
            <span style={{ fontSize: 13, color: d.rankCor }}>
              Rank IA {vaga.rank} · {d.rankLabel}
            </span>
          ) : (
            <span style={{ fontSize: 13, color: '#6E7789' }}>
              Rank IA — a comparação com o currículo ainda não roda
            </span>
          )}
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 18,
            marginTop: 22,
            paddingTop: 20,
            borderTop: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {dados.map(([rotulo, conteudo]) => (
            <div key={rotulo}>
              <div style={legenda}>{rotulo}</div>
              <div style={valor}>{conteudo ?? vazio}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={cartao}>
        <div style={legenda}>Descrição da vaga</div>
        {vaga.descricao ? (
          <p
            style={{
              margin: 0,
              fontSize: 14,
              color: '#C8D1E0',
              lineHeight: 1.75,
              // A API devolve texto corrido com quebras de linha; preservá-las
              // é o que separa parágrafos de um bloco ilegível.
              whiteSpace: 'pre-wrap',
            }}
          >
            {vaga.descricao}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 13.5, color: '#7C8699' }}>
            Este anúncio veio sem descrição. Acontece: nem todo publicador
            preenche o campo, e a API repassa o que recebeu.
          </p>
        )}
      </div>

      {vaga.link ? (
        <a
          href={vaga.link}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-[#2563EB] hover:bg-[#1D4FD8]"
          style={{
            alignSelf: 'flex-start',
            display: 'flex',
            alignItems: 'center',
            gap: 9,
            padding: '12px 22px',
            borderRadius: 10,
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Ver vaga no site original
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
          >
            <path d="M14 4h6v6M20 4l-8.5 8.5" />
            <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
          </svg>
        </a>
      ) : (
        <div style={{ fontSize: 13, color: '#7C8699' }}>
          Esta vaga veio sem link de candidatura — nem `job_apply_link` nem
          `apply_options`. Não há para onde mandar o candidato.
        </div>
      )}
    </div>
  )
}

/**
 * Aba Vaga Inteligente: a busca que o aluno não precisa saber formular.
 *
 * O mecanismo previsto, quando as três integrações existirem:
 *
 *   1. a Claude API lê o currículo e deduz o cargo — o aluno informa só a cidade
 *   2. a JSearch busca por (cargo deduzido + cidade)
 *   3. a Claude API compara cada vaga com o currículo e dá uma nota
 *   4. a lista volta ordenada por compatibilidade
 *
 * Nada disso está ligado. Este painel é a casca: os estados, a ordem das
 * etapas e o lugar de cada resultado. O que ele faz de verdade hoje é registrar
 * a busca na cota — porque o passo 2 gasta uma das 200 requisições do mês, e
 * essa conta precisa existir desde já.
 *
 * O currículo é o mesmo da aba Avaliação IA: um só no app inteiro. Sem CV
 * enviado, esta aba não tem o que fazer e manda o aluno para lá.
 */
function PainelVagaInteligente({
  cv,
  cidade,
  onCidade,
  buscando,
  buscaFeita,
  bancoVazio,
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
          Currículo: <strong style={{ fontWeight: 600 }}>{cv.nome}</strong>
        </span>
        <span style={{ fontSize: 12.5, color: '#7C8699' }}>{cv.tamanho}</span>
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
            disabled={buscando}
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
          Você não escolhe o cargo: a IA deduz do seu currículo. Cada busca custa{' '}
          <strong style={{ color: '#B7C0D0' }}>1 requisição JSearch</strong> mais
          as chamadas à Claude — uma para ler o currículo e uma por vaga
          comparada. É a busca mais cara do app; a aba Controle registra a parte
          da JSearch.
        </div>
      </div>

      <div style={{ ...cartao, minHeight: 260 }}>
        {buscando ? (
          <Carregando />
        ) : buscaFeita ? (
          <ResultadoInteligente cidade={cidade} bancoVazio={bancoVazio} />
        ) : (
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
              A IA vai ler seu currículo, deduzir o cargo, procurar as vagas
              dessa cidade e comparar uma a uma com o seu perfil. O resultado
              volta ordenado por compatibilidade.
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Erro da busca. As mensagens vêm do `jsearch.js` já traduzidas — dizem o que
 * fazer (conferir o .env, esperar a renovação da cota) em vez de só o status.
 */
function AvisoErro({ texto }) {
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
function Carregando({ texto = 'Analisando currículo e comparando vagas...' }) {
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

/**
 * O resultado da busca inteligente. Enquanto nada está conectado, o honesto é
 * nomear as três integrações que faltam — senão a tela parece só quebrada.
 */
function ResultadoInteligente({ cidade, bancoVazio }) {
  const pendencia = (texto) => (
    <li style={{ marginBottom: 6 }}>
      <span style={{ color: '#D9A441' }}>◦</span> {texto}
    </li>
  )

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        padding: '30px 10px',
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 600 }}>
        Nada a ranquear ainda
      </div>
      <div
        style={{
          fontSize: 13,
          color: '#8A94A6',
          maxWidth: 460,
          lineHeight: 1.6,
        }}
      >
        A busca para {cidade || 'a cidade escolhida'} foi registrada na cota, mas
        o resultado depende de três ligações que ainda não existem:
      </div>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          fontSize: 13,
          color: '#8A94A6',
          textAlign: 'left',
          lineHeight: 1.6,
        }}
      >
        {pendencia('Claude API para deduzir o cargo a partir do currículo')}
        {pendencia(
          bancoVazio
            ? 'JSearch para trazer as vagas — o banco local está vazio'
            : 'JSearch para trazer as vagas',
        )}
        {pendencia('Claude API para pontuar cada vaga contra o currículo')}
      </ul>
    </div>
  )
}

/**
 * Aba Controle: quanto da cota mensal da JSearch já foi gasto.
 *
 * O protótipo ainda não chama a API, então o que se vê aqui é o consumo que
 * *haveria*. O mecanismo já é o definitivo — quando a chamada real entrar, o
 * número passa a ser o de verdade sem mexer nesta tela.
 */
function PainelControle({ cota, onZerar, onLimparCache }) {
  const gastas = usadas(cota)
  const doCache = servidasDoCache(cota)
  const restantes = Math.max(0, LIMITE_MENSAL - gastas)
  const fracao = gastas / LIMITE_MENSAL

  // Verde até a metade, âmbar a partir de 75%, vermelho perto do teto.
  const cor = fracao >= 0.9 ? '#F87171' : fracao >= 0.75 ? '#D9A441' : '#4ADE80'

  const cartao = {
    border: '1px solid rgba(255,255,255,0.07)',
    background: '#0B1220',
    borderRadius: 12,
    padding: 20,
  }
  const botao = {
    padding: '8px 14px',
    borderRadius: 9,
    border: '1px solid rgba(255,255,255,0.12)',
    fontSize: 13,
    cursor: 'pointer',
  }
  const legenda = {
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: '0.09em',
    textTransform: 'uppercase',
    color: '#7C8699',
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
      <div style={cartao}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 34, fontWeight: 700, color: cor }}>
              {gastas}
            </span>
            <span style={{ fontSize: 16, color: '#8A94A6' }}>
              / {LIMITE_MENSAL} requisições
            </span>
          </div>
          <button
            onClick={onZerar}
            className="bg-[#0E1729] text-[#C8D1E0] hover:bg-[#152039]"
            style={botao}
          >
            Zerar contagem
          </button>
        </div>

        {/* Um traço por requisição do mês: dá para ver quanto sobra sem ler
            o número. */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(50, 1fr)',
            gap: 3,
            marginBottom: 14,
          }}
          aria-hidden="true"
        >
          {Array.from({ length: LIMITE_MENSAL }, (_, i) => (
            <div
              key={i}
              style={{
                height: 14,
                borderRadius: 2,
                background: i < gastas ? cor : 'rgba(255,255,255,0.07)',
              }}
            />
          ))}
        </div>

        <div style={{ fontSize: 13, color: '#8A94A6', lineHeight: 1.6 }}>
          <strong style={{ color: '#E8ECF4', fontWeight: 600 }}>
            {restantes}
          </strong>{' '}
          {restantes === 1 ? 'requisição restante' : 'requisições restantes'} no
          ciclo
          {cota.desde ? `, iniciado em ${fmtDataHora(cota.desde, false)}` : ''}.
          {' '}O plano gratuito renova pela data da assinatura, não pelo dia 1º —
          zere a contagem à mão quando ele virar.
        </div>
      </div>

      <div style={cartao}>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontSize: 26, fontWeight: 700, color: '#60A5FA' }}>
              {doCache}
            </span>
            <span style={{ fontSize: 14, color: '#8A94A6' }}>
              {doCache === 1
                ? 'busca servida do cache'
                : 'buscas servidas do cache'}
            </span>
          </div>
          <button
            onClick={onLimparCache}
            className="bg-[#0E1729] text-[#C8D1E0] hover:bg-[#152039]"
            style={botao}
          >
            Limpar cache
          </button>
        </div>
        <div style={{ fontSize: 13, color: '#8A94A6', lineHeight: 1.6 }}>
          Repetir uma consulta já feita não gasta cota:{' '}
          {doCache === 0
            ? 'ainda não houve repetição nesta contagem.'
            : doCache === 1
              ? 'foi 1 requisição economizada.'
              : `foram ${doCache} requisições economizadas.`}{' '}
          Limpar o cache faz as próximas repetições voltarem a consumir.
        </div>
      </div>

      <div style={{ ...cartao, padding: 0, overflow: 'hidden' }}>
        <div
          style={{
            ...legenda,
            padding: '14px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          Últimas buscas
        </div>
        {cota.usos.length === 0 ? (
          <div style={{ padding: '28px 20px', fontSize: 13, color: '#8A94A6' }}>
            Nenhuma busca registrada. Consultas sem cargo e sem cidade não
            entram: não haveria requisição a fazer.
          </div>
        ) : (
          cota.usos.map((u, i) => (
            <div
              key={`${u.quando}-${i}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '11px 20px',
                borderBottom:
                  i === cota.usos.length - 1
                    ? 'none'
                    : '1px solid rgba(255,255,255,0.04)',
                fontSize: 13,
              }}
            >
              <span
                style={{
                  flex: '0 0 7px',
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  background: u.origem === 'rede' ? '#F87171' : '#60A5FA',
                }}
              />
              <span style={{ flex: 1, minWidth: 0, color: '#D3DAE6' }}>
                {[u.termo, u.cidade].filter(Boolean).join(' em ') ||
                  'consulta vazia'}
              </span>
              <span style={{ flex: '0 0 auto', color: '#7C8699' }}>
                {fmtDataHora(u.quando, true)}
              </span>
              <span
                style={{
                  flex: '0 0 62px',
                  textAlign: 'right',
                  color: u.origem === 'rede' ? '#F0A0A0' : '#93B4FD',
                  fontSize: 12.5,
                }}
              >
                {u.origem === 'rede' ? 'rede' : 'cache'}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

/* ------------------------------ app ------------------------------ */

export default function App() {
  // Base única: as duas abas leem e escrevem no mesmo banco de vagas.
  const [banco, setBanco] = useState(BANCO_DE_VAGAS)

  const [aba, setAba] = useState('vagas')
  // Cargo e cidade existem em dois tempos: o rascunho é o que os seletores do
  // bloco de destaque mostram, e `cargo`/`cidade` são os critérios da consulta
  // já feita. `buscar()` promove um no outro. Os demais filtros não têm
  // rascunho — valem no instante em que mudam.
  //
  // Estes dois não filtram a lista: eles *são* a consulta. O mock representa o
  // que a busca por "Técnico de TI em Caxias do Sul" devolveu, com títulos
  // variados como uma API de vagas devolve. Por isso a tabela aparece quando
  // `consultaFeita` liga — porque se buscou — e não porque algum campo bateu.
  const [cargoRascunho, setCargoRascunho] = useState('')
  const [cidadeRascunho, setCidadeRascunho] = useState('')
  const [cargo, setCargo] = useState('')
  const [cidade, setCidade] = useState('')
  const [consultaFeita, setConsultaFeita] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [erroBusca, setErroBusca] = useState(null)

  // A cota vem do localStorage, não do zero: é a única coisa do protótipo que
  // atravessa o recarregamento. Lida na inicialização preguiçosa para não
  // tocar no storage a cada render.
  const [cota, setCota] = useState(lerCota)

  const [ordem, setOrdem] = useState('rank')
  const [direcao, setDirecao] = useState('desc')
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState(10)

  // Qual vaga está aberta em detalhe, por id. Guardo o id e não o objeto para
  // a página acompanhar edições na lista (favoritar, marcar como lida).
  const [vagaAberta, setVagaAberta] = useState(null)

  const [menu, setMenu] = useState(null)
  const [dicaAberta, setDicaAberta] = useState(false)
  const [modalAberto, setModalAberto] = useState(false)
  const [estreito, setEstreito] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < 1024,
  )

  // Aba Vaga Inteligente. A cidade é o único critério que o aluno informa: o
  // cargo sairá do currículo, quando a Claude API entrar.
  const [cidadeIa, setCidadeIa] = useState('')
  const [buscandoIa, setBuscandoIa] = useState(false)
  const [buscaIaFeita, setBuscaIaFeita] = useState(false)

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

  /*
   * O botão voltar do navegador fecha a página de detalhe.
   *
   * Abrir empurra uma entrada no histórico **sem trocar a URL** (o terceiro
   * argumento do pushState fica vazio). Uma URL nova seria pior: no GitHub
   * Pages não há servidor para reescrever rotas, então recarregar em
   * `/vaga/123` daria 404. Assim o voltar funciona e o F5 continua abrindo o
   * app — ao custo de a vaga não ser compartilhável por link.
   */
  useEffect(() => {
    const aoVoltar = () => setVagaAberta(null)
    window.addEventListener('popstate', aoVoltar)
    return () => window.removeEventListener('popstate', aoVoltar)
  }, [])

  function abrirVaga(id) {
    alterarVaga(id, (x) => ({ ...x, seen: true }))
    setVagaAberta(id)
    window.history.pushState({ vaga: id }, '')
  }

  function fecharVaga() {
    // `back()` desfaz a entrada empurrada em `abrirVaga`; o popstate acima
    // limpa o estado. Chamar setVagaAberta(null) aqui deixaria uma entrada
    // órfã no histórico, e o voltar do navegador não faria nada visível.
    window.history.back()
  }

  // Sem recorte local: o `banco` já é o retorno da consulta, e quem filtrou
  // por localização foi a API. Comparar a cidade de novo aqui derrubaria vagas
  // legítimas — a JSearch escreve "Caxias Do Sul" ou devolve municípios
  // vizinhos, e nada disso bate com o rótulo exato do IBGE.
  const filtradas = useMemo(
    () => ordenar(banco, ordem, direcao),
    [banco, ordem, direcao],
  )

  const total = filtradas.length
  const maxPagina = Math.max(1, Math.ceil(total / porPagina))
  const paginaAtual = Math.min(pagina, maxPagina)
  const inicio = (paginaAtual - 1) * porPagina
  const visiveis = filtradas.slice(inicio, inicio + porPagina)

  const ehTabela = aba === 'vagas' || aba === 'banco'

  // A vaga aberta pode ter sido arquivada enquanto a página estava no ar;
  // buscar pelo id a cada render evita mostrar um registro que já saiu.
  const detalhe = vagaAberta
    ? (banco.find((v) => v.id === vagaAberta) ?? null)
    : null

  // Na aba Vagas nada aparece até se buscar. A aba Banco de Dados mostra o
  // acervo sempre.
  const mostrarResultados = aba === 'banco' || consultaFeita

  /**
   * A busca de verdade. O cache vem antes da rede de propósito: são 200
   * requisições por mês, e repetir uma consulta já feita não pode custar uma
   * delas.
   *
   * Só conta como requisição gasta o que de fato tocou a API — um erro de
   * chave ausente nunca sai da máquina, e um 401 é recusado antes de debitar.
   * Quem sabe essa diferença é o `tocouApi` do ErroJSearch.
   */
  async function buscar() {
    if (buscando) return

    const termo = cargoRascunho.trim()
    const cidadeAlvo = cidadeRascunho.trim()
    if (!termo && !cidadeAlvo) {
      setErroBusca('Informe ao menos o cargo ou a cidade para buscar.')
      return
    }

    setCargo(cargoRascunho)
    setCidade(cidadeRascunho)
    setErroBusca(null)
    setPagina(1)

    const guardado = consultarCache(termo, cidadeAlvo)
    if (guardado) {
      setBanco(guardado.vagas)
      setCota(registrarUso(termo, cidadeAlvo, 'cache'))
      setConsultaFeita(true)
      return
    }

    setBuscando(true)
    try {
      const resposta = await buscarVagas(montarConsulta(termo, cidadeAlvo))
      const vagas = mapearVagas(vagasDaResposta(resposta))
      setBanco(vagas)
      setCota(registrarUso(termo, cidadeAlvo, 'rede', vagas))
      setConsultaFeita(true)
    } catch (err) {
      const erro =
        err instanceof ErroJSearch
          ? err
          : new ErroJSearch(`Erro inesperado: ${err.message}`)
      setErroBusca(erro.message)
      setBanco([])
      setConsultaFeita(true)
      // Um erro que chegou à API consumiu uma das 200 mesmo sem devolver vaga.
      if (erro.tocouApi) {
        setCota(registrarUso(termo, cidadeAlvo, 'rede'))
      }
    } finally {
      setBuscando(false)
    }
  }

  const consultaPendente =
    cargoRascunho !== cargo || cidadeRascunho !== cidade

  /**
   * Busca inteligente. Hoje só encena: espera um instante e mostra o estado
   * que explica o que falta. O que já é real é o registro na cota — o passo da
   * JSearch gastaria uma das 200, e essa conta não pode começar depois.
   *
   * O termo vai como "Vaga Inteligente" porque o cargo verdadeiro só existirá
   * quando a Claude API ler o currículo; é ele que ocupa esse lugar depois.
   */
  function buscarInteligente() {
    if (buscandoIa) return
    setBuscandoIa(true)
    setCota(registrarUso('Vaga Inteligente', cidadeIa, 'rede'))
    window.setTimeout(() => {
      setBuscandoIa(false)
      setBuscaIaFeita(true)
    }, 900)
  }

  function irParaAba(nova) {
    setAba(nova)
    setPagina(1)
    // Limpa só a consulta da aba Vagas. A cidade da Vaga Inteligente fica:
    // o próprio fluxo manda o aluno até a Avaliação IA enviar o currículo e
    // voltar, e perder o que ele já preencheu nesse caminho seria hostil.
    limparConsulta()
    setMenu(null)
  }

  function limparConsulta() {
    setCargoRascunho('')
    setCidadeRascunho('')
    setCargo('')
    setCidade('')
    setConsultaFeita(false)
    setPagina(1)
  }

  function ordenarPor(chave) {
    setDirecao((d) => (ordem === chave ? (d === 'asc' ? 'desc' : 'asc') : 'desc'))
    setOrdem(chave)
    setPagina(1)
  }

  function alterarVaga(id, fn) {
    setMenu(null)
    setBanco((lista) => lista.map((x) => (x.id === id ? fn(x) : x)))
  }

  function arquivarVaga(id) {
    setMenu(null)
    setBanco((lista) => lista.filter((x) => x.id !== id))
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
    setBanco((lista) => [nova, ...lista])
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
        <Cabecalho aba={aba} />

        {/* A página de detalhe ocupa o lugar da tabela e do bloco de consulta:
            é uma tela, não um painel dentro da listagem. */}
        {ehTabela && detalhe && (
          <PaginaVaga vaga={detalhe} onVoltar={fecharVaga} />
        )}

        {ehTabela && !detalhe && (
          <div>
            {aba === 'vagas' && (
              <ConsultaDestaque
                cargo={cargoRascunho}
                cidade={cidadeRascunho}
                onCargo={(e) => setCargoRascunho(e.target.value)}
                // O combobox entrega o rótulo já escolhido da lista, não um
                // evento: não há texto digitado virando valor.
                onCidade={setCidadeRascunho}
                onBuscar={buscar}
                pendente={consultaPendente}
                buscando={buscando}
              />
            )}

            {aba === 'vagas' && erroBusca && <AvisoErro texto={erroBusca} />}

            {buscando ? (
              <div
                style={{
                  border: '1px solid rgba(255,255,255,0.06)',
                  background: '#0B1220',
                  borderRadius: 12,
                }}
              >
                <Carregando texto="Consultando a API de vagas..." />
              </div>
            ) : !mostrarResultados ? (
              <EsperaBusca />
            ) : (
              <>
                {/* Com zero resultados quem fala é o bloco "Nenhuma vaga
                    encontrada" logo abaixo; a contagem seria redundante. */}
                {aba === 'vagas' && total > 0 && (
                  <div
                    style={{ fontSize: 13, color: '#8A94A6', marginBottom: 12 }}
                  >
                    <strong style={{ color: '#E8ECF4', fontWeight: 600 }}>
                      {total}
                    </strong>{' '}
                    {total === 1 ? 'vaga encontrada' : 'vagas encontradas'}
                    {cargo || cidade
                      ? ` para “${[cargo, cidade].filter(Boolean).join(' em ')}”`
                      : null}
                  </div>
                )}

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
                          // Chega com evento pelo item do menu e sem evento
                          // pelo título, que já parou a propagação por conta.
                          onAbrir={(e) => {
                            e?.stopPropagation()
                            abrirVaga(vaga.id)
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
                        <Card
                          key={vaga.id}
                          vaga={vaga}
                          onAbrir={() => abrirVaga(vaga.id)}
                        />
                      ))}
                    </div>
                  )}
  
                  {total === 0 && (
                    <SemResultados cidade={cidade} />
                  )}
  
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
              </>
            )}
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

        {aba === 'inteligente' && (
          <PainelVagaInteligente
            cv={cv}
            cidade={cidadeIa}
            onCidade={(valor) => {
              setCidadeIa(valor)
              setBuscaIaFeita(false)
            }}
            buscando={buscandoIa}
            buscaFeita={buscaIaFeita}
            bancoVazio={banco.length === 0}
            onBuscar={buscarInteligente}
            onIrParaCurriculo={() => irParaAba('ia')}
          />
        )}

        {aba === 'controle' && (
          <PainelControle
            cota={cota}
            onZerar={() => setCota(zerarContagem())}
            onLimparCache={() => setCota(limparCache())}
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
