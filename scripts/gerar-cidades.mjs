/**
 * Gera src/data/cidades.js a partir da API de localidades do IBGE.
 *
 *   node scripts/gerar-cidades.mjs
 *
 * A resposta crua do IBGE tem 2,4 MB — traz meso/microrregião, região
 * imediata e intermediária de cada município. A tela usa só "Cidade, UF",
 * então é só isso que o arquivo gerado guarda: ~30 KB depois do gzip.
 *
 * A UF vai junto no rótulo porque 232 nomes de município se repetem entre
 * estados — "Bom Jesus" existe em cinco. Sem a sigla, a lista teria linhas
 * indistinguíveis.
 *
 * O resultado é commitado. Município quase não muda, e embutir a lista mantém
 * a promessa do protótipo de não fazer requisição nenhuma em runtime.
 */
const FONTE = 'https://servicodados.ibge.gov.br/api/v1/localidades/municipios'
const DESTINO = new URL('../src/data/cidades.js', import.meta.url)

/** A UF aparece em dois caminhos na resposta; alguns registros só têm um. */
function ufDoMunicipio(m) {
  const caminhos = [
    m.microrregiao?.mesorregiao?.UF,
    m['regiao-imediata']?.['regiao-intermediaria']?.UF,
  ]
  return caminhos.find(Boolean) ?? null
}

const resposta = await fetch(FONTE)
if (!resposta.ok) {
  throw new Error(`IBGE respondeu ${resposta.status} ${resposta.statusText}`)
}
const municipios = await resposta.json()

const cidades = municipios
  .map((m) => {
    const uf = ufDoMunicipio(m)
    if (!uf) throw new Error(`Município sem UF na resposta: ${m.nome}`)
    return `${m.nome}, ${uf.sigla}`
  })
  .sort((a, b) => a.localeCompare(b, 'pt-BR'))

const arquivo = `/**
 * Municípios do Brasil, do IBGE. NÃO EDITE À MÃO.
 *
 * Gerado por scripts/gerar-cidades.mjs a partir de
 * ${FONTE}
 *
 * ${cidades.length} municípios, no formato "Cidade, UF" — o mesmo do campo
 * \`cidade\` de uma vaga, então dá para comparar direto com os dados. É também
 * a forma que entra na consulta: a JSearch recebe localização como texto.
 *
 * A sigla faz parte do rótulo porque 232 nomes se repetem entre estados.
 */
export const CIDADES = ${JSON.stringify(cidades, null, 2)};
`

await (await import('node:fs/promises')).writeFile(DESTINO, arquivo, 'utf8')

const kb = (Buffer.byteLength(arquivo, "utf8") / 1024).toFixed(1)
console.log(
  `src/data/cidades.js: ${cidades.length} municípios, ${kb} KB`,
)
