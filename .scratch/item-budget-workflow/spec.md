# Orçamentos por item da Cotação

Status: ready-for-agent

## Problem Statement

O gestor registra Cotações com vários Itens, mas ainda não consegue comparar Orçamentos de Fornecedores em cada Item. O status de progresso (`aberta`, `em_andamento`, `pronta_para_analise`, `finalizada`) existe e a API de propostas existe, porém o status só muda à mão, não há mínimo de três Orçamentos por Item, não há vencedor por Item e o detalhe da Cotação no web não mostra preço nem Fornecedor. Sem isso a Cotação não fecha o fluxo de compra.

## Solution

Cada Item da Cotação acumula Orçamentos (Fornecedor + valor unitário). O gestor lança um ou vários de uma vez, no próprio Item. Só marca vencedor naquele Item quando houver pelo menos três Fornecedores distintos. O status de progresso passa a ser função do fato (contagem e vencedores), não de PATCH. O detalhe da Cotação mostra a lista, o modal com blocos e a escolha de vencedor. Quem já vê a Cotação vê também os Orçamentos.

## User Stories

1. As a Gestor, I want to registrar um Orçamento em um Item da Cotação com Fornecedor e valor unitário, so that aquele Item começa a ter comparação de preço.
2. As a Gestor, I want to abrir um modal naquele Item e adicionar blocos com +, so that eu lanço um Orçamento ou vários no mesmo envio.
3. As a Gestor, I want each bloco to be one Fornecedor + one valor unitário daquele Item, so that o lote compete no Item, não na Cotação inteira.
4. As a Gestor, I want to lançar um único bloco, so that eu não preciso esperar os três Fornecedores no mesmo momento.
5. As a Gestor, I want the Fornecedor do bloco to come from the cadastro de Fornecedores ativos, so that eu não crio Fornecedor no meio da Cotação.
6. As a Gestor, I want a Cotação with several Itens to accept an Orçamento em só alguns Itens, so that um Fornecedor que não atende o catálogo inteiro ainda entra na comparação do Item que ele cobre.
7. As a Gestor, I want the same Fornecedor to poder cotar Itens diferentes da mesma Cotação, so that a restrição de distinct vale por Item, não por Cotação.
8. As a Gestor, I want a second Orçamento do mesmo Fornecedor no mesmo Item to be rejected, so that os “três” são três Fornecedores de verdade.
9. As a Gestor, I want a lote whose payload repeats the same Fornecedor for the same Item (entre si ou contra o que já existe) to fail as a whole, so that não grava metade do modal.
10. As a Gestor, I want valor unitário greater than zero, so that Orçamento sem preço não entra na comparação.
11. As a Gestor, I want valor zero or negative to be rejected, so that brinde não finge cotação.
12. As a Gestor, I want only Fornecedor and valor unitário to be required, so that eu não preencho data, prazo ou condição para lançar.
13. As a Gestor, I want data da proposta to default to today when omitted, so that o registro continua datado sem campo na UI.
14. As a Gestor, I want to change the valor unitário of an existing Orçamento (not the Fornecedor), so that eu corrijo digitação sem burlar a regra de Fornecedor distinto.
15. As a Gestor, I want changing Fornecedor to mean delete + create, so that não existe “renomear” o concorrente.
16. As a Gestor, I want to delete an Orçamento while the Cotação is not terminal, so that um lançamento errado sai da comparação.
17. As a Gestor, I want to add a fourth or fifth Orçamento on an Item, so that um Fornecedor extra não é recusado depois do mínimo.
18. As a Gestor, I want the “definir vencedor” control on an Item to stay disabled until that Item has at least three Orçamentos, so that eu não fecho Item sem comparação.
19. As a Gestor, I want to choose a vencedor on an Item as soon as that Item has three Orçamentos, even if another Item still has fewer, so that a análise pode avançar Item a Item.
20. As a Gestor, I want exactly one vencedor per Item, so that a compra daquele Item tem um Fornecedor.
21. As a Gestor, I want different Itens to be able to have different Fornecedores vencedores, so that a Cotação não força um único ganhador global.
22. As a Gestor, I want to change the vencedor of an Item before the Cotação is `finalizada` or `cancelada`, so that eu corrijo a escolha.
23. As a Gestor, I want choosing vencedor to happen on the Item’s Orçamento list, not inside the create modal, so that lançar e analisar são dois gestos.
24. As a Gestor, I want deleting Orçamentos until that Item has fewer than three to clear that Item’s vencedor, so that não fica vencedor sem o mínimo.
25. As a Gestor, I want the first Orçamento on a Cotação `aberta` to move it to `em_andamento`, so that a lista reflete que a coleta começou.
26. As a Gestor, I want a Cotação to become `pronta_para_analise` only when every Item has at least three Orçamentos, so that “pronta” significa comparação possível em todos os Itens.
27. As a Gestor, I want a Cotação to become `finalizada` only when every Item has a vencedor, so that finalizar é fechar a compra de todos os Itens.
28. As a Gestor, I want a single-Item Cotação whose lote brings the third Orçamento to land on `pronta_para_analise` in that response (not stuck on `em_andamento`), so that o status é o fato final do lote, não um passo por bloco.
29. As a Gestor, I want deleting every Orçamento to return the Cotação to `aberta`, so that Cotação sem preço não fica “em andamento”.
30. As a Gestor, I want adding a new Item (zero Orçamentos) on a Cotação `pronta_para_analise` to move it back to `em_andamento`, so that o status não mente.
31. As a Gestor, I want existing vencedores on other Itens to remain when I add a new Item, so that eu não perco análise já feita.
32. As a Gestor, I want changing an Item’s quantidade to recalculate `valor_total` of that Item’s Orçamentos while keeping valor unitário, so that o preço combinado não muda com a quantidade.
33. As a Gestor, I want deleting an Item to delete its Orçamentos and recalc status, so that não sobra preço órfão.
34. As a Gestor, I want deleting the last Item of a Cotação to be rejected, so that “todos os Itens com três / com vencedor” nunca é verdade vacuosa numa lista vazia.
35. As a Gestor, I want `finalizada` and `cancelada` to refuse new Orçamentos, edits, deletes, vencedor changes, and Item changes, so that o encerramento é terminal.
36. As a Gestor, I want to cancel a non-terminal Cotação with a mandatory motivo, so that cancelamento continua o único status posto à mão.
37. As a Gestor, I want PATCH of `em_andamento`, `pronta_para_analise`, `finalizada` or `aberta` via status-progresso to be rejected, so that ninguém fura a máquina.
38. As a Gestor, I want cancel with empty motivo to fail, so that Cotação cancelada sempre explica.
39. As a Gestor, I want Orçamentos blocked when the Cotação is `ativo = false`, so that registro inativo não recebe preço.
40. As an Operador (or Prefeitura) who can see the Cotação, I want to see each Item’s Orçamentos, valores, Fornecedor names and vencedor, so that o detalhe não é secreto para quem já lê a Cotação.
41. As an Operador, I want create/edit/delete Orçamento and escolher vencedor to be forbidden, so that só Gestor grava o fluxo.
42. As an unauthenticated client, I want Orçamento routes to require auth, so that preço de compra não é público.
43. As a Gestor, I want the Cotação detail (`/cotacoes/[id]`) to list Orçamentos under each Item, so that eu não abro outra tela para coletar e analisar.
44. As a Gestor, I want a Status badge on that detail to follow the derived status after each mutation, so that eu não recarrego no escuro.
45. As a Gestor, I want the vencedor row to be visually distinct on the Item list, so that eu vejo quem ganhou sem reler a tabela.
46. As a Gestor, I want the + / modal hidden or disabled on a terminal Cotação, so that a UI não oferece o que a API recusa.
47. As a Gestor, I want GET Cotação by id to include each Item’s Orçamentos (id, Fornecedor, unitário, total, selecionada), so that o detalhe não faz N+1 de propostas.
48. As a developer of the web app, I want React Query keys for the Cotação detail to invalidate after Orçamento and vencedor mutations, so that lista e detalhe não mostram status velho.
49. As a developer of the API, I want one status function applied after every mutating Orçamento/Item/vencedor operation, so that não existe um segundo caminho de status.
50. As a Gestor on a two-Item Cotação with three Orçamentos on Item A and one on Item B, I want status `em_andamento` and vencedor enabled only on A, so that Q6 and the status table coexist.
51. As a Gestor on a two-Item Cotação with three Orçamentos on both and vencedor only on A, I want status `pronta_para_analise`, so that “pronta” não espera o último vencedor.
52. As a Gestor, I want an inactive Fornecedor excluded from the select, so that eu não lanço preço de quem saiu do cadastro.
53. As a Gestor, I want an unknown `fornecedor_id` to be rejected, so that não grava FK morta.
54. As a Gestor, I want an `item_id` that does not belong to the Cotação to be rejected, so that preço não vaza de Cotação.
55. As a Gestor, I want optional observações on an Orçamento to remain possible in the API without being required in the modal, so that a UI desta entrega fica só Fornecedor + valor.
56. As a reader of reports and the Cotação list, I want existing filters that already key off status strings to keep working, so that `pronta_para_analise` and `finalizada` aparecem quando a máquina as deriva (sem contador novo na listagem).
57. As a Gestor, I want existing Item create/update (descrição, produto, unidade) to keep working on non-terminal Cotações, so that Orçamento não congela o cadastro do Item além da quantidade/recalc.
58. As a maintainer, I want the abandoned “Fornecedor obrigatório no Item” plan to stay out of this delivery, so that Fornecedor vive no Orçamento, não como FK única do Item.

