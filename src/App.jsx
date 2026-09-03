import { useEffect, useMemo, useState } from 'react'
import { BANCO_DE_VAGAS, INSTRUCAO_PADRAO, MODALIDADES } from './data/vagas'
import {
  LIMITE_MENSAL,
  ajustarContagem,
  chaveDaConsulta,
  consultarCache,
  paginasDoCache,
  proximaPagina,
  lerCota,
  limparCache,
  registrarUso,
  servidasDoCache,
  usadas,
  zerarContagem,
} from './cota'
import { mensagemDoErro, TIPOS } from './api/claude'
import {
  ErroJSearch,
  buscarVagas,
  cursorDaResposta,
  montarConsulta,
  vagasDaResposta,
} from './api/jsearch'
import { justificar } from './api/justificativa'
import { mapearVagas } from './api/mapear'
import { ranquear } from './api/ranking'
import { definirInstrucao, lerCurriculo, perfilEfetivo } from './curriculo'
import { dolares, lerCusto, zerarCusto } from './custo'
import { acharVaga } from './detalhe'
import { faseDaBusca } from './fase'
import {
  JANELAS,
  JANELA_PADRAO,
  cabeNoQueJaTemos,
  filtrarPorJanela,
  janelaDe,
} from './janela'
import {
  // Apelidado porque `data/vagas.js` já exporta um `MODALIDADES`: lá é o array
  // de strings do formulário de cadastro manual, aqui são as opções do filtro
  // de busca, com valor de API e rótulo. Coisas diferentes com o mesmo nome —
  // e o `local` de cada opção daqui tem que bater com as strings de lá, que é
  // o que o `modalidade.test.js` trava.
  MODALIDADES as OPCOES_MODALIDADE,
  MODALIDADE_PADRAO,
  filtrarPorModalidade,
  modalidadeDe,
  soRemotas,
} from './modalidade'
import { lerParaMigrar, marcarMigrado } from './acervo'
import {
  atualizarVagaRemota,
  guardarVagasRemoto,
  lerAcervoRemoto,
} from './acervoRemoto'
import { FILTRO_VAZIO, filtrarAcervo, opcoesDoAcervo } from './filtroAcervo'
import CampoCidade from './paineis/CampoCidade'
import { AvisoErro, Carregando } from './paineis/comuns'
import PainelIA from './paineis/PainelIA'
import PainelVagaInteligente from './paineis/PainelVagaInteligente'

/* ------------------------------------------------------------------ *
 * Protótipo com rede de verdade: a busca (JSearch) e a Avaliação IA
 * (Claude, via api/claude.js) saem daqui — as duas só funcionam com
 * `npm run dev`, que sobe o proxy que injeta as chaves.
 * O estado da tela em si é só memória, mas nem tudo se perde no F5:
 * `curriculo.js`, `custo.js` e `cota.js` gravam em localStorage
 * (`vagas:cv`, `vagas:custo`, `vagas:cota`), e isso sobrevive.
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
 * Um dos dois filtros de dropdown da barra de busca, com o rótulo em cima.
 *
 * O rótulo existe porque o `<select>` só mostra o *valor* escolhido, nunca o
 * que ele significa: "Último mês" sozinho não diz que é a data de publicação,
 * e ao lado de um segundo dropdown a ambiguidade piora — "Último mês" e
 * "Todas" lado a lado não se explicam. Cargo e cidade não precisam disso: o
 * placeholder deles já é a pergunta.
 *
 * Existe como componente e não como JSX repetido porque são dois campos com o
 * mesmo comportamento e a mesma aparência — duplicar seria a próxima mudança
 * de estilo saindo pela metade.
 */
function FiltroSuspenso({ rotulo, valor, opcoes, onMudar, dica }) {
  return (
    <label
      style={{
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: 0.4,
          textTransform: 'uppercase',
          color: '#7C879B',
        }}
      >
        {rotulo}
      </span>
      <select
        value={valor}
        onChange={(e) => onMudar(e.target.value)}
        title={dica}
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
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.rotulo}
          </option>
        ))}
      </select>
    </label>
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
 * A janela de publicação é o terceiro campo, e é o primeiro que também recorta
 * o resultado depois que ele chega — `date_posted` na requisição e um segundo
 * corte local, porque a API aceita a janela e nem sempre a cumpre (ver
 * `janela.js`). Ela é deferida como os outros dois: trocar o dropdown não
 * refaz a busca sozinho, porque uma janela mais larga precisa de requisição
 * nova e requisição custa cota.
 *
 * A modalidade é o quarto, e tem duas opções porque a API responde uma
 * pergunta de duas respostas: `work_from_home` é booleano. "Remoto" a manda,
 * "Presencial" é a ausência dela — e, sendo o complemento e não uma
 * igualdade, é onde caem também as híbridas e as vagas que vieram sem
 * modalidade informada. Nada fica sem opção. Ver `modalidade.js`.
 *
 * A aba Banco de Dados não tem este bloco — ela lista o acervo direto, e o
 * acervo não é recortado por data.
 */
