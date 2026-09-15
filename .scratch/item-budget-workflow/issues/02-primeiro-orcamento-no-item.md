# 02: Registrar o primeiro Orçamento no Item e vê-lo no detalhe

**What to build:** O Gestor abre o detalhe da Cotação (`/cotacoes/[id]`), lança **um** Orçamento naquele Item (Fornecedor ativo + valor unitário) e vê a linha sob o Item — nome do Fornecedor, unitário, total, sem vencedor. O badge de status vai de `aberta` para `em_andamento` na resposta e na tela, sem recarregar no escuro. Operador (ou quem já lê a Cotação) vê a mesma lista e não consegue gravar. Sem autenticação as rotas de Orçamento recusam. A listagem `/cotacoes` não ganha contador `2/3`.

Um Orçamento é a linha do Item (Fornecedor no envelope, valor na linha). Reusar envelope se aquele Fornecedor já cotou outro Item da mesma Cotação; senão criar envelope com `data_proposta` = hoje no servidor e `selecionada` do envelope permanece false. Fornecedor vive no Orçamento, não como FK única do Item. Não usar vencedor global da Cotação.

POST desta entrega é **lote por Item**: corpo com array de blocos `{ fornecedor_id, valor_unitario }` — um bloco neste ticket. Validar o array inteiro antes de gravar. `valor_unitario` numérico `> 0`. Observações continuam opcionais na API e **não** aparecem no modal.

A máquina de status entra aqui e é a **única** da entrega. Aplicar depois de cada mutação de Orçamento (e, nas fatias seguintes, de vencedor e Item). `cancelada` e `finalizada` não recuam. Nesta fatia prova-se a transição `aberta` → `em_andamento`; as outras saídas ficam para os tickets que as tornam visíveis.

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

GET Cotação por id aninha, em cada Item, os Orçamentos (id da linha, fornecedor_id, nome do Fornecedor, valor_unitario, valor_total, selecionada). Types/mappers/hooks/React Query acompanham o DTO; invalidar o detalhe depois da mutação. Front só neste detalhe: modal com select de Fornecedores **ativos** + valor unitário (sem + ainda). Em Cotação terminal ou inativa o controle não oferece o que a API recusa.

Costura: Jest + Supertest ao lado das Cotações. Front: só estender mapper snake_case → camelCase dos Orçamentos aninhados. Dois repositórios, branch `feat/item-budget-workflow`.

**Blocked by:** 01: Prefatorar a costura HTTP das Cotações

**Status:** ready-for-agent

- [x] Gestor lança um bloco (Fornecedor ativo + valor unitário > 0) e o detalhe lista esse Orçamento sob o Item certo, com nome do Fornecedor, unitário, total e `selecionada` falsa
- [x] GET Cotação por id devolve os Orçamentos aninhados no Item; quem já lê a Cotação vê; cliente sem token leva 401
- [x] Cotação `aberta` passa a `em_andamento` na mesma resposta do primeiro Orçamento; o badge do detalhe acompanha
- [x] Operador (e Prefeitura) lê e leva 403 em create; só `perfil === gestor` grava
- [x] Segundo Orçamento do mesmo Fornecedor no mesmo Item → 400 e nada novo persiste; o mesmo Fornecedor em **outro** Item da mesma Cotação é aceito
- [x] Cotação com vários Itens aceita Orçamento em só alguns; o Item sem preço permanece sem linhas
- [x] `valor_unitario` zero ou negativo, Fornecedor inexistente ou inativo, `item_id` de outra Cotação → 400 e nada persiste
- [x] Cotação `finalizada`, `cancelada` ou `ativo = false` recusa Orçamento novo; a UI do detalhe não oferece o modal nesses casos
- [x] `data_proposta` omitida no modal grava hoje no servidor; o modal pede só Fornecedor e valor unitário
- [x] Fornecedor inativo não aparece no select; não há cadastro de Fornecedor no modal
- [x] Listagem `/cotacoes` e filtros/relatórios que já usam as strings de status continuam iguais (sem contador `2/3`)
- [x] Não se grava Fornecedor no Item nem vencedor na Cotação inteira; envelope `selecionada` não escolhe vencedor