## Implementation Decisions

- Dois repositórios, mesma branch `feat/item-budget-workflow`: regras e persistência no back; detalhe da Cotação no front. Não é monorepo.
- Vocabulário: **Cotação**, **Item da Cotação**, **Orçamento**, **Fornecedor**, **vencedor**, **status de progresso** (`aberta` | `em_andamento` | `pronta_para_analise` | `finalizada` | `cancelada`). Eixo separado: `ativo`. Papel que grava: **Gestor**. Persistência já nomeia envelope `cotacao_propostas` e linha `cotacao_proposta_itens`; na API e na UI desta entrega o conceito é Orçamento (a linha).
- Reusar `cotacao_propostas` + `cotacao_proposta_itens`. Não criar tabela paralela. Não usar `cotacao_itens.fornecedor_id` nem `cotacoes.fornecedor_vencedor_id` como vencedor ou como os três Orçamentos.
- Um Orçamento = uma linha em `cotacao_proposta_itens` com Fornecedor no envelope (`cotacao_propostas.fornecedor_id`) e valor na linha (`valor_unitario`, `valor_total` = quantidade do Item × unitário). Se já existir envelope daquele Fornecedor naquela Cotação, nova linha entra nele; senão cria envelope com `data_proposta` = hoje (servidor) e `selecionada` do envelope permanece false.
- Vencedor por Item: flag `selecionada` na **linha** (`cotacao_proposta_itens`), no máximo uma verdadeira por `item_id`. Migration para a coluna (e índice de unicidade parcial). O boolean no envelope não escolhe vencedor.
- Status é função do fato, aplicada depois de cada mutação de Orçamento, vencedor ou Item. `cancelada` só entra por cancelamento explícito com motivo. `finalizada` e `cancelada` são terminais: a função não recua esses dois.

