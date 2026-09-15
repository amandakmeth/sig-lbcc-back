# 07: Fechar atalhos da máquina de status

**What to build:** Ninguém fura a máquina. PATCH de status-progresso recusa `aberta`, `em_andamento`, `pronta_para_analise` e `finalizada`. Cancelar uma Cotação não terminal com motivo obrigatório continua o **único** status posto à mão (incluindo o DELETE lógico que já cancela). Motivo vazio falha. O POST antigo de proposta (um Fornecedor, N Itens), se permanecer, obedece as mesmas invariantes desta entrega (Gestor, unitário > 0, Fornecedor distinto por Item, Cotação não terminal/`ativo`, status derivado pela função única) — a UI não o usa e não pode ser um segundo caminho de status.

Filtros e relatórios que já leem as strings de status continuam funcionando quando a máquina deriva `pronta_para_analise` e `finalizada`.

**Blocked by:** 05: Definir o vencedor do Item

**Status:** ready-for-agent

- [ ] PATCH status-progresso com `aberta` | `em_andamento` | `pronta_para_analise` | `finalizada` → 400; o status da Cotação não muda
- [ ] Cancelar Cotação não terminal com `status: cancelada` e motivo não vazio funciona; motivo ausente ou só espaço → 400 e a Cotação não cancela
- [ ] Cotação `finalizada` ou `cancelada` recusa Orçamento novo/editar/apagar, troca de vencedor e mudança de Item (nenhum buraco restante)
- [ ] POST antigo de proposta (um Fornecedor, N Itens), se a rota permanecer, recusa o que o lote por Item recusaria e aplica a mesma função de status; se o lote falharia, nada persiste
- [ ] Listagem e relatórios que já filtram por `pronta_para_analise` / `finalizada` passam a ver Cotações que a máquina colocou nesses status, sem coluna ou contador novo