function ConsultaDestaque({
  cargo,
  cidade,
  janela,
  modalidade,
  onCargo,
  onCidade,
  onJanela,
  onModalidade,
  onBuscar,
  pendente,
  buscando,
  ranqueando,
}) {
  return (
    <div style={{ maxWidth: 980, marginBottom: 14 }}>
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

        <span
          aria-hidden="true"
          style={{
            flex: '0 0 1px',
            alignSelf: 'stretch',
            background: 'rgba(255,255,255,0.08)',
          }}
        />

        <FiltroSuspenso
          rotulo="Data de Publicação"
          valor={janela}
          opcoes={JANELAS}
          onMudar={onJanela}
          dica="Só entram vagas publicadas dentro desta janela"
        />

        <FiltroSuspenso
          rotulo="Modalidade"
          valor={modalidade}
          opcoes={OPCOES_MODALIDADE}
          onMudar={onModalidade}
          dica="Remoto é pedido à API; Presencial é todo o resto, recortado aqui"
        />

        <button
          onClick={onBuscar}
          // `ranqueando` dura vários segundos; sem ele no `disabled` o botão
          // fica clicável e inerte nesse intervalo — `buscar()` já recusa
          // (`if (buscando || ranqueando) return`), mas em silêncio, sem
          // avisar por que o clique não fez nada. (A tabela não está mais na
          // tela durante o ranking, mas o campo de busca continua — é dele
          // que este botão faz parte.)
          disabled={buscando || ranqueando}
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

/**
 * A barra de filtro da aba Banco de Dados.
 *
 * Tem a aparência da `ConsultaDestaque` e um comportamento diferente, e a
 * diferença toda cabe numa frase: **aqui não há requisição**.
 *
 * Por isso não tem botão "Buscar" nem o aviso "Critérios alterados". Lá o
 * adiamento protege as 200 requisições do mês de um filtro que dispararia a
 * cada tecla; aqui não há o que proteger, e o botão seria um clique que não
 * evita custo nenhum.
 *
 * Os dropdowns são montados a partir do próprio acervo — ver `filtroAcervo.js`
 * para o porquê, que envolve a lista do IBGE não casar com os rótulos que a
 * API gravou.
 *
 * Um seletor com menos de dois valores distintos não é desenhado: ele só
 * poderia oferecer o estado em que já está. Volta sozinho quando o acervo
 * ganhar variedade — hoje, por exemplo, as 35 vagas são todas presenciais, e
 * um dropdown de modalidade ali seria enfeite.
 */
function FiltroDoAcervo({ filtro, opcoes, onFiltro, total, mostrando }) {
  const comoOpcoes = (lista) => [
    { valor: '', rotulo: 'Todas' },
    ...lista.map((o) => ({ valor: o.valor, rotulo: `${o.valor} (${o.quantas})` })),
  ]

  const mudar = (campo) => (valor) => onFiltro({ ...filtro, [campo]: valor })
  const filtrando =
    filtro.texto || filtro.cidade || filtro.modalidade || filtro.janela

  return (
    <div style={{ maxWidth: 980, marginBottom: 14 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
          padding: '14px 16px',
          borderRadius: 12,
          border: `1px solid ${filtrando ? 'rgba(59,130,246,0.35)' : 'rgba(255,255,255,0.09)'}`,
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
          value={filtro.texto}
          onChange={(e) => mudar('texto')(e.target.value)}
          placeholder="Filtrar por cargo ou empresa..."
          aria-label="Filtrar o acervo"
          spellCheck={false}
          autoComplete="off"
          style={{
            flex: '1 1 220px',
            minWidth: 0,
            background: '#0B1220',
            border: 'none',
            outline: 'none',
            color: filtro.texto ? '#E8ECF4' : '#8A94A6',
            fontSize: 15,
          }}
        />

        {opcoes.cidades.length > 1 && (
          <>
            <span
              aria-hidden="true"
              style={{
                flex: '0 0 1px',
                alignSelf: 'stretch',
                background: 'rgba(255,255,255,0.08)',
              }}
            />
            {/* O mesmo campo da aba Vagas — digitar estreita a lista, e só se
                escolhe de dentro dela. A lista é a do acervo, não a do IBGE:
                o rótulo precisa casar exatamente com o que está gravado, e a
                API grava ora "RS", ora "Rio Grande do Sul". */}
            <CampoCidade
              valor={filtro.cidade}
              onEscolher={mudar('cidade')}
              // A contagem entra como `nota` e sai entre parênteses na
              // sugestão. É ela que diferencia "Goiânia, Goiás (8)" de
              // "Aparecida de Goiânia, Goiás (1)" antes de escolher — sem
              // isso, só o contador depois do filtro diria.
              cidades={opcoes.cidades.map((c) => ({
                rotulo: c.valor,
                nota: c.quantas,
              }))}
            />
          </>
        )}

        {opcoes.modalidades.length > 1 && (
          <FiltroSuspenso
            rotulo="Modalidade"
            valor={filtro.modalidade}
            opcoes={comoOpcoes(opcoes.modalidades)}
            onMudar={mudar('modalidade')}
            dica="Só as modalidades que já existem no acervo"
          />
        )}

        <FiltroSuspenso
          rotulo="Data de Publicação"
          valor={filtro.janela}
          // O `all` da `JANELAS` sai da lista: no acervo ele e o "sem filtro"
          // são a mesma coisa — os dois mostram tudo —, e oferecer os dois
          // punha "Qualquer data" duas vezes no dropdown. Fica o valor vazio,
          // que é o que o `filtrando` usa para saber se há filtro ativo.
          opcoes={[
            { valor: '', rotulo: 'Qualquer data' },
            ...JANELAS.filter((j) => j.valor !== 'all'),
          ]}
          onMudar={mudar('janela')}
          dica="Recorta pelo tempo desde a publicação, como na aba Vagas"
        />

        {/* Só aparece quando há o que limpar: um botão permanentemente inerte
            ensina a ignorá-lo. */}
        {filtrando && (
          <button
            onClick={() => onFiltro(FILTRO_VAZIO)}
            style={{
              flex: '0 0 auto',
              padding: '8px 14px',
              borderRadius: 9,
              border: '1px solid rgba(255,255,255,0.12)',
              background: 'transparent',
              color: '#C8D1E0',
              fontSize: 12.5,
              cursor: 'pointer',
            }}
          >
            Limpar
          </button>
        )}
      </div>

      {/* A conta tem que fechar. Sem ela, um acervo de 35 mostrando 2 pareceria
          um acervo que perdeu 33. */}
      {filtrando && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: '#8A94A6' }}>
          Mostrando <strong style={{ color: '#C8D1E0' }}>{mostrando}</strong> de{' '}
          {total} {total === 1 ? 'vaga' : 'vagas'} no acervo
        </div>
      )}
    </div>
  )
}

/**
 * Os estados da aba Banco de Dados enquanto não há uma linha para mostrar.
 *
 * Existe separado do `SemResultados` porque as mensagens de lá falam em API e
 * em cota — "a API não devolveu resultados", "cada nova consulta consome uma
 * das 200 requisições" —, e nenhuma das duas coisas aconteceu aqui.
 *
 * O acervo vive no servidor agora, então um vazio dele **pode**, sim, ser
 * culpa de uma requisição — é exatamente o que o estado `falhou` existe para
 * nomear, em vez de deixar a tela parecer um acervo vazio de verdade e
 * sugerir "faça uma busca" para um problema de rede.
 *
 * Quando o acervo chegou (`estado === 'pronto'`) e continua vazio, ainda são
 * dois vazios diferentes, que pedem saídas opostas: com filtro, o que falta é
 * afrouxar; sem filtro, o que falta é buscar. Uma mensagem só teria de mandar
 * fazer as duas coisas, e a metade errada é a que a pessoa tentaria primeiro.
 */
function AcervoVazio({ filtrando, onLimpar, estado, erro, onTentarDeNovo }) {
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
          <ellipse cx="12" cy="6" rx="8" ry="3" />
          <path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
          <path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" />
        </svg>
      </div>

      <div style={{ fontSize: 15, fontWeight: 600 }}>
        {estado === 'carregando'
          ? 'Carregando o acervo…'
          : estado === 'falhou'
            ? 'Não consegui carregar o acervo'
            : filtrando
              ? 'Nenhuma vaga com este filtro'
              : 'O acervo ainda está vazio'}
      </div>

      <div
        style={{
          fontSize: 13,
          color: '#8A94A6',
          textAlign: 'center',
          maxWidth: 400,
          lineHeight: 1.6,
        }}
      >
        {estado === 'carregando' ? (
          <>Buscando no servidor o que já foi arquivado.</>
        ) : estado === 'falhou' ? (
          <>
            {/* Dizer que falhou, e não mostrar uma tela de vazio: acervo vazio
                por queda de rede é idêntico a acervo vazio de verdade, e o
                conselho "faça uma busca" mandaria gastar cota à toa. */}
            O acervo vive no servidor, e ele não respondeu. {erro}
            <div style={{ marginTop: 12 }}>
              <button
                onClick={onTentarDeNovo}
                className="bg-[#0E1729] text-[#C8D1E0] hover:bg-[#152039]"
                style={{
                  padding: '8px 14px',
                  borderRadius: 9,
                  border: '1px solid rgba(255,255,255,0.12)',
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                Tentar de novo
              </button>
            </div>
          </>
        ) : filtrando ? (
          <>
            O acervo tem vagas, mas nenhuma casa com o que você pediu. Afrouxe
            os campos acima — filtrar aqui não gasta requisição, então pode
            tentar à vontade.
          </>
        ) : (
          <>
            Tudo que a aba Vagas trouxer fica guardado aqui, e o acervo é
            compartilhado: a busca de qualquer pessoa alimenta o mesmo banco.
          </>
        )}
      </div>

      {filtrando && (
        <button
          onClick={onLimpar}
          style={{
            padding: '8px 16px',
            borderRadius: 9,
            border: '1px solid rgba(255,255,255,0.12)',
            background: 'transparent',
            color: '#C8D1E0',
            fontSize: 12.5,
            cursor: 'pointer',
          }}
        >
          Limpar filtro
        </button>
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
      <div>Ver Vaga</div>
      <div />
    </div>
  )
}

/**
 * O atalho para o anúncio original, direto da listagem.
 *
 * Ocupa o lugar que era da coluna Status. O status não estava dizendo nada:
 * `mapear.js` fixa "Ativa" em toda vaga vinda da API — a JSearch não tem campo
 * de expiração, conferido nos 35 campos da resposta —, então a coluna inteira
 * mostrava a mesma pílula verde em todas as linhas.
 *
 * Três cuidados que não são enfeite:
 *
 * `stopPropagation` porque a linha inteira já abre o detalhe. Sem ele, um
 * clique aqui dispararia as duas coisas: a aba externa **e** a página interna
 * por baixo dela.
 *
 * `rel="noopener noreferrer"` pelo mesmo motivo do botão da página de detalhe:
 * sem `noopener`, a página aberta recebe uma referência a esta pela
 * `window.opener` e pode trocar o endereço daqui. São links de terceiros,
 * vindos de uma API.
 *
 * E o link já chega saneado de `mapear.js` (`linkDeCandidatura`): só `http` e
 * `https` viram `href`. A peneira mora lá, na origem, e não aqui — assim o
 * valor perigoso nunca existe no estado, e esta tela não é a única guarda.
 *
 * Sem link vira "—", como todo campo ausente da tabela. Um ícone morto
 * prometeria uma ação que não acontece.
 */
function LinkDaVaga({ link, rotulo = null }) {
  if (!link) {
    return <span style={{ color: '#4A5468' }}>—</span>
  }
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => e.stopPropagation()}
      title="Abrir o anúncio no site original"
      aria-label="Abrir o anúncio no site original"
      className="text-[#8A94A6] hover:text-[#60A5FA]"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        padding: '5px 9px',
        borderRadius: 8,
        border: '1px solid rgba(255,255,255,0.1)',
        fontSize: 12.5,
        fontWeight: 500,
        textDecoration: 'none',
      }}
    >
      {rotulo}
      <IconeExterno />
    </a>
  )
}

