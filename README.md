# VAGAS — Atalho Inteligente para TI

Protótipo de frontend de um dashboard de busca de vagas de TI. Serve para
mostrar a ideia: navegação, filtros, ordenação, ranking de compatibilidade
("Rank IA") e a tela de configuração da avaliação.

**Site:** https://danielcampetti.github.io/vagasatalhointeligenteparati/

![Tela de vagas do protótipo](docs/print.png)

## ⚠️ É um protótipo frio, sem backend

Isso é intencional e não é uma pendência:

- Não há servidor, API, banco de dados, autenticação nem variáveis de ambiente.
- Nenhuma requisição de rede é feita — as vagas são um array estático em
  `src/data/vagas.js`, carregado em memória junto com o JavaScript da página.
- O "Rank IA" é um número que já vem nos dados; nada é calculado por IA.
- O upload de currículo só lê o nome e o tamanho do arquivo no navegador. O
  arquivo não sai da máquina nem é enviado para lugar nenhum.
- Tudo que você alterar (favoritar, arquivar, criar vaga) vale só para a
  sessão atual: recarregar a página volta ao estado inicial.

## O que dá para fazer na tela

- **Vagas** — tabela com 42 vagas fictícias: filtros por cargo, empresa,
  cidade, modalidade e status; busca livre; ordenação por salário, data e
  Rank IA; paginação; menu por linha (ver detalhes, favoritar, arquivar);
  e o botão **Nova vaga**, que adiciona uma vaga só nesta sessão.
- **Banco de Dados** — a mesma tabela sobre um histórico maior (58 vagas).
- **Avaliação IA** — área de currículo e o texto que orientaria a nota de 0 a 100.
- Abaixo de 1024px de largura a tabela vira uma lista de cards.

## Rodando local

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173/vagasatalhointeligenteparati/` (o caminho tem o
nome do repositório por causa do `base` do Vite — veja abaixo).

Outros comandos:

```bash
npm run build     # gera dist/
npm run preview   # serve o dist/ como em produção
npm run lint      # oxlint
```

## Deploy

Push na branch `main` → o workflow `.github/workflows/deploy.yml` faz o build e
publica no GitHub Pages. Também dá para disparar na mão em
**Actions → Deploy no GitHub Pages → Run workflow**.

Em **Settings → Pages**, o *source* é **GitHub Actions**.

Um detalhe importante para não quebrar: em `vite.config.js`,
`base: '/vagasatalhointeligenteparati/'` precisa ser exatamente o nome do
repositório. Se o repositório for renomeado e o `base` não acompanhar, a página
abre sem CSS nenhum (o HTML procura os assets na raiz do domínio e recebe 404).
O `public/.nojekyll` existe para o Pages não ignorar arquivos e pastas que
começam com `_`.

## Estrutura

```
index.html
src/
  main.jsx          # bootstrap do React
  App.jsx           # a página inteira (uma tela só, sem router — abas em estado local)
  index.css         # Tailwind + tokens do tema + estilos base
  data/vagas.js     # ⬅️ os dados mockados: é aqui que se edita o conteúdo
public/
  .nojekyll
  favicon.svg
.github/workflows/deploy.yml
```

Stack: Vite + React 19 (JavaScript, sem TypeScript) e Tailwind CSS v4. O v4
configura o tema em CSS, pelo bloco `@theme` do `src/index.css`, em vez do
antigo `tailwind.config.js`. O layout veio de um protótipo do Claude Design que
usava estilos inline, então eles foram mantidos como estão; o Tailwind cuida do
reset, dos tokens e dos estados de `hover`.

## Editando os dados

`src/data/vagas.js` exporta `VAGAS` (aba Vagas) e `VAGAS_BANCO` (aba Banco de
Dados) como arrays literais. Cada item:

```js
{
  id: 'j0',
  cargo: 'Analista de Redes',
  techs: ['Cisco', 'TCP/IP', 'Firewall'],
  empresa: 'Nubank',
  cidade: 'São Paulo, SP',
  modalidade: 'Remoto',      // Remoto | Híbrido | Presencial
  min: 4.5, max: 8,          // faixa salarial em R$ mil
  days: 12,                  // dias desde a publicação (a data é calculada a partir de hoje)
  rank: 87,                  // 0 a 100
  status: 'Ativa',           // Ativa | Em análise | Encerrada
  seen: false,               // false mostra o ponto azul de "não lida"
  fav: false,
}
```

Salvou, o Vite recarrega. Nada além disso.
