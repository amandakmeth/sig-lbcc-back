# 03: Lançar um lote de Orçamentos no mesmo Item num único envio

**What to build:** No detalhe da Cotação, o Gestor abre o modal daquele Item, acrescenta blocos com **+** e envia de uma vez. Cada bloco é um Fornecedor + um valor unitário daquele Item. Um bloco continua válido (não precisa esperar os três). Se o payload repete Fornecedor (entre si ou contra o que já existe naquele Item), o lote inteiro falha e nada persiste. O quarto ou quinto Orçamento no Item é aceito.

Numa Cotação de um só Item, o lote que traz o terceiro Fornecedor distinto deixa a Cotação em `pronta_para_analise` **naquela resposta** — não fica presa em `em_andamento` por um passo por bloco. A função de status é a mesma do ticket 02.

**Blocked by:** 02: Registrar o primeiro Orçamento no Item e vê-lo no detalhe

**Status:** ready-for-agent

- [ ] Modal do Item permite um ou vários blocos no mesmo envio; cada bloco é Fornecedor + valor unitário daquele Item
- [ ] Lote válido grava todas as linhas; o detalhe lista todas e o badge acompanha o status derivado
- [ ] Duplicata `(Item, Fornecedor)` no payload ou contra linhas já gravadas → 400 do lote e nenhuma linha nova
- [ ] Cotação de um Item cujo lote completa três Fornecedores distintos responde `pronta_para_analise` (não `em_andamento`)
- [ ] Quarto (e quinto) Orçamento no mesmo Item é aceito depois do mínimo
- [ ] Validação continua no array inteiro antes de gravar (valor > 0, Fornecedor ativo, Cotação não terminal/`ativo`)
