# 05: Definir o vencedor do Item

**What to build:** No detalhe, cada Item tem “definir vencedor” na **lista** de Orçamentos (não no modal de lançar). O controle fica desabilitado até aquele Item ter pelo menos três Orçamentos de Fornecedores distintos; aí o Gestor escolhe exatamente um vencedor naquele Item, mesmo que outro Item ainda tenha menos. Itens diferentes podem ter Fornecedores vencedores diferentes. Não há vencedor da Cotação inteira. A linha vencedora fica visualmente distinta.

Trocar o vencedor é permitido enquanto a Cotação não está `finalizada` nem `cancelada`. Apagar Orçamentos até o Item ficar com menos de três **zera** o vencedor daquele Item. Quando **todos** os Itens têm vencedor, a Cotação fica `finalizada`. Dois Itens com três Orçamentos cada e vencedor só no A → `pronta_para_analise`. Dois Itens com três no A e um no B → `em_andamento` e vencedor habilitado só no A.

Vencedor = `selecionada` na **linha** (no máximo uma verdadeira por Item). Migration da coluna e índice parcial de unicidade. O boolean do envelope não escolhe vencedor. Comentário de `StatusCotacao` no front: vencedor é por Item; `finalizada` quando todos os Itens têm vencedor. A função de status é a mesma do ticket 02.

**Blocked by:** 02: Registrar o primeiro Orçamento no Item e vê-lo no detalhe; 04: Corrigir o valor ou remover um Orçamento

**Status:** ready-for-agent

- [x] “Definir vencedor” na lista do Item fica desabilitado com 0, 1 ou 2 Orçamentos e habilitado com ≥ 3; não aparece no modal de criar
- [x] Gestor escolhe um Orçamento daquele Item como vencedor; `selecionada` fica verdadeira só nessa linha; o detalhe destaca a linha
- [x] Escolher outro vencedor no mesmo Item desmarca o anterior; Itens distintos aceitam Fornecedores vencedores distintos
- [x] Cotação de um Item (ou todos os Itens) com vencedor responde `finalizada`; o badge acompanha
- [x] Cotação de dois Itens: três Orçamentos no A e um no B → `em_andamento`, vencedor só no A; três em ambos e vencedor só no A → `pronta_para_analise`
- [x] Apagar até o Item ter menos de três zera `selecionada` daquele Item e a função de status corre de novo
- [x] Operador 403; Cotação terminal recusa troca de vencedor; linha que não pertence ao Item é recusada
- [x] Envelope `selecionada` permanece fora da escolha; não se usa vencedor global da Cotação