```
// decisão da máquina (protótipo da regra, não código de produção)
function statusFromFacts({ statusAtual, itens }) {
  if (statusAtual === "cancelada" || statusAtual === "finalizada") return statusAtual;
  if (itens.length === 0) return "aberta";
  const everyWinner = itens.every((i) => i.vencedorId);
  if (everyWinner) return "finalizada";
  const everyMin3 = itens.every((i) => i.orcamentos.length >= 3);
  if (everyMin3) return "pronta_para_analise";
  const anyOrcamento = itens.some((i) => i.orcamentos.length > 0);
  if (anyOrcamento) return "em_andamento";
  return "aberta";
}
```

- Contrato de escrita desta entrega (o modal): um POST de lote **por Item** — corpo com array de blocos `{ fornecedor_id, valor_unitario }`. Um bloco = envio individual; vários = lote. Validar o array inteiro antes de gravar; falha → nada persiste. Duplicata `(item, fornecedor)` no payload ou contra linhas existentes → 400 do lote. `valor_unitario` numérico `> 0`. Fornecedor existente e `ativo`. Cotação existente, `ativo`, não terminal.
- PUT do Orçamento altera só `valor_unitario` (recalcula `valor_total`); não troca `fornecedor_id`. DELETE remove a linha; envelope sem linhas some. Se o Item ficar com < 3 linhas, `selecionada` daquele Item zera.
- Escolher vencedor: mutação no Item (`orcamento_id` = id da linha) permitida só com ≥ 3 Orçamentos naquele Item, Cotação não terminal, linha pertencente ao Item. Trocar vencedor desmarca o anterior. Não há vencedor da Cotação inteira.
- GET Cotação por id passa a aninhar, em cada Item, os Orçamentos (id da linha, fornecedor_id, nome do Fornecedor, valor_unitario, valor_total, selecionada). Listagem de Cotação não precisa do progresso `2/3`.
- Quem grava Orçamento/vencedor: `perfil === gestor` (mesmo padrão das mutações de Cotação). GET autenticado de quem já lê Cotação.
- PATCH `/cotacoes/:id/status-progresso` deixa de aceitar `aberta` | `em_andamento` | `pronta_para_analise` | `finalizada`. Cancelar com `status: cancelada` + motivo (e o DELETE lógico de Cotação que já cancela) permanece.
- Itens: create/update/delete continuam bloqueados se Cotação terminal. Quantidade > 0 continua; update de quantidade recalcula `valor_total` das linhas daquele Item. Não apagar o último Item (400). Item novo nasce com zero Orçamentos; a função de status corre.
- POST antigo de proposta (um Fornecedor, N Itens), se permanecer, passa pelas **mesmas** invariantes (Gestor, unitário > 0, Fornecedor distinto por Item, status derivado, Cotação não terminal). A UI não o usa. Não abrir um segundo caminho de status.
- Front: só `/cotacoes/[id]`. Modal por Item (select de Fornecedores ativos + valor unitário +). Lista com editar valor, apagar, definir vencedor (habilitado em ≥ 3). Badge já existente. Sem cadastro de Fornecedor no modal, sem tela extra de análise, sem contador na listagem `/cotacoes`, sem PDF. Cancelar Cotação no detalhe permanece. Types/mappers/hooks/React Query acompanham o DTO aninhado. Comentário de `StatusCotacao` no front alinha: vencedor é **por Item**, `finalizada` quando todos os Itens têm vencedor.
- Plano `fornecedor_por_item` (Fornecedor obrigatório no Item) fica fora; esta spec o substitui para o fluxo de compra.

