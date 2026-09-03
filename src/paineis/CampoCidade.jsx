import { useEffect, useMemo, useRef, useState } from 'react'
import { CIDADES } from '../data/cidades'

/** "São Paulo, SP" -> "sao paulo, sp", para casar com o que se digita. */
function semAcento(texto) {
  return texto
    .normalize('NFD')
    // Faixa dos sinais diacríticos combinantes, escapada de propósito: os
    // caracteres em si são invisíveis num editor.
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Prepara os rótulos para busca.
 *
 * `sem` é o rótulo sem acento e em minúsculas. Sem isso, digitar "sao paulo"
 * não acharia "São Paulo" — e como quase ninguém digita acento, o campo
 * pareceria quebrado logo no caso mais óbvio.
 */
function indexar(entradas) {
  return entradas.map((entrada) => {
    // Aceita `"Caxias do Sul, RS"` e `{ rotulo, nota }`. A forma simples é a do
    // IBGE, que não tem o que anotar; a outra é de quem quer mostrar um número
    // ao lado, como a contagem de vagas do acervo.
    const rotulo = typeof entrada === 'string' ? entrada : entrada.rotulo
    const nota = typeof entrada === 'string' ? null : (entrada.nota ?? null)
    return {
      rotulo,
      nota,
      // Só o rótulo é indexado. A nota fica de fora de propósito: digitar "8"
      // não pode trazer as cidades que têm 8 vagas — o campo é de cidade.
      sem: semAcento(rotulo),
      // O nome sem a UF, para reconhecer quem digitou a cidade inteira. Nem
      // todo rótulo tem vírgula — `lastIndexOf` devolve -1 e o `slice` daria a
      // string ao contrário —, então sem vírgula o nome é o rótulo inteiro.
      nomeSem: semAcento(
        rotulo.includes(', ')
          ? rotulo.slice(0, rotulo.lastIndexOf(', '))
          : rotulo,
      ),
    }
  })
}

/**
 * O índice do IBGE, montado uma vez no carregamento do módulo.
 *
 * Fora do componente de propósito: são 5.571 municípios varridos a cada tecla,
 * e reindexá-los a cada render seria pagar o custo à toa. Uma lista injetada é
 * indexada sob demanda — quem injeta passa dezenas de itens, não milhares.
 */
const IBGE_INDEXADO = indexar(CIDADES)

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
 *
 * `cidades` troca a lista oferecida. Omitida, são os 5.571 municípios do IBGE:
 * é o que a aba Vagas precisa, porque a API exige o rótulo exato e a busca
 * pode ir a qualquer lugar do país.
 *
 * A aba Banco de Dados passa a lista do próprio acervo, e a diferença não é
 * de conveniência: os rótulos gravados vêm do `job_city` + `job_state` da API,
 * que ora manda a sigla, ora o nome por extenso. Convivem lá dentro "Caxias do
 * Sul, RS" e "Porto Alegre, Rio Grande do Sul" — oferecer o "Porto Alegre, RS"
 * do IBGE devolveria zero vaga, sem dizer por quê.
 *
 * Cada item pode ser uma string ou `{ rotulo, nota }`. A `nota` aparece entre
 * parênteses ao lado da sugestão — o acervo a usa para a contagem de vagas,
 * que é o que faz escolher entre "Goiânia, Goiás (8)" e "Aparecida de Goiânia,
 * Goiás (1)". Ela é enfeite de exibição: não entra na busca e não sai no
 * `onEscolher`, que devolve o rótulo puro para casar com o dado.
 */
export default function CampoCidade({ valor, onEscolher, cidades }) {
  const [texto, setTexto] = useState('')
  const [aberto, setAberto] = useState(false)
  const [destaque, setDestaque] = useState(0)
  const listaRef = useRef(null)

  const termo = semAcento(texto.trim())

  const indexadas = useMemo(
    () => (cidades ? indexar(cidades) : IBGE_INDEXADO),
    [cidades],
  )

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
        lista: indexadas.slice(0, TETO_SUGESTOES),
        total: indexadas.length,
      }
    }
    const exatas = []
    const comeca = []
    const contem = []
    for (const c of indexadas) {
      if (c.nomeSem === termo) exatas.push(c)
      else if (c.sem.startsWith(termo)) comeca.push(c)
      else if (c.sem.includes(termo)) contem.push(c)
    }
    const todas = [...exatas, ...comeca, ...contem]
    return { lista: todas.slice(0, TETO_SUGESTOES), total: todas.length }
  }, [termo, indexadas])

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
                  {c.nota != null && (
                    <span style={{ color: '#6E7789', marginLeft: 6 }}>
                      ({c.nota})
                    </span>
                  )}
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
