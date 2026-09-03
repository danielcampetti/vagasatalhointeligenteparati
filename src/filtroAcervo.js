/**
 * O recorte da aba Banco de Dados.
 *
 * Parece o da aba Vagas e difere dele em duas coisas — as duas pelo mesmo
 * motivo: **aqui não há requisição**.
 *
 * ## Sem botão "Buscar"
 *
 * A barra da aba Vagas adia: digitar altera só o rascunho, e a tabela muda no
 * clique. Isso existe porque cada busca custa uma das 200 requisições do mês, e
 * um filtro que dispara a cada tecla queimaria a cota inteira. Filtrar o
 * acervo não custa nada, então o adiamento não protegeria de coisa alguma —
 * copiar o botão para cá seria copiar a forma jogando fora o motivo dela.
 *
 * ## Os dropdowns saem do acervo, não de uma lista fixa
 *
 * A cidade da aba Vagas é a lista do IBGE porque a API precisa do rótulo
 * exato. Aqui seria o contrário do útil: das ~5570 cidades, 7 têm vaga, e as
 * outras 5563 seriam caminhos para uma tabela vazia.
 *
 * Pior que isso — os rótulos nem casariam. O acervo guarda o que o `mapear.js`
 * montou de `job_city` + `job_state`, e a API varia: convivem lá dentro
 * "Caxias do Sul, RS" e "Porto Alegre, Rio Grande do Sul". Escolher "Porto
 * Alegre, RS" no IBGE não acharia nada, e não diria por quê. Oferecer o que
 * está guardado é a única forma que não erra calada.
 *
 * O mesmo vale para a modalidade, e por isso ela não vem do `modalidade.js`:
 * aquele módulo tem duas opções porque a API responde um booleano. O acervo
 * pode conter "Híbrido" — o `mapear.js` produz esse valor — e o dropdown de
 * busca não o oferece. Aqui não há API para agradar, então o que manda é o
 * que está guardado.
 */

import { filtrarPorJanela } from './janela'

/**
 * Tudo em branco mostra tudo. A janela vazia — e não `JANELA_PADRAO` — é
 * deliberada: um acervo existe para guardar o histórico, e estreá-lo
 * escondendo o que tem mais de 30 dias esconderia justamente o que ele guarda.
 */
export const FILTRO_VAZIO = { texto: '', cidade: '', modalidade: '', janela: '' }

/**
 * Minúsculas e sem acento, para comparar.
 *
 * Não é refinamento: o acervo tem "Tecnico de TI" e "Técnico Em TI" lado a
 * lado, gravados por duas buscas diferentes. Um filtro que casasse acento
 * acharia metade das vagas e não daria nenhuma pista do motivo.
 *
 * `normalize('NFD')` separa a letra do acento, e a faixa U+0300-U+036F é a
 * dos acentos já soltos, que somem no replace. Escrita com escapes de
 * propósito: são caracteres combinantes, e literais aqui grudariam no
 * colchete anterior em qualquer editor.
 */
function chave(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

/**
 * Separa o que casa com o filtro do que não casa.
 *
 * Devolve a contagem do que saiu junto com o que ficou, como o
 * `filtrarPorJanela` e o `filtrarPorModalidade`: uma tabela que tinha 35 linhas
 * e mostra 2 sem explicar parece quebrada.
 *
 * Os campos se somam — cada um estreita o resultado do anterior. Um filtro em
 * branco não participa, que é o que faz `FILTRO_VAZIO` devolver tudo.
 */
export function filtrarAcervo(vagas, filtro = FILTRO_VAZIO) {
  const lista = Array.isArray(vagas) ? vagas : []
  const { texto = '', cidade = '', modalidade = '', janela = '' } = filtro ?? {}

  const busca = chave(texto.trim())

  let visiveis = lista

  if (busca) {
    // Cargo **e** empresa: quem procura no histórico às vezes lembra de quem
    // publicou e não do título — é a diferença de já ter visto a vaga uma vez.
    visiveis = visiveis.filter(
      (v) => chave(v.cargo).includes(busca) || chave(v.empresa).includes(busca),
    )
  }

  if (cidade) visiveis = visiveis.filter((v) => v.cidade === cidade)
  if (modalidade) visiveis = visiveis.filter((v) => v.modalidade === modalidade)

  // Reusa o recorte da aba Vagas em vez de reimplementá-lo: é a mesma regra,
  // inclusive a de que vaga sem data só passa em 'Qualquer data'.
  if (janela) visiveis = filtrarPorJanela(visiveis, janela).visiveis

  return { visiveis, ocultadas: lista.length - visiveis.length }
}

/**
 * Conta quantas vagas há por valor de `campo`, da mais numerosa para a menos.
 *
 * Valor ausente não vira opção: o `mapear.js` devolve `null` quando a resposta
 * não traz o campo, e um dropdown com uma linha vazia no meio não ajuda
 * ninguém a escolher.
 */
function contar(vagas, campo) {
  const conta = new Map()
  for (const v of vagas) {
    const valor = v?.[campo]
    if (!valor) continue
    conta.set(valor, (conta.get(valor) ?? 0) + 1)
  }
  return [...conta.entries()]
    .map(([valor, quantas]) => ({ valor, quantas }))
    .sort((a, b) => b.quantas - a.quantas)
}

/**
 * As opções dos dropdowns, montadas a partir do próprio acervo.
 *
 * A contagem vai junto porque é ela que faz escolher: "Goiânia, Goiás (8)" diz
 * o que "Goiânia, Goiás" sozinho não diz — principalmente num acervo onde a
 * mesma cidade pode aparecer com dois rótulos diferentes.
 *
 * A ordem é por quantidade porque um acervo cresce em torno das buscas que se
 * repete: a cidade que se procura toda semana fica no topo sem precisar
 * rolar.
 */
export function opcoesDoAcervo(vagas) {
  const lista = Array.isArray(vagas) ? vagas : []
  return {
    cidades: contar(lista, 'cidade'),
    modalidades: contar(lista, 'modalidade'),
  }
}
