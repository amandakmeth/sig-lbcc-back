# 06: Mudar Itens recalcula Orçamentos e status

**What to build:** Criar, alterar quantidade ou apagar Item continua no fluxo já existente da Cotação não terminal, e passa pela **mesma** função de status do ticket 02. Item novo nasce com zero Orçamentos: se a Cotação estava `pronta_para_analise`, volta para `em_andamento`; vencedores dos outros Itens permanecem. Apagar um Item apaga os Orçamentos dele e recalcula o status. Apagar o último Item é recusado (a regra “todos os Itens com três / com vencedor” não pode ser verdade vacuosa). Mudar a quantidade do Item recalcula `valor_total` das linhas daquele Item e mantém o valor unitário. Descrição, produto e unidade do Item continuam editáveis em Cotação não terminal. Fornecedor obrigatório no Item permanece fora.

**Blocked by:** 05: Definir o vencedor do Item

**Status:** ready-for-agent

- [x] Incluir Item (zero Orçamentos) numa Cotação `pronta_para_analise` responde `em_andamento`; vencedores dos outros Itens seguem marcados
- [x] Apagar um Item remove os Orçamentos daquele Item e o status da Cotação é o fato restante (incluindo recuo para `aberta` se não sobrar preço)
- [x] Apagar o último Item da Cotação → 400; a Cotação permanece com aquele Item
- [x] Alterar quantidade (> 0) recalcula `valor_total` de cada Orçamento do Item e preserva `valor_unitario`
- [x] Create/update de descrição, produto e unidade do Item continua válido em Cotação não terminal; Cotação terminal continua recusando mudança de Item
- [x] Não se reativa Fornecedor como campo obrigatório do Item