## Testing Decisions

- Testar comportamento externo: status HTTP, corpo JSON (status da Cotação, linhas de Orçamento, `selecionada`, totais), e 403/400 nas recusas. Não testar nome de função interna, coluna isolada, nem React state.
- **Costura única (preferida):** cliente HTTP do back — Jest + Supertest no `app` Express, o mesmo tipo de teste de `cotacoes.test.js` (login Gestor/Operador, seed de paciente/área/Fornecedor). Toda a máquina (lote, distinct, mínimo 3, vencedor, recuo para `aberta`, `pronta_para_analise`, `finalizada`, último Item, quantidade, cancelamento, recusa de PATCH de progresso) prova-se nessa costura. Não adicionar testes de service isolado como costura nova.
- Front: não abrir costura nova (sem Playwright, sem teste de modal). Se o DTO da Cotação mudar, estender os testes de mapper já existentes no serviço de Cotações (Vitest) só para o mapeamento snake_case → camelCase dos Orçamentos aninhados — isso não é a costura da regra, é adaptação de DTO.
- Prior art: `back/tests/cotacoes.test.js`, `back/tests/fornecedores.test.js` (auth Gestor vs Operador, 201/400/403). Ainda não há testes do módulo de propostas; os novos casos ficam ao lado das Cotações (mesmo app, mesmo estilo), cobrindo o recurso de Orçamento.

## Out of Scope

- Contador `2/3` ou progresso por Item na listagem `/cotacoes`.
- Tela extra de análise além do detalhe.
- PDF, e-mail, anexo de proposta.
- Criar Fornecedor dentro do modal.
- Auto-escolher o menor preço; empate é escolha manual.
- Papel “Fornecedor” autenticando para enviar o próprio Orçamento.
- Relatórios novos ou colunas novas de preço nos relatórios atuais (eles já leem o status).
- Reativar Fornecedor obrigatório como campo do Item.
- Override manual de `em_andamento` / `pronta_para_analise` / `finalizada`.
- App mobile.

## Further Notes

- Entendimento fechado em grilling: unidade = linha do Item; Q12 (proposta cobrir todos os Itens) revertido; Q6 = vencedor no Item com ≥ 3 mesmo com outros incompletos; Q7 = modal com +; status recalcula inclusive até `aberta`; PATCH de progresso só cancelar.
- Branches já criadas: `front` e `back` em `feat/item-budget-workflow`.
- Testes atuais de Cotação dependem de seed no Supabase; Orçamento vai precisar de Fornecedores ativos no mesmo estilo — falha 400 por FK é o mesmo risco já documentado em `cotacoes.test.js`.
