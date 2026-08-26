/**
 * O banco de vagas do protótipo — hoje vazio, à espera da API.
 *
 * Havia aqui 58 anúncios fictícios que simulavam o retorno de uma busca por
 * "Técnico de TI em Caxias do Sul". Foram removidos de propósito: a próxima
 * coisa a entrar é a chamada real à JSearch, e um mock com dados dentro só
 * mascararia se a integração está ou não funcionando.
 *
 * Enquanto `BANCO_DE_VAGAS` estiver vazio, buscar devolve o estado vazio em
 * qualquer cidade — e a aba Banco de Dados fica sem linhas. É o correto: a
 * tela não tem de onde tirar vaga nenhuma. Para ver a tabela com conteúdo
 * antes da API, preencha este array à mão: o `ModalNovaVaga` existe no
 * `App.jsx` mas nenhum botão o abre.
 *
 * Cargo e cidade não são filtros de tela: são a consulta. Quando a API entrar,
 * é ela quem devolve a lista, e o recorte por cidade que o `App` faz hoje sai
 * de cena junto com o mock.
 *
 * Campos de uma vaga — a forma que a resposta da API precisa ter ao chegar
 * aqui, e o que o formulário de nova vaga monta:
 *   id          identificador único (string)
 *   cargo       título da vaga
 *   techs       até 3 tecnologias exibidas abaixo do cargo, como informação
 *               da vaga — não filtram nada
 *   empresa     nome do empregador
 *   cidade      "Cidade, UF" — precisa bater com o rótulo do IBGE em
 *               data/cidades.js, senão a vaga fica inalcançável pela busca
 *   modalidade  "Remoto" | "Híbrido" | "Presencial"
 *   min / max   faixa salarial em R$ mil (ex.: 4.5 = R$ 4.500)
 *   days        dias desde a publicação — a data exibida é calculada a partir
 *               de hoje, então a lista nunca "envelhece"
 *   rank        nota de compatibilidade da IA, de 0 a 100
 *   status      "Ativa" | "Em análise" | "Encerrada"
 *   seen        false mostra o ponto azul de "não lida"
 *   fav         favoritada pelo usuário
 */

/** Opções do campo Modalidade no formulário de nova vaga. */
export const MODALIDADES = ["Remoto", "Híbrido", "Presencial"];

/** Texto padrão da caixa de instrução da aba Avaliação IA. */
export const INSTRUCAO_PADRAO =
  "Avalie cada vaga de 0 a 100 comparando o anúncio com o perfil do candidato. Comece pela aderência técnica: quantas das tecnologias exigidas o candidato já operou em produção, e em que profundidade. Esse é o maior peso da nota.\n\nEm seguida ajuste por senioridade — vaga acima do nível do candidato reduz a nota, vaga muito abaixo também. Considere modalidade e localização: se a vaga é presencial fora da cidade do candidato, penalize; remoto é neutro.\n\nPese a faixa salarial contra a pretensão informada e a data de publicação: anúncios com mais de 20 dias perdem pontos por risco de processo já encerrado.\n\nDesconsidere prestígio da empresa, nome de mercado e texto promocional. Se um requisito crítico estiver ausente do perfil, limite a nota a 60. Devolva o número, a faixa (Excelente, Muito bom, Bom, Regular, Baixo) e uma frase justificando o que puxou a nota para cima ou para baixo.";

/**
 * Base única das duas abas de tabela. Vazia: é aqui que a resposta da API vai
 * pousar. Para ver a tela com conteúdo antes disso, preencha este array
 * seguindo a forma documentada acima.
 */
export const BANCO_DE_VAGAS = [];