function Linha({ vaga, menuAberto, onMenu, onAbrir }) {
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
    // A linha inteira abre o detalhe, como o card da Vaga Inteligente. Duas
    // diferenças em relação a ele, e as duas vêm de a linha ter botões dentro:
    //
    // `div` e não `button`: um botão dentro de outro é HTML inválido e leitor
    // de tela não sabe o que anunciar. E `div` com onClick não pega foco por
    // teclado — por isso o `TituloDaVaga` continua sendo um botão de verdade,
    // e não virou texto simples: ele é o caminho de teclado para a mesma ação.
    // Mouse ganha a linha toda, teclado mantém o título.
    <div
      onClick={onAbrir}
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
        cursor: 'pointer',
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
        title="O acervo é compartilhado: esta nota pode ter saído do currículo de outra pessoa."
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
        <LinkDaVaga link={vaga.link} />
      </div>

      <div
        style={{
          position: 'relative',
          display: 'flex',
          justifyContent: 'flex-end',
        }}
      >
        {/* Quem para a propagação é o handler lá no chamador (`onMenu`, que
            já recebia o evento e o parava por causa do listener de documento
            que fecha o menu). Isso agora guarda também contra o clique da
            linha: em React, parar no filho impede o onClick do ancestral. Não
            embrulhe aqui — `onMenu` chama `e.stopPropagation()` sem `?.`, e
            invocá-lo sem evento lança. */}
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
            {/* O item para a propagação no chamador, e é isso que o guarda do
                clique da linha inteira. Mesma advertência do botão acima: não
                embrulhar aqui.

                Foram três itens — "Favoritar" e "Arquivar" saíram. O menu
                continua existindo por causa do modo estreito, onde a linha
                vira card e este é o caminho para o detalhe. */}
            <button
              onClick={onAbrir}
              className={classeItemMenu}
              style={itemMenu}
            >
              Ver detalhes
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
    // Mesmo tratamento da `Linha`, e pelo mesmo motivo: o card contém o
    // `TituloDaVaga`, que é um botão, então envolvê-lo num `button` aninharia
    // interativos. Aqui não há menu — o título é o único filho a se guardar, e
    // ele já para a propagação por conta própria.
    <div
      onClick={onAbrir}
      style={{
        padding: 16,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
        display: 'flex',
        gap: 14,
        alignItems: 'flex-start',
        cursor: 'pointer',
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
          <LinkDaVaga link={vaga.link} rotulo="Ver vaga" />
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
 * precisa dizer *por que* está vazio, senão parece defeito.
 *
 * São dois vazios diferentes e o texto tem que separá-los: a API não devolveu
 * nada, ou devolveu e os recortes locais esconderam tudo. Sem essa distinção
 * o segundo caso mente — diria "a API não devolveu resultados" depois de uma
 * requisição que devolveu dez vagas, e o aluno mexeria no cargo e na cidade
 * quando o que estava apertado era um filtro.
 *
 * `rotulos` são os recortes ativos já em português ("Último mês", "Remoto").
 * O texto os nomeia sem dizer qual deles cortou cada vaga: são dois filtros
 * encadeados, atribuir a culpa exigiria contar separado, e para quem lê a
 * pergunta é "o que eu afrouxo?", não "qual dos dois foi".
 */
function SemResultados({ cidade, ocultadas = 0, rotulos = [] }) {
  const foiORecorte = ocultadas > 0
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
        {foiORecorte
          ? 'Nenhuma vaga dentro deste recorte'
          : cidade
            ? `Nenhuma vaga em ${cidade}`
            : 'Nenhuma vaga encontrada'}
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
        {foiORecorte ? (
          <>
            A busca devolveu{' '}
            <strong style={{ color: '#C8D1E0', fontWeight: 600 }}>
              {ocultadas}
            </strong>{' '}
            {ocultadas === 1 ? 'vaga' : 'vagas'}, mas{' '}
            {ocultadas === 1 ? 'ela não passou' : 'nenhuma passou'} pelo
            recorte de {rotulos.map((r) => `“${r}”`).join(' e ')}. Vaga sem
            data de publicação fica de fora por padrão, e é o caso comum dos
            anúncios já encerrados. Afrouxe os filtros acima e clique em
            Buscar.
          </>
        ) : (
          <>
            A API não devolveu resultados para esta consulta. Tente outro cargo
            ou outra cidade — e lembre que cada nova consulta consome uma das
            200 requisições do mês, enquanto repetir uma já feita sai do cache.
          </>
        )}
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
/**
 * A seta de "sai do app". Extraída porque o link externo passou a existir em
 * dois lugares da mesma página — topo e rodapé — e duas cópias do mesmo SVG
 * divergem na primeira vez que alguém ajusta só uma delas.
 */
function IconeExterno() {
  return (
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
  )
}

function PaginaVaga({ vaga, onVoltar, cv, instrucao, onCusto, ranqueando }) {
  const d = derivar(vaga)

  // Não persiste: reabrir a vaga (ou trocar de aba e voltar) refaz a
  // chamada. Guardar exigiria mais um cache para invalidar toda vez que o
  // perfil mudasse, e o preço (~US$ 0,01) não justifica.
  const [justificativa, setJustificativa] = useState(null)
  const [justificando, setJustificando] = useState(false)
  const [erroJustificativa, setErroJustificativa] = useState(null)

  async function pedirJustificativa() {
    setJustificando(true)
    setErroJustificativa(null)
    try {
      const texto = await justificar(perfilEfetivo(cv), cv?.texto, instrucao, vaga)
      setJustificativa(texto)
    } catch (err) {
      setErroJustificativa(mensagemDoErro(err))
    } finally {
      setJustificando(false)
      // `PaginaVaga` não guarda o estado de custo — é do `App` — por isso o
      // callback em vez de reler direto.
      onCusto()
    }
  }

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
      {/* Barra de ações do topo. O "Voltar" era texto solto em cinza fraco
          (#9AA5B8, sem borda nem fundo) e desaparecia contra o cartão; virou
          botão fantasma. O link externo estava só no rodapé, depois de uma
          descrição que passa de mil pixels — subiu para cá **sem sair de lá**:
          quem só quer se candidatar acha no topo, quem lê tudo se candidata
          onde terminou de ler.

          O mesmo rótulo nos dois lugares, de propósito. É a mesma ação, e uma
          ação que troca de nome no meio do fluxo obriga a reaprender a tela; a
          diferença entre eles é de peso visual, não de vocabulário. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          // Em tela estreita os dois empilham em vez de espremer o rótulo.
          flexWrap: 'wrap',
        }}
      >
        <button
          onClick={onVoltar}
          className="bg-white/[0.04] text-[#D3DAE6] hover:bg-white/[0.08] hover:text-[#E8ECF4]"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            padding: '9px 14px',
            borderRadius: 9,
            border: '1px solid rgba(255,255,255,0.09)',
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

        {/* Sem link não há botão nenhum aqui — um botão morto no topo seria
            pior que a ausência. O rodapé explica o porquê da falta. */}
        {vaga.link && (
          <a
            href={vaga.link}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#2563EB] hover:bg-[#1D4FD8]"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              // Menor que o do rodapé (12px/22px, fonte 14): ali ele é o
              // fecho da leitura e pode pesar; aqui divide um cabeçalho com o
              // Voltar, e dois botões cheios brigariam entre si.
              padding: '9px 16px',
              borderRadius: 9,
              color: '#fff',
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: 'none',
            }}
          >
            Ver vaga no site original
            <IconeExterno />
          </a>
        )}
      </div>

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
              {/* `vaga.rank` null não distingue por que não há nota, então o
                  texto sai do estado da tela, não do dado. Já erramos aqui
                  duas vezes: "ainda não roda" mentia depois que o ranking
                  passou a rodar, e "a comparação rodou" mentia sem currículo
                  (o `ranquearBanco` desiste antes de chamar) e durante o
                  próprio ranking. Se acrescentar um quarto caso, condicione
                  também — afirmar categoricamente aqui é o erro que se repete.

                  O caso `ranqueando` hoje não tem como aparecer: só a tabela
                  abre esta página, a tabela não renderiza durante o ranking, e
                  o campo de busca fica escondido enquanto esta página está no
                  ar. Fica de pé porque continua *verdadeiro* se renderizar —
                  se um dia a lista voltar a aparecer antes das notas, ele
                  volta a ser necessário e certo. Só não é mais um caso vivo. */}
              {!cv?.perfil
                ? 'Rank IA — envie um currículo na aba Avaliação IA para ranquear'
                : ranqueando
                  ? 'Rank IA — comparando com o seu currículo...'
                  : 'Rank IA — a comparação rodou e esta vaga não recebeu nota'}
            </span>
          )}
        </div>

        {vaga.rank != null && (
          <div style={{ fontSize: 12, color: '#7C8699', marginTop: 4 }}>
            Nota calculada contra o currículo de quem pediu a avaliação — o
            acervo é compartilhado, então ela pode não medir o seu.
          </div>
        )}

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

      {/* Só existe nota para justificar quando o ranking já rodou — uma vaga
          sem `rank` não tem o que explicar. E só faz sentido chamar a API
          se ainda houver perfil: se o currículo foi removido depois de
          ranquear, `cv` é `null` e a nota que sobrou é resto de um perfil
          que não está mais lá — sem o `cv?.perfil` aqui, o clique gastaria
          uma chamada paga só para comparar a vaga com nada. */}
      {vaga.rank !== null && cv?.perfil && (
        <div style={cartao}>
          <div style={legenda}>Por que esta nota?</div>

          {!justificativa && !justificando && (
            <button
              onClick={pedirJustificativa}
              disabled={justificando}
              className="bg-[#161F33] hover:bg-[#1B2740]"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '9px 16px',
                borderRadius: 9,
                border: '1px solid rgba(255,255,255,0.1)',
                color: '#D3DAE6',
                fontSize: 13.5,
                fontWeight: 500,
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
                <circle cx="12" cy="12" r="9" />
                <path d="M9.5 9.2a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 1.9-2.4 3.5M12 16.6v.1" />
              </svg>
              Por que esta nota?
            </button>
          )}

          {justificando && <Carregando texto="Gerando a justificativa..." />}

          {erroJustificativa && <AvisoErro texto={erroJustificativa} />}

          {justificativa && (
            <p
              style={{
                margin: 0,
                fontSize: 14,
                color: '#C8D1E0',
                lineHeight: 1.75,
                whiteSpace: 'pre-wrap',
              }}
            >
              {justificativa}
            </p>
          )}
        </div>
      )}

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
          <IconeExterno />
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
 * Aba Controle: quanto da cota mensal da JSearch já foi gasto.
 *
 * O número é real desde que a busca passou a sair para a rede — e é por isso
 * que ele precisa estar certo. Já esteve errado: contado a partir do histórico
 * da tela, que tem teto, o painel mostrava 3 requisições com 50 gastas na
 * conta. A contagem hoje vem de `totais`, no `cota.js`, que não é cortado.
 *
 * O que ele ainda não consegue saber sozinho é o que foi gasto de outro
 * navegador — a cota é da conta, o `localStorage` é da origem. Daí o
 * "Ajustar": o painel do provedor é a fonte, e este botão é a entrada dela.
 */
function PainelControle({
  cota,
  onZerar,
  onAjustar,
  onLimparCache,
  custo,
  onZerarCusto,
}) {
  const gastas = usadas(cota)
  const doCache = servidasDoCache(cota)
  const restantes = Math.max(0, LIMITE_MENSAL - gastas)
  const fracao = gastas / LIMITE_MENSAL

  /**
   * O campo de ajuste, aberto ou fechado.
   *
   * `null` é fechado; string (inclusive vazia) é aberto. O valor fica como
   * texto e não como número porque um campo numérico esvaziado devolve `''`,
   * e guardá-lo como `Number` transformaria a caixa vazia em zero na frente de
   * quem só apagou para digitar de novo.
   */
  const [ajuste, setAjuste] = useState(null)

  const confirmarAjuste = () => {
    onAjustar(Number(ajuste))
    setAjuste(null)
  }

  // Verde até a metade, âmbar a partir de 75%, vermelho perto do teto.
  const cor = fracao >= 0.9 ? '#F87171' : fracao >= 0.75 ? '#D9A441' : '#4ADE80'

  // Mesma lógica de cor do cartão do JSearch, mas contra o teto em dólar —
  // que é nosso, não do provedor (ver custo.js).
  const gastoClaude = dolares(custo.chamadas)
  const fracaoClaude = custo.teto > 0 ? gastoClaude / custo.teto : 0
  const corClaude =
    fracaoClaude >= 0.9 ? '#F87171' : fracaoClaude >= 0.75 ? '#D9A441' : '#4ADE80'
  const porTipo = (tipo) =>
    dolares(custo.chamadas.filter((c) => c.tipo === tipo))

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
          {/* Dois botões que fazem coisas diferentes com o mesmo número:
              "Zerar" é o começo de um ciclo novo (o plano renovou), "Ajustar"
              é acertar o ciclo corrente com o que o provedor mostra. Confundir
              um com o outro custa a contagem inteira, e por isso o texto de
              baixo explica qual é qual em vez de deixar o rótulo sozinho. */}
          {ajuste === null ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={() => setAjuste(String(gastas))}
                className="bg-[#0E1729] text-[#C8D1E0] hover:bg-[#152039]"
                style={botao}
              >
                Ajustar
              </button>
              <button
                onClick={onZerar}
                className="bg-[#0E1729] text-[#C8D1E0] hover:bg-[#152039]"
                style={botao}
              >
                Zerar contagem
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                type="number"
                min="0"
                max={LIMITE_MENSAL}
                value={ajuste}
                autoFocus
                onChange={(e) => setAjuste(e.target.value)}
                // Enter confirma e Esc desiste: o campo aparece no lugar dos
                // botões, e quem digitou o número não deveria precisar procurar
                // o mouse para gravá-lo.
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirmarAjuste()
                  if (e.key === 'Escape') setAjuste(null)
                }}
                aria-label="Requisições já gastas segundo o provedor"
                className="bg-[#0B1220] text-[#E8ECF4]"
                style={{
                  width: 88,
                  padding: '8px 10px',
                  borderRadius: 9,
                  border: '1px solid rgba(255,255,255,0.12)',
                  fontSize: 13,
                }}
              />
              <button
                onClick={confirmarAjuste}
                className="bg-[#1B3A5F] text-[#DCE7F7] hover:bg-[#234C7C]"
                style={botao}
              >
                Salvar
              </button>
              <button
                onClick={() => setAjuste(null)}
                className="bg-[#0E1729] text-[#C8D1E0] hover:bg-[#152039]"
                style={botao}
              >
                Cancelar
              </button>
            </div>
          )}
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
          {' '}O plano gratuito renova pela data da assinatura, não pelo dia 1º
          — zere a contagem quando ele virar.
          {' '}Esta contagem é <strong style={{ color: '#C8D1E0', fontWeight: 600 }}>deste
          navegador</strong>, mas as 200 são da conta: buscas feitas em outra
          máquina, em outro navegador ou pelo <code>npm run dev</code> gastam da
          mesma cota sem aparecer aqui. Quando o painel da OpenWeb Ninja mostrar
          outro número, é ele que está certo — use "Ajustar" para trazê-lo.
        </div>
      </div>

      {/* As 200 requisições acima têm teto do JSearch — quando acabam, acabam.
          A Claude não tem teto do lado do provedor: ela só para quando o
          cartão para. Por isso este cartão é separado, em dólar (não R$: uma
          conversão exigiria cotação que o app não tem, e o número sairia
          inventado), e o teto que aparece nele é nosso, local, não da API. */}
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
            <span style={{ fontSize: 26, fontWeight: 700, color: corClaude }}>
              US$ {gastoClaude.toFixed(2)}
            </span>
            <span style={{ fontSize: 14, color: '#8A94A6' }}>
              gastos com a Claude neste ciclo
            </span>
          </div>
          <button
            onClick={onZerarCusto}
            className="bg-[#0E1729] text-[#C8D1E0] hover:bg-[#152039]"
            style={botao}
          >
            Zerar custo
          </button>
        </div>

        <div style={{ fontSize: 13, color: '#8A94A6', lineHeight: 1.6, marginBottom: 10 }}>
          Perfil: US$ {porTipo(TIPOS.PERFIL).toFixed(2)} · Ranking: US${' '}
          {porTipo(TIPOS.RANKING).toFixed(2)} · Justificativa: US${' '}
          {porTipo(TIPOS.JUSTIFICATIVA).toFixed(2)}
        </div>

        <div style={{ fontSize: 13, color: '#8A94A6', lineHeight: 1.6 }}>
          Teto:{' '}
          <strong style={{ color: '#E8ECF4', fontWeight: 600 }}>
            US$ {custo.teto.toFixed(2)}
          </strong>
          . Diferente das 200 requisições acima, este teto não é do provedor —
          é nosso, local a este navegador, e bloqueia a chamada antes de ela
          sair. A Claude, do lado dela, aceitaria gastar sem limite.
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
  /**
   * `banco` é o resultado da **busca corrente** — a aba Vagas, e só ela.
   *
   * Já foi a base única das duas abas, e era esse o defeito: `buscar()`
   * substitui esta lista, então a aba Banco de Dados, lendo a mesma coisa,
   * nunca acumulava nada. Buscar em Porto Alegre depois de Caxias do Sul
   * deixava só Porto Alegre nas duas telas.
   *
   * O acervo agora é outro estado, que vem do servidor — ver `acervoRemoto.js`
   * e o `useEffect` logo abaixo. A separação também resolve de graça o
   * `setBanco([])` do caminho de erro: ele esvazia a busca sem encostar no
   * histórico.
   */
  const [banco, setBanco] = useState(BANCO_DE_VAGAS)

  /**
   * O acervo: tudo que a busca já trouxe, de quem quer que tenha buscado.
   *
   * Deixou de ser `localStorage` e passou a ser o SQLite do servidor — ver
   * `docs/superpowers/specs/2026-09-03-acervo-compartilhado-design.md`. A
   * consequência que atravessa esta tela é que ele **não existe no primeiro
   * render**: precisa chegar, e pode não chegar.
   */
  const [acervo, setAcervo] = useState([])

  /** 'carregando' | 'pronto' | 'falhou' — ver `AcervoVazio`. */
  const [acervoEstado, setAcervoEstado] = useState('carregando')
  const [acervoErro, setAcervoErro] = useState('')
  // Muda para forçar uma nova tentativa depois de uma falha.
  const [tentativa, setTentativa] = useState(0)

  useEffect(() => {
    let vivo = true

    async function carregar() {
      setAcervoEstado('carregando')
      try {
        // A migração vem antes da leitura para o acervo local aparecer já na
        // primeira tela, e não só depois de um F5.
        const local = lerParaMigrar()
        if (local.length) {
          await guardarVagasRemoto(local)
        }
        // Marca depois da subida: falhar aqui tem que deixar a migração
        // armada para a próxima vez, não consumi-la em silêncio.
        marcarMigrado()

        const vagas = await lerAcervoRemoto()
        if (!vivo) return
        setAcervo(vagas)
        setAcervoEstado('pronto')
      } catch (err) {
        if (!vivo) return
        // `err.message` é o que vai para a tela — sempre português, por
        // construção do `ErroAcervo`. `err.causa` é o texto cru de quem
        // falhou (o `fetch` do navegador escreve em inglês, sempre), e fica
        // só no console: um diagnóstico para quem desenvolve, nunca para a
        // tela que existe para explicar a falha a quem usa.
        console.warn('[acervo] falha ao carregar:', err.causa || err.message)
        setAcervoErro(err.message)
        setAcervoEstado('falhou')
      }
    }

    carregar()
    return () => {
      vivo = false
    }
  }, [tentativa])

  /**
   * Arquiva o que a busca trouxe e mantém o estado da tela em sincronia.
   *
   * Um ponto só para todos os caminhos que produzem vagas — rede, cache e
   * "Carregar mais" —, porque três chamadas espalhadas seriam três lugares
   * para esquecer de arquivar na próxima mudança.
   *
   * **Falhar aqui não derruba a busca.** As vagas já estão na tela: vieram da
   * API e já custaram cota. Perder o que foi pago por causa do arquivamento
   * seria trocar o problema grande pelo pequeno.
   */
  async function arquivar(vagas) {
    if (!vagas?.length) return
    try {
      setAcervo(await guardarVagasRemoto(vagas))
    } catch (err) {
      console.warn('[acervo] não consegui arquivar:', err.message)
    }
  }

  const [aba, setAba] = useState('vagas')
  // O filtro da aba Banco de Dados. Sem par rascunho/efetivo — ele recorta a
  // cada tecla, porque recortar o acervo não custa requisição nenhuma.
  const [filtroAcervo, setFiltroAcervo] = useState(FILTRO_VAZIO)
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
  // A janela de publicação segue o mesmo par rascunho/efetivo de cargo e
  // cidade. O padrão é 'month' e não 'all': medido contra a API real, era o
  // `all` — que é o que ela assume quando ninguém manda `date_posted` — que
  // trazia metade do resultado sem data de publicação, e era essa metade que
  // vinha com anúncio já encerrado.
  const [janelaRascunho, setJanelaRascunho] = useState(JANELA_PADRAO)
  const [janela, setJanela] = useState(JANELA_PADRAO)
  // Duas janelas, e a distinção é o que economiza cota: `janela` é o recorte
  // que a tela mostra, `janelaBaixada` é o que a API foi perguntada. Apertar
  // de "Último mês" para "Última semana" mexe só na primeira — o resultado da
  // semana já está dentro do que o mês baixou. É também a janela que o
  // "Carregar mais" precisa repetir: o cursor pertence à busca que o gerou, e
  // pedir a próxima página com outro `date_posted` misturaria dois recortes.
  const [janelaBaixada, setJanelaBaixada] = useState(JANELA_PADRAO)
  // A modalidade repete o par rascunho/efetivo, mas o `modalidadeBaixada` tem
  // um papel mais estreito que o da janela: das duas opções só "Remoto" vira
  // parâmetro (`work_from_home=true`); "Presencial" é a ausência dele, e todo
  // o trabalho dela é recorte local. Ver `modalidade.js`.
  //
  // Guardar a baixada ainda assim é o que mantém o "Carregar mais" honesto: o
  // cursor pertence à requisição que o gerou, e pedir a página seguinte com
  // outro `work_from_home` misturaria dois resultados diferentes na mesma
  // lista.
  const [modalidadeRascunho, setModalidadeRascunho] = useState(MODALIDADE_PADRAO)
  const [modalidade, setModalidade] = useState(MODALIDADE_PADRAO)
  const [modalidadeBaixada, setModalidadeBaixada] = useState(MODALIDADE_PADRAO)
  const [consultaFeita, setConsultaFeita] = useState(false)
  const [buscando, setBuscando] = useState(false)
  const [erroBusca, setErroBusca] = useState(null)

  // O ranking roda depois que o banco já tem vagas — cache ou rede — e a
  // tabela espera por ele: vaga e nota chegam juntas à tela (ver `faseVagas`
  // e o cabeçalho de `fase.js`). Antes a lista aparecia primeiro e as notas
  // caíam em cima dela segundos depois, o que lia como defeito.
  //
  // Repare que quem espera é a *tela*, não o dado: o `banco` continua sendo
  // preenchido antes do ranking. É isso que mantém a degradação de graça —
  // ranking que falha, que volta parcial, ou que nem roda por falta de
  // currículo cai no `finally` abaixo, `ranqueando` desliga, e a tabela
  // aparece com o que tiver. Uma lista que já custou uma das 200 requisições
  // da JSearch nunca fica refém de uma chamada à Claude que deu errado.
  //
  // `ranqueando` também tranca uma nova busca enquanto ele está no ar: sem
  // isso, um `setBanco` do ranking anterior poderia chegar depois do banco de
  // uma busca mais nova e sobrescrevê-la.
  /**
   * O ponto de continuação da paginação, ou `null` quando não há próxima
   * página. Só a aba Vagas pagina; a Vaga Inteligente entrega o recorte que a
   * IA escolheu e não tem "carregar mais".
   *
   * Vive no estado e no cache: no estado para o botão saber se aparece, no
   * cache para sobreviver a uma busca repetida (ver `cota.js`).
   */
  const [cursor, setCursor] = useState(null)
  const [carregandoMais, setCarregandoMais] = useState(false)

  const [ranqueando, setRanqueando] = useState(false)
  // Quantas vagas a chamada em curso está avaliando. Existe porque desde que
  // o "Carregar mais" passou a mandar só as novas, `banco.length` deixou de
  // ser essa resposta — e a tela escreveria "Avaliando 20 vagas" para uma
  // chamada de 10.
  const [ranqueandoQuantas, setRanqueandoQuantas] = useState(0)
  const [erroRanking, setErroRanking] = useState(null)

  // A cota vem do localStorage, não do zero: é a única coisa do protótipo que
  // atravessa o recarregamento. Lida na inicialização preguiçosa para não
  // tocar no storage a cada render.
  const [cota, setCota] = useState(lerCota)

  // Mesma ideia para o custo da Claude, mas quem grava é `custo.js`, chamado
  // de dentro de `api/claude.js` a cada resposta — o `App` não registra
  // chamada nenhuma, só relê depois. `custo` é o cartão da aba Controle;
  // relemos no `finally` de cada função que efetivamente chama a Claude
  // (`ranquearBanco`, `ranquearIa`, a justificativa em `PaginaVaga`) e via
  // callback no `PainelIA`, porque o estado é daqui.
  const [custo, setCusto] = useState(() => lerCusto())

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
  // cargo vem do perfil já extraído do currículo (cargo_deduzido), sem
  // chamada extra. buscandoIa cobre a etapa JSearch e ranqueandoIa a etapa
  // Claude — separadas para a lista aparecer antes das notas, como na aba
  // Vagas. Lista própria (vagasIa): repor `banco` aqui vazaria os resultados
  // de uma aba para a outra.
  const [cidadeIa, setCidadeIa] = useState('')
  const [vagasIa, setVagasIa] = useState([])
  const [buscandoIa, setBuscandoIa] = useState(false)
  const [ranqueandoIa, setRanqueandoIa] = useState(false)
  const [buscaIaFeita, setBuscaIaFeita] = useState(false)
  const [erroIa, setErroIa] = useState(null)

  // Lidas de uma vez, com a forma de função: sem ela, `lerCurriculo()`
  // rodaria a cada render, e não só na montagem.
  const [instrucao, setInstrucao] = useState(
    () => lerCurriculo()?.instrucao ?? INSTRUCAO_PADRAO,
  )
  const [cv, setCv] = useState(() => lerCurriculo())
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

  /**
   * Abre o detalhe de uma vaga, venha ela da tabela ou da Vaga Inteligente.
   *
   * O `alterarVaga` marca `seen` no **banco**, e só nele. Uma vaga que exista
   * apenas em `vagasIa` passa por aqui sem ser marcada — de propósito, não por
   * esquecimento: `seen` é o pontinho azul da tabela, e a lista da Vaga
   * Inteligente não tem essa coluna nem esse conceito. Se um dia ela ganhar um
   * indicador de visto, é aqui que falta o `setVagasIa` correspondente; hoje
   * ele seria estado que ninguém lê.
   */
  function abrirVaga(id) {
    alterarVaga(id, (x) => ({ ...x, seen: true }))
    setVagaAberta(id)
    // A página de detalhe entra no lugar da lista, mas a rolagem da janela é a
    // mesma: clicar numa vaga do fim de uma lista de dez abria o detalhe já no
    // meio da descrição, com o cabeçalho — título, Rank IA, Voltar e o link
    // externo — fora da tela. Medido: `scrollY` 619 ao abrir a última vaga.
    // Sem isto, destacar os botões do topo não adianta: eles abrem escondidos.
    window.scrollTo(0, 0)
    window.history.pushState({ vaga: id }, '')
  }

  function fecharVaga() {
    // `back()` desfaz a entrada empurrada em `abrirVaga`; o popstate acima
    // limpa o estado. Chamar setVagaAberta(null) aqui deixaria uma entrada
    // órfã no histórico, e o voltar do navegador não faria nada visível.
    window.history.back()
  }

  // Sem recorte local *por localização*: quem filtrou cidade foi a API, e
  // comparar de novo aqui derrubaria vagas legítimas — a JSearch escreve
  // "Caxias Do Sul" ou devolve municípios vizinhos, e nada disso bate com o
  // rótulo exato do IBGE.
  //
  // Por data há recorte, e só na aba Vagas. Dois motivos: a API aceita o
  // `date_posted` e nem sempre o cumpre (`week` voltou vaga de 26 dias no
  // teste real), e o Banco de Dados é acervo — recortar o histórico por
  // "última semana" esconderia o que ele existe para guardar.
  // As opções dos dropdowns saem do acervo inteiro, não do que está filtrado:
  // montá-las do recorte faria a cidade escolhida ser a única oferecida, e
  // não haveria como trocar de cidade sem antes limpar o filtro.
  const opcoesAcervo = useMemo(() => opcoesDoAcervo(acervo), [acervo])

  const { visiveis: acervoFiltrado } = useMemo(
    () => filtrarAcervo(acervo, filtroAcervo),
    [acervo, filtroAcervo],
  )

  /**
   * De onde a tabela tira as linhas — e é aqui que as duas abas deixam de ser
   * a mesma coisa.
   *
   * A aba Vagas mostra a busca corrente (`banco`); a Banco de Dados mostra o
   * acervo, que atravessa buscas e sessões. Enquanto as duas liam `banco`, a
   * segunda não tinha como acumular: `buscar()` substitui essa lista.
   */
  const listaDaAba = aba === 'banco' ? acervoFiltrado : banco

  const { visiveis: dentroDaJanela, ocultadas: ocultadasPelaJanela } = useMemo(
    () =>
      aba === 'vagas'
        ? filtrarPorJanela(listaDaAba, janela)
        : { visiveis: listaDaAba, ocultadas: 0 },
    [listaDaAba, janela, aba],
  )

  // O segundo recorte local, encadeado no primeiro. Roda mesmo quando a busca
  // pediu `work_from_home=true`, pelo motivo que o `date_posted` já provou:
  // esta API aceita um filtro e nem sempre o cumpre (ver `janela.js`). Sem
  // ele, bastaria uma híbrida classificada como "work from home" na origem
  // para aparecer na tela sob o rótulo "Remoto".
  //
  // Para híbrido e presencial não é reforço, é o filtro inteiro: a API não tem
  // parâmetro nenhum para eles.
  const { visiveis: dentroDoRecorte, ocultadas: ocultadasPelaModalidade } =
    useMemo(
      () =>
        aba === 'vagas'
          ? filtrarPorModalidade(dentroDaJanela, modalidade)
          : { visiveis: dentroDaJanela, ocultadas: 0 },
      [dentroDaJanela, modalidade, aba],
    )

  // A conta que a tela mostra é a soma: quem olha quer saber quantas vagas a
  // busca trouxe e não estão à vista, não por qual dos dois filtros cada uma
  // saiu.
  const ocultadasPeloRecorte = ocultadasPelaJanela + ocultadasPelaModalidade

  /**
   * Os recortes ativos, em texto, para o aviso poder nomeá-los.
   *
   * Os dois entram sempre. Enquanto o dropdown de modalidade tinha um "Todas",
   * havia uma escolha que não recortava nada e citá-la faria a tela dizer que
   * escondeu vagas "fora de Todas"; com duas opções complementares, qualquer
   * uma das duas está de fato escondendo a outra metade.
   */
  const rotulosDoRecorte = useMemo(
    () =>
      [janelaDe(janela)?.rotulo, modalidadeDe(modalidade)?.rotulo].filter(
        Boolean,
      ),
    [janela, modalidade],
  )

  const filtradas = useMemo(
    () => ordenar(dentroDoRecorte, ordem, direcao),
    [dentroDoRecorte, ordem, direcao],
  )

  /**
   * A próxima página que o cache já tem, ou `null` quando só a rede tem mais.
   *
   * Ela existe porque `buscar()` restaura só a primeira página: as seguintes
   * já custaram uma requisição cada e continuam guardadas, então o botão as
   * serve antes de gastar cota de novo.
   *
   * Lê o cache de dentro do `cota` que já está em estado, e não do
   * `localStorage`: `setCota(registrarUso(...))` devolve a cota atualizada,
   * então esta memo reavalia sozinha depois de cada gravação — e a
   * dependência fica honesta em vez de um acesso a storage escondido dentro
   * do render.
   */
  const paginaNoCache = useMemo(() => {
    if (aba !== 'vagas' || !consultaFeita) return null
    const chave = chaveDaConsulta(
      cargo.trim(),
      cidade.trim(),
      janelaBaixada,
      modalidadeBaixada,
    )
    return proximaPagina(chave ? cota.cache?.[chave] : null, banco.length)
  }, [
    aba,
    consultaFeita,
    cargo,
    cidade,
    janelaBaixada,
    modalidadeBaixada,
    banco.length,
    cota,
  ])

  const total = filtradas.length
  const maxPagina = Math.max(1, Math.ceil(total / porPagina))
  const paginaAtual = Math.min(pagina, maxPagina)
  const inicio = (paginaAtual - 1) * porPagina
  const visiveis = filtradas.slice(inicio, inicio + porPagina)

  const ehTabela = aba === 'vagas' || aba === 'banco'

  // As três abas de onde se abre uma vaga. A Vaga Inteligente entrou depois
  // das outras duas, e a distinção importa: `ehTabela` é sobre *renderizar uma
  // tabela*, esta é sobre *poder abrir o detalhe* — a Vaga Inteligente abre o
  // detalhe sem ter tabela nenhuma. Juntar as duas ideias numa constante só
  // faria a Vaga Inteligente herdar o bloco de listagem da tabela.
  const abreDetalhe = ehTabela || aba === 'inteligente'

  // A vaga aberta pode ter sido arquivada enquanto a página estava no ar;
  // buscar pelo id a cada render evita mostrar um registro que já saiu. A
  // busca olha as duas listas — banco e Vaga Inteligente — e a ordem entre
  // elas está explicada em `detalhe.js`.
  const detalhe = acharVaga(vagaAberta, banco, vagasIa, acervo)

  // A Vaga Inteligente não tem dropdown — o cargo dela sai do currículo, não
  // de um formulário — mas sofre do mesmo defeito e recebe o mesmo remédio na
  // janela padrão. Sem isto, o painel poderia destacar como "a melhor vaga"
  // um anúncio sem data de publicação, que é justamente o perfil dos que já
  // saíram do ar. `detalhe` acima olha `vagasIa` inteiro de propósito: uma
  // vaga aberta antes do filtro não pode virar página em branco.
  const vagasIaVisiveis = useMemo(
    () => filtrarPorJanela(vagasIa, JANELA_PADRAO).visiveis,
    [vagasIa],
  )

  // Na aba Vagas nada aparece até se buscar. A aba Banco de Dados mostra o
  // acervo sempre.
  const mostrarResultados = aba === 'banco' || consultaFeita

  /**
   * A espera que substitui a tabela, ou `null` quando é hora de mostrá-la.
   *
   * Escopada à aba Vagas de propósito. Este bloco de render é compartilhado
   * com a aba Banco de Dados (`ehTabela` cobre as duas), e o acervo dela não
   * tem nada a ver com uma busca em curso. Enquanto a espera durava os ~2s da
   * JSearch isso era teórico; agora ela dura o ranking inteiro, e trocar de
   * aba no meio deixaria o Banco de Dados em branco por ~25 segundos.
   */
  const faseVagas =
    aba === 'vagas'
      ? faseDaBusca({ buscando, ranqueando, quantas: ranqueandoQuantas })
      : null

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
    if (buscando || ranqueando) return

    const termo = cargoRascunho.trim()
    const cidadeAlvo = cidadeRascunho.trim()
    const janelaAlvo = janelaRascunho
    const modalidadeAlvo = modalidadeRascunho
    if (!termo && !cidadeAlvo) {
      setErroBusca('Informe ao menos o cargo ou a cidade para buscar.')
      return
    }

    // Mesma consulta, e a janela pedida cabe no que já foi baixado: o
    // recorte é local, sem rede e sem ranking novo — as notas já estão nas
    // vagas que estão na tela. É o que permite apertar o dropdown de "Último
    // mês" para "Última semana" sem gastar uma das 200 requisições do mês.
    //
    // A modalidade entra pelo `soRemotas`, e não por um `cabeNoQueJaTemos`
    // próprio, porque só o booleano muda a requisição: sair de "Todas" para
    // "Híbrido" ou "Presencial" é puro recorte do que já está na tela, e vale
    // o mesmo atalho. Ir para "Remoto" — ou voltar dele — pede rede, porque a
    // API foi perguntada outra coisa e tem remotas a mais para devolver.
    if (
      consultaFeita &&
      banco.length > 0 &&
      termo === cargo.trim() &&
      cidadeAlvo === cidade.trim() &&
      cabeNoQueJaTemos(janelaAlvo, janelaBaixada) &&
      soRemotas(modalidadeAlvo) === soRemotas(modalidadeBaixada)
    ) {
      setCargo(cargoRascunho)
      setCidade(cidadeRascunho)
      setJanela(janelaAlvo)
      setModalidade(modalidadeAlvo)
      setPagina(1)
      setErroBusca(null)
      setErroRanking(null)
      setCota(
        registrarUso(termo, cidadeAlvo, 'cache', {
          janela: janelaBaixada,
          modalidade: modalidadeBaixada,
        }),
      )
      return
    }

    setCargo(cargoRascunho)
    setCidade(cidadeRascunho)
    setJanela(janelaAlvo)
    setModalidade(modalidadeAlvo)
    setErroBusca(null)
    setErroRanking(null)
    setPagina(1)
    // Consulta nova, paginação do zero: o cursor da anterior aponta para
    // dentro de outra busca e pediria a página seguinte da lista errada.
    setCursor(null)

    const guardado = consultarCache(
      termo,
      cidadeAlvo,
      janelaAlvo,
      modalidadeAlvo,
    )
    if (guardado) {
      // **Só a primeira página.** O `carregarMais` grava a lista acumulada
      // sob esta mesma chave — necessário, senão a repetição perderia o que
      // já foi baixado e pago —, e restaurar tudo fazia "Buscar" devolver
      // três páginas de uma vez para quem tinha paginado numa sessão
      // anterior. As seguintes continuam guardadas e saem pelo botão.
      const primeira = proximaPagina(guardado, 0) ?? guardado.vagas
      setJanelaBaixada(janelaAlvo)
      setModalidadeBaixada(modalidadeAlvo)
      setBanco(primeira)
      arquivar(primeira)
      // Sem restaurar o cursor, repetir a busca traria as vagas de volta e o
      // botão de carregar mais sumiria — como se a consulta tivesse acabado.
      setCursor(guardado.cursor ?? null)
      setCota(
        registrarUso(termo, cidadeAlvo, 'cache', {
          janela: janelaAlvo,
          modalidade: modalidadeAlvo,
        }),
      )
      setConsultaFeita(true)
      await ranquearPendentes(primeira)
      return
    }

    setBuscando(true)
    let vagasEncontradas = null
    try {
      const resposta = await buscarVagas(
        montarConsulta(termo, cidadeAlvo),
        null,
        janelaAlvo,
        modalidadeAlvo,
      )
      const vagas = mapearVagas(vagasDaResposta(resposta))
      const proximo = cursorDaResposta(resposta)
      setJanelaBaixada(janelaAlvo)
      setModalidadeBaixada(modalidadeAlvo)
      setBanco(vagas)
      arquivar(vagas)
      setCursor(proximo)
      setCota(
        registrarUso(termo, cidadeAlvo, 'rede', {
          vagas,
          cursor: proximo,
          janela: janelaAlvo,
          modalidade: modalidadeAlvo,
          // A busca é sempre uma página. É esta fronteira que o "Buscar" de
          // amanhã usa para não devolver a lista acumulada inteira.
          paginas: vagas.length ? [vagas.length] : null,
        }),
      )
      setConsultaFeita(true)
      vagasEncontradas = vagas
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
        setCota(
          registrarUso(termo, cidadeAlvo, 'rede', {
            janela: janelaAlvo,
            modalidade: modalidadeAlvo,
          }),
        )
      }
    } finally {
      setBuscando(false)
    }

    // A lista já está na tela neste ponto — buscando virou false acima. O
    // ranking, se rodar, só repõe o banco quando terminar.
    if (vagasEncontradas) {
      await ranquearBanco(vagasEncontradas)
    }
  }

  /**
   * Traz a próxima página da JSearch e a **acrescenta** à lista, sem trocar o
   * que já está na tela. O cursor do `search-v2` só anda para frente: não há
   * "página anterior" a pedir, e é por isso que a tela acumula em vez de
   * paginar contra a API.
   *
   * Custa 1 das 200 requisições do mês e 1 chamada à Claude — e essa chamada
   * reranqueia a lista **inteira**, não só as vagas novas. É deliberado, e foi
   * medido: as mesmas 10 vagas num lote só e partidas em dois de 5 deram
   * diferença média de 9,1 pontos, máxima de 14, e o primeiro lugar trocou.
   * Como a tabela ordena por Rank IA, notas de lotes diferentes na mesma
   * coluna ordenam errado. Reranquear junto custa quase o mesmo, porque
   * continua sendo uma chamada só enquanto a lista couber em TAMANHO_LOTE.
   */
  async function carregarMais() {
    if (buscando || ranqueando || carregandoMais) return

    const termo = cargo.trim()
    const cidadeAlvo = cidade.trim()

    setErroBusca(null)
    setErroRanking(null)

    // Página que já foi baixada e paga numa sessão anterior: sai do cache,
    // sem tocar a rede. Só as que ainda não têm nota vão para a Claude — uma
    // página que volta já pontuada não custa nada.
    if (paginaNoCache) {
      const doCache = paginaNoCache
      setBanco((atual) => [...atual, ...doCache])
      arquivar(doCache)
      setCota(
        registrarUso(termo, cidadeAlvo, 'cache', {
          janela: janelaBaixada,
          modalidade: modalidadeBaixada,
        }),
      )
      await ranquearPendentes(doCache, banco)
      return
    }

    // `cursor` nulo é a última página. O botão nem aparece nesse caso; a
    // guarda existe para o clique que escapa entre o estado e o render.
    if (!cursor) return

    setCarregandoMais(true)

    let listaCompleta = null
    let apenasNovas = []
    try {
      // `janelaBaixada`, não `janela`: o cursor pertence à busca que o
      // gerou. Se a tela apertou para "Última semana" depois de baixar o
      // mês, a próxima página ainda é a página seguinte *do mês* — e o corte
      // para semana acontece na tela, como no resto da lista.
      const resposta = await buscarVagas(
        montarConsulta(termo, cidadeAlvo),
        cursor,
        janelaBaixada,
        modalidadeBaixada,
      )
      const novas = mapearVagas(vagasDaResposta(resposta))
      const proximo = cursorDaResposta(resposta)

      // Mescla por id: a mesma vaga pode voltar em duas páginas, e duas
      // linhas idênticas na tabela seriam pior que uma vaga a menos.
      const jaTem = new Set(banco.map((v) => v.id))
      apenasNovas = novas.filter((v) => !jaTem.has(v.id))
      listaCompleta = [...banco, ...apenasNovas]

      setBanco(listaCompleta)
      arquivar(apenasNovas)
      setCursor(proximo)
      // A fronteira da página nova entra na lista de fronteiras. Página que
      // só trouxe repetidas não vira fronteira: um tamanho zero não é página,
      // e faria `proximaPagina` servir uma fatia vazia para sempre.
      const entradaAtual = consultarCache(
        termo,
        cidadeAlvo,
        janelaBaixada,
        modalidadeBaixada,
      )
      const paginasAtuais = paginasDoCache(entradaAtual)
      setCota(
        registrarUso(termo, cidadeAlvo, 'rede', {
          vagas: listaCompleta,
          cursor: proximo,
          janela: janelaBaixada,
          modalidade: modalidadeBaixada,
          paginas: apenasNovas.length
            ? [...paginasAtuais, apenasNovas.length]
            : paginasAtuais,
        }),
      )
    } catch (err) {
      const erro =
        err instanceof ErroJSearch
          ? err
          : new ErroJSearch(`Erro inesperado: ${err.message}`)
      setErroBusca(erro.message)
      // A lista que já estava na tela fica: ela custou requisições anteriores,
      // e o erro é da página nova, não dela.
      if (erro.tocouApi) {
        setCota(
          registrarUso(termo, cidadeAlvo, 'rede', {
            janela: janelaBaixada,
            modalidade: modalidadeBaixada,
          }),
        )
      }
    } finally {
      setCarregandoMais(false)
    }

    // Só as vagas novas vão para a Claude; as já pontuadas viajam como
    // âncora de escala (`{cargo, nota}`, sem descrição). Antes a lista
    // inteira era reenviada a cada clique: medido no log de custo real, a
    // segunda chamada custou 41% mais que a primeira, e numa sessão de três
    // cliques 60% do conteúdo de vaga era repetição.
    //
    // Página só com repetidas não chama a Claude: `ranquearBanco` recusa
    // lista vazia, e não há nota nova a pedir.
    if (apenasNovas.length) {
      await ranquearBanco(apenasNovas, banco)
    }
  }

  /**
   * Aplica as notas do ranking por id, escrevendo só o que ele produz —
   * nunca troca a lista inteira. O ranking leva alguns segundos; nesse
   * intervalo o aluno pode favoritar, arquivar ou marcar como vista, e
   * `ranqueadas` é a foto da lista de *antes* dessa janela. Repor a lista
   * inteira com ela apagaria essas ações em silêncio — a estrela se
   * desmarcaria sozinha, sem erro, sem explicação. Por isso quem chama usa a
   * forma funcional do respectivo setState: ela lê o estado no momento em
   * que aplica, não o que foi capturado quando o ranking começou, então uma
   * vaga arquivada nesse meio-tempo continua fora — iterar sobre
   * `ranqueadas` a traria de volta por engano.
   *
   * Compartilhada entre a aba Vagas (`ranquearBanco`) e a Vaga Inteligente
   * (`ranquearIa`): a regra é a mesma, só muda qual lista está sendo
   * mesclada.
   */
  function mesclarRank(atual, ranqueadas) {
    return atual.map((v) => {
      const r = ranqueadas.find((x) => x.id === v.id)
      return r ? { ...v, rank: r.rank, rankMotivo: r.rankMotivo } : v
    })
  }

  /**
   * Pontua as vagas com a Claude e repõe o banco, se houver currículo. Sem
   * ele não faz nada — o ranking é enriquecimento da aba Vagas, não
   * pré-requisito; quem quer currículo obrigatório usa a Vaga Inteligente.
   *
   * Erro aqui não derruba a busca: `banco` fica com as vagas que o JSearch já
   * devolveu, que custaram uma das 200 requisições mensais, e um aviso aparece
   * acima da tabela sem tirá-las da tela.
   */
  /**
   * Ranqueia só as vagas que ainda não têm nota, ancoradas nas que têm.
   *
   * Serve a página que volta do cache: ela pode chegar já pontuada de uma
   * sessão anterior, e nesse caso não há o que perguntar à Claude. Antes o
   * caminho do cache reranqueava tudo — uma busca "de graça" em cota custava
   * ~US$ 0,06 de Claude.
   */
  async function ranquearPendentes(lista, ancora = []) {
    const semNota = lista.filter((v) => v.rank == null)
    if (!semNota.length) return
    await ranquearBanco(semNota, [...ancora, ...lista.filter((v) => v.rank != null)])
  }

  async function ranquearBanco(vagas, jaAvaliadas = []) {
    const perfil = perfilEfetivo(cv)
    if (!perfil || vagas.length === 0) return

    // Quantas estão de fato indo para a Claude — não `banco.length`. No
    // "Carregar mais" as duas divergem: o banco já tem 20 e só 10 viajam.
    setRanqueandoQuantas(vagas.length)
    setRanqueando(true)
    try {
      const ranqueadas = await ranquear(perfil, instrucao, vagas, jaAvaliadas)
      // `mesclarRank` mapeia sobre a lista atual e só substitui quem voltou:
      // as vagas antigas mantêm a nota que já custou uma chamada.
      setBanco((atual) => mesclarRank(atual, ranqueadas))
      // A nota vai para o acervo junto: ela custou uma chamada à Claude, e
      // sem isto uma vaga arquivada perderia o rank ao trocar de aba.
      await arquivar(ranqueadas)
    } catch (err) {
      setErroRanking(mensagemDoErro(err))
    } finally {
      setRanqueando(false)
      // A chamada à Claude do `buscar()` inteiro é esta — relê aqui, não em
      // `buscar()`, porque é aqui que `ranquear` de fato roda.
      setCusto(lerCusto())
    }
  }

  /**
   * Mesma lógica de `ranquearBanco`, para a lista própria da Vaga
   * Inteligente (`vagasIa`) — repor `banco` aqui vazaria os resultados de
   * uma aba para a outra, então o estado de erro e de "carregando" também
   * são próprios (`erroIa`, `ranqueandoIa`).
   */
  async function ranquearIa(vagas) {
    const perfil = perfilEfetivo(cv)
    if (!perfil || vagas.length === 0) return

    setRanqueandoIa(true)
    try {
      const ranqueadas = await ranquear(perfil, instrucao, vagas)
      setVagasIa((atual) => mesclarRank(atual, ranqueadas))
    } catch (err) {
      setErroIa(mensagemDoErro(err))
    } finally {
      setRanqueandoIa(false)
      // Mesmo raciocínio de `ranquearBanco`: a chamada à Claude de
      // `buscarInteligente()` acontece aqui dentro.
      setCusto(lerCusto())
    }
  }

  const consultaPendente =
    cargoRascunho !== cargo ||
    cidadeRascunho !== cidade ||
    janelaRascunho !== janela ||
    modalidadeRascunho !== modalidade

  /**
   * Busca inteligente de verdade: o cargo não é digitado, sai do perfil que
   * a Claude já deduziu no upload (`perfilEfetivo(cv).cargo_deduzido`) — é a
   * diferença para a aba Vagas, onde o aluno escreve o cargo. Mesma ordem de
   * `buscar()`: cache primeiro (não gasta das 200 requisições/mês), JSearch
   * só se faltar, e o ranking entra depois, com a lista já na tela.
   *
   * `cargo_deduzido` pode vir `null` do schema (a Claude não teve o que
   * deduzir); `?? ''` evita que a falta dele quebre o `.trim()` de
   * `registrarUso`/`montarConsulta` — a busca cai para "só cidade", como já
   * acontece na aba Vagas quando falta um dos dois campos.
   */
  async function buscarInteligente() {
    if (buscandoIa || ranqueandoIa) return

    const perfil = perfilEfetivo(cv)
    if (!perfil) {
      setErroIa('Envie um currículo antes de buscar — é dele que sai o cargo.')
      return
    }

    const termo = perfil.cargo_deduzido ?? ''
    const cidadeAlvo = cidadeIa.trim()

    // Sem os dois, a consulta sai vazia: `montarConsulta('', '')` devolve
    // '', a JSearch responde 400, e um 400 tem `tocouApi: true` — debita uma
    // das 200 requisições do mês por um pedido que já dava para saber, antes
    // de sair, que não tinha o que buscar. A aba Vagas recusa consulta vazia
    // (`buscar()`, acima), mas a mensagem de lá fala em "cargo", campo que
    // não existe aqui — o cargo vem do currículo, não de um input; por isso
    // a mensagem própria, apontando o que de fato falta.
    if (!termo.trim() && !cidadeAlvo) {
      setErroIa(
        'A extração não deduziu um cargo do currículo, e nenhuma cidade foi informada — preencha a cidade para buscar.',
      )
      return
    }

    setErroIa(null)
    setBuscaIaFeita(false)

    const guardado = consultarCache(termo, cidadeAlvo, JANELA_PADRAO)
    if (guardado) {
      setVagasIa(guardado.vagas)
      setCota(
        registrarUso(termo, cidadeAlvo, 'cache', { janela: JANELA_PADRAO }),
      )
      setBuscaIaFeita(true)
      await ranquearIa(guardado.vagas)
      return
    }

    setBuscandoIa(true)
    let vagasEncontradas = null
    try {
      const resposta = await buscarVagas(
        montarConsulta(termo, cidadeAlvo),
        null,
        JANELA_PADRAO,
      )
      const vagas = mapearVagas(vagasDaResposta(resposta))
      setVagasIa(vagas)
      // Grava o cursor mesmo sem paginar aqui: as duas abas dividem a chave
      // de cache quando a aba Vagas está na janela padrão, e uma entrada
      // gravada sem ele faria o "Carregar mais" de lá sumir depois de uma
      // busca inteligente.
      setCota(
        registrarUso(termo, cidadeAlvo, 'rede', {
          vagas,
          cursor: cursorDaResposta(resposta),
          janela: JANELA_PADRAO,
        }),
      )
      setBuscaIaFeita(true)
      vagasEncontradas = vagas
    } catch (err) {
      const erro =
        err instanceof ErroJSearch
          ? err
          : new ErroJSearch(`Erro inesperado: ${err.message}`)
      setErroIa(erro.message)
      setVagasIa([])
      setBuscaIaFeita(true)
      // Mesmo raciocínio de `buscar()`: um erro que chegou à API consumiu
      // uma das 200 mesmo sem devolver vaga.
      if (erro.tocouApi) {
        setCota(
          registrarUso(termo, cidadeAlvo, 'rede', { janela: JANELA_PADRAO }),
        )
      }
    } finally {
      setBuscandoIa(false)
    }

    // A lista já está na tela neste ponto — buscandoIa virou false acima. O
    // ranking, se rodar, só repõe vagasIa quando terminar.
    if (vagasEncontradas) {
      await ranquearIa(vagasEncontradas)
    }
  }

  function irParaAba(nova) {
    // Trocar de aba fecha a página de detalhe. Sem isto ela sobrevive à troca
    // e aparece sob o cabeçalho de outra aba — uma vaga da Vaga Inteligente
    // debaixo de "Histórico completo de vagas coletadas", onde ela não está.
    //
    // Já era assim entre Vagas e Banco de Dados, onde passava despercebido
    // porque as duas mostram o mesmo `banco`; quando o detalhe passou a abrir
    // também da Vaga Inteligente, cuja lista é separada, virou visível.
    //
    // `fecharVaga()` e não `setVagaAberta(null)`: abrir empurrou uma entrada
    // no histórico, e limpar só o estado a deixaria órfã — o voltar do
    // navegador não faria nada visível. Condicionado a `vagaAberta` porque
    // sem detalhe aberto não há entrada para desfazer, e o `back()` sairia
    // do app.
    if (vagaAberta) fecharVaga()
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

  /**
   * Mexer no filtro volta para a primeira página.
   *
   * Sem isto, estreitar o filtro estando na página 3 mostra uma tabela vazia
   * com a paginação dizendo que há resultados — o `Math.min` do `paginaAtual`
   * corrige o índice no render seguinte, mas o quadro intermediário lê como
   * defeito.
   */
  function mudarFiltroAcervo(novo) {
    setFiltroAcervo(novo)
    setPagina(1)
  }

  function ordenarPor(chave) {
    setDirecao((d) => (ordem === chave ? (d === 'asc' ? 'desc' : 'asc') : 'desc'))
    setOrdem(chave)
    setPagina(1)
  }

  /**
   * Escrita passante: marcar como lida vale nas duas listas.
   *
   * A mesma vaga pode estar na busca corrente e no acervo ao mesmo tempo.
   * Gravar só numa faria a outra aba mostrar bandeirinha velha — e como o
   * acervo é o que persiste, seria a marca que some no recarregamento.
   *
   * Hoje o único chamador é o `seen` de `abrirVaga`; "Favoritar" era o outro,
   * e saiu do menu. A função continua genérica porque a passagem pelas duas
   * listas é a parte que custa acertar, não o `fn`.
   */
  async function alterarVaga(id, fn) {
    setMenu(null)
    setBanco((lista) => lista.map((x) => (x.id === id ? fn(x) : x)))
    // Otimista: a marca aparece na hora e o servidor confirma depois. Esperar
    // a rede para pintar uma bandeirinha faria o clique parecer engasgado.
    setAcervo((lista) => lista.map((x) => (x.id === id ? fn(x) : x)))

    const alvo = acervo.find((x) => x.id === id)
    if (!alvo) return
    const depois = fn(alvo)
    try {
      await atualizarVagaRemota(id, {
        fav: depois.fav,
        seen: depois.seen,
        rank: depois.rank,
      })
    } catch (err) {
      console.warn('[acervo] não consegui gravar a marca:', err.message)
    }
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
    // Vaga cadastrada à mão não pertence a consulta nenhuma, então o cache
    // não tem onde guardá-la: o acervo é o único lugar em que ela sobrevive.
    arquivar([nova])
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
        {abreDetalhe && detalhe && (
          <PaginaVaga
            vaga={detalhe}
            onVoltar={fecharVaga}
            cv={cv}
            instrucao={instrucao}
            onCusto={() => setCusto(lerCusto())}
            // Cada aba tem o seu estado de ranking, e a página aberta a
            // partir da Vaga Inteligente tem que olhar o dela — passar só
            // `ranqueando` faria o rótulo do Rank IA ler o estado da aba
            // errada.
            ranqueando={aba === 'inteligente' ? ranqueandoIa : ranqueando}
          />
        )}

        {ehTabela && !detalhe && (
          <div>
            {aba === 'banco' && (
              <FiltroDoAcervo
                filtro={filtroAcervo}
                opcoes={opcoesAcervo}
                onFiltro={mudarFiltroAcervo}
                total={acervo.length}
                mostrando={acervoFiltrado.length}
              />
            )}

            {aba === 'vagas' && (
              <ConsultaDestaque
                cargo={cargoRascunho}
                cidade={cidadeRascunho}
                janela={janelaRascunho}
                modalidade={modalidadeRascunho}
                onCargo={(e) => setCargoRascunho(e.target.value)}
                // O combobox entrega o rótulo já escolhido da lista, não um
                // evento: não há texto digitado virando valor.
                onCidade={setCidadeRascunho}
                onJanela={setJanelaRascunho}
                onModalidade={setModalidadeRascunho}
                onBuscar={buscar}
                pendente={consultaPendente}
                buscando={buscando}
                ranqueando={ranqueando}
              />
            )}

            {aba === 'vagas' && erroBusca && <AvisoErro texto={erroBusca} />}
            {aba === 'vagas' && erroRanking && <AvisoErro texto={erroRanking} />}

            {faseVagas ? (
              <div
                style={{
                  border: '1px solid rgba(255,255,255,0.06)',
                  background: '#0B1220',
                  borderRadius: 12,
                }}
              >
                <Carregando
                  texto={faseVagas.texto}
                  detalhe={faseVagas.detalhe}
                />
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
                    {/* A conta tem que fechar: sem isto, uma busca que trouxe
                        dez vagas e mostrou três pareceria a API devolvendo
                        menos do que devolveu. */}
                    {ocultadasPeloRecorte > 0 && (
                      <>
                        {' · '}
                        {ocultadasPeloRecorte}{' '}
                        {ocultadasPeloRecorte === 1 ? 'oculta' : 'ocultas'} fora
                        de {rotulosDoRecorte.map((r) => `“${r}”`).join(' e ')}
                      </>
                    )}
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
                          // Chega por três caminhos: o clique na linha inteira,
                          // o item "Ver detalhes" do menu, e o título — os
                          // dois primeiros com evento, o título sem, porque
                          // ele já parou a propagação por conta própria. Daí o
                          // `?.`: sem ele o caminho do título lançaria.
                          onAbrir={(e) => {
                            e?.stopPropagation()
                            abrirVaga(vaga.id)
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
  
                  {/* Cada aba explica o próprio vazio. O do acervo agora pode,
                      sim, ser culpa de uma requisição — o estado `falhou` diz
                      isso, em vez da mensagem de vazio que mandaria "fazer
                      uma busca" para um problema de rede. */}
                  {total === 0 &&
                    (aba === 'banco' ? (
                      <AcervoVazio
                        filtrando={acervo.length > 0}
                        onLimpar={() => mudarFiltroAcervo(FILTRO_VAZIO)}
                        estado={acervoEstado}
                        erro={acervoErro}
                        onTentarDeNovo={() => setTentativa((n) => n + 1)}
                      />
                    ) : (
                      <SemResultados
                        cidade={cidade}
                        ocultadas={aba === 'vagas' ? ocultadasPeloRecorte : 0}
                        rotulos={rotulosDoRecorte}
                      />
                    ))}
  
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

                {/* Só na aba Vagas, e só enquanto houver próxima página. Sem
                    cursor o botão desaparece em vez de ficar clicável e
                    inerte: "acabaram as vagas" é informação, botão morto não.
                    O custo vai escrito no próprio botão — ele gasta a cota
                    escassa, e nenhum clique aqui deve ser surpresa. */}
                {aba === 'vagas' && (cursor || paginaNoCache) && (
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: 7,
                      marginTop: 18,
                    }}
                  >
                    <button
                      onClick={carregarMais}
                      disabled={carregandoMais || ranqueando || buscando}
                      className={
                        carregandoMais || ranqueando || buscando
                          ? 'bg-[#1A2438] text-[#7C8699]'
                          : 'bg-white/[0.05] text-[#D3DAE6] hover:bg-white/[0.09] hover:text-[#E8ECF4]'
                      }
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 9,
                        padding: '11px 20px',
                        borderRadius: 10,
                        border: '1px solid rgba(255,255,255,0.1)',
                        fontSize: 13.5,
                        fontWeight: 600,
                        cursor:
                          carregandoMais || ranqueando || buscando
                            ? 'default'
                            : 'pointer',
                      }}
                    >
                      {carregandoMais
                        ? 'Buscando mais vagas...'
                        : ranqueando
                          ? 'Avaliando com a IA...'
                          : 'Carregar mais vagas'}
                    </button>
                    <div style={{ fontSize: 12, color: '#7C8699' }}>
                      {paginaNoCache
                        ? 'Esta página já foi baixada antes: sai do cache, sem consumir requisição.'
                        : 'Consome 1 das 200 requisições do mês e avalia com a IA só as vagas novas (~US$ 0,03).'}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {aba === 'ia' && (
          <PainelIA
            cv={cv}
            onCv={setCv}
            arrastando={arrastando}
            onArrastarSobre={(e) => {
              e.preventDefault()
              if (!arrastando) setArrastando(true)
            }}
            onArrastarSair={() => setArrastando(false)}
            onRemoverCv={() => setCv(null)}
            instrucao={instrucao}
            onInstrucao={(e) => {
              // `definirInstrucao` só grava se já houver currículo em
              // `vagas:cv` (ver curriculo.js) — editar a instrução antes de
              // enviar um currículo não persiste. Aceitável: a instrução só
              // importa quando há currículo para ranquear com ela.
              setInstrucao(e.target.value)
              definirInstrucao(e.target.value)
            }}
            onRestaurar={() => {
              setInstrucao(INSTRUCAO_PADRAO)
              definirInstrucao(INSTRUCAO_PADRAO)
            }}
            onCusto={() => setCusto(lerCusto())}
          />
        )}

        {/* `!detalhe` pelo mesmo motivo da tabela acima: a página de detalhe
            é uma tela, não um painel dentro da listagem. Sem isto o painel
            inteiro — currículo, cidade, botão de busca — ficaria empilhado
            embaixo do detalhe da vaga. */}
        {aba === 'inteligente' && !detalhe && (
          <PainelVagaInteligente
            cv={cv}
            cidade={cidadeIa}
            onCidade={(valor) => {
              setCidadeIa(valor)
              setBuscaIaFeita(false)
            }}
            buscando={buscandoIa}
            ranqueando={ranqueandoIa}
            buscaFeita={buscaIaFeita}
            vagas={vagasIaVisiveis}
            erro={erroIa}
            onBuscar={buscarInteligente}
            onAbrirVaga={abrirVaga}
            onIrParaCurriculo={() => irParaAba('ia')}
          />
        )}

        {aba === 'controle' && (
          <PainelControle
            cota={cota}
            onZerar={() => setCota(zerarContagem())}
            onAjustar={(gastas) => setCota(ajustarContagem(gastas))}
            onLimparCache={() => setCota(limparCache())}
            custo={custo}
            onZerarCusto={() => setCusto(zerarCusto())}
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
