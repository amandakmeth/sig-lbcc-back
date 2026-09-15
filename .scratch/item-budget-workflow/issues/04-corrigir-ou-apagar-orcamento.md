# 04: Corrigir o valor ou remover um Orçamento

**What to build:** No detalhe, o Gestor altera só o valor unitário de um Orçamento já lançado (o total da linha recalcula com a quantidade do Item; o Fornecedor não muda) ou apaga o lançamento enquanto a Cotação não é terminal. Envelope sem linhas some. Se a Cotação ficar sem nenhum Orçamento, o status volta para `aberta`. Trocar de Fornecedor é apagar e criar — não existe “renomear” o concorrente.

A função de status é a mesma do ticket 02. Zerar vencedor ao cair abaixo de três fica para o ticket 05 (ainda não há vencedor nesta fatia).

**Blocked by:** 02: Registrar o primeiro Orçamento no Item e vê-lo no detalhe

**Status:** ready-for-agent

- [x] Gestor corrige o valor unitário (> 0) no detalhe; `valor_total` recalcula; Fornecedor da linha permanece
- [x] Tentativa de alterar `fornecedor_id` no Orçamento é recusada (troca = delete + create)
- [x] Gestor apaga um Orçamento em Cotação não terminal; a linha some da lista; envelope sem linhas é removido
- [x] Apagar o último Orçamento da Cotação devolve status `aberta` na resposta e no badge
- [x] Operador leva 403 em editar e apagar; Cotação terminal ou `ativo = false` recusa; a UI não oferece editar/apagar no terminal
- [x] React Query do detalhe invalida depois de editar e apagar
