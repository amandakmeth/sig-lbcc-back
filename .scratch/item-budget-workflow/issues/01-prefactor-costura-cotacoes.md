# 01: Prefatorar a costura HTTP das Cotações

**What to build:** Quem for gravar Orçamento consegue reusar a costura HTTP já existente das Cotações: um teste cria de verdade uma Cotação com Item, faz login Gestor e Operador, e conta com Fornecedor ativo no seed. Os casos antigos deixam de desistir cedo e deixam de esperar o payload morto de “vínculos”.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] POST de Cotação nos testes existentes envia pelo menos um Item e devolve id utilizável nas asserções seguintes (não há `return` cedo por 400 de Item ausente)
- [ ] Casos de cancelamento/DELETE deixam de esperar `cotacaoTemVinculos` e passam a cobrir o cancelamento atual com motivo
- [ ] Há pelo menos um Fornecedor ativo no seed, no mesmo estilo já usado em Cotação/Fornecedor; falha 400 por FK continua o risco já conhecido, não um caminho novo
- [ ] Login Gestor e Operador permanece o padrão da costura (Jest + Supertest no `app`); os testes que ainda fazem sentido ficam verdes
- [ ] Esta fatia não introduz Orçamento, vencedor, máquina de status nem mudança no detalhe web
