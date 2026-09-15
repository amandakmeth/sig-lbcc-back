import request from 'supertest';
import app from '../src/app.js';

let tokenGestor = '';
let tokenOperador = '';

let pacienteId = '';
let areaId = '';
let fornecedorA = null;
let fornecedorB = null;
let fornecedorC = null;
let fornecedorD = null;
let fornecedorE = null;

beforeAll(async () => {
    const gestor = await request(app)
        .post('/auth/login')
        .send({
            email: 'admin@email.com',
            password: '123456'
        });

    tokenGestor = gestor.body.access_token;

    const operador = await request(app)
        .post('/auth/login')
        .send({
            email: 'operador2@email.com',
            password: '123456'
        });

    tokenOperador = operador.body.access_token;

    const stamp = Date.now();

    const paciente = await request(app)
        .post('/pacientes')
        .set('Authorization', `Bearer ${tokenGestor}`)
        .send({
            nome: `Paciente orçamento ${stamp}`,
            data_nascimento: '2000-01-01',
            cidade: 'Londrina',
            estado: 'PR'
        });

    pacienteId = (paciente.body[0] || paciente.body)?.id;

    const area = await request(app)
        .post('/areas')
        .set('Authorization', `Bearer ${tokenGestor}`)
        .send({
            nome: `Área orçamento ${stamp}`,
            descricao: 'seed orçamento'
        });

    areaId = (area.body[0] || area.body)?.id;

    fornecedorA = await criarFornecedor({
        razao_social: `Fornecedor A ${stamp}`,
        nome_fantasia: 'Farmacia Central',
        cnpj: `${stamp}1`
    });

    fornecedorB = await criarFornecedor({
        razao_social: `Fornecedor B ${stamp}`,
        nome_fantasia: 'Distribuidora Norte',
        cnpj: `${stamp}2`
    });

    fornecedorC = await criarFornecedor({
        razao_social: `Fornecedor C ${stamp}`,
        nome_fantasia: 'Hospitalar Sul',
        cnpj: `${stamp}3`
    });

    fornecedorD = await criarFornecedor({
        razao_social: `Fornecedor D ${stamp}`,
        nome_fantasia: 'Farma Leste',
        cnpj: `${stamp}4`
    });

    fornecedorE = await criarFornecedor({
        razao_social: `Fornecedor E ${stamp}`,
        nome_fantasia: 'Comercial Oeste',
        cnpj: `${stamp}5`
    });

    if (
        !pacienteId ||
        !areaId ||
        !fornecedorA?.id ||
        !fornecedorB?.id ||
        !fornecedorC?.id ||
        !fornecedorD?.id ||
        !fornecedorE?.id
    ) {
        throw new Error(
            'Seed da costura: paciente, área e fornecedores ativos são obrigatórios'
        );
    }
}, 30000);

async function criarFornecedor(dados) {
    const res = await request(app)
        .post('/fornecedores')
        .set('Authorization', `Bearer ${tokenGestor}`)
        .send({
            telefone: '43999999999',
            email: 'orcamento@email.com',
            ...dados
        });

    return res.body[0] || res.body;
}

async function criarCotacao(itens) {
    const res = await request(app)
        .post('/cotacoes')
        .set('Authorization', `Bearer ${tokenGestor}`)
        .send({
            descricao: `Cotação orçamento ${Date.now()}`,
            data_validade: '2026-12-31',
            observacoes: 'teste orçamento',
            paciente_id: pacienteId,
            area_id: areaId,
            itens
        });

    if (res.statusCode !== 201) {
        throw new Error(
            `Não criou cotação: ${res.statusCode} ${JSON.stringify(res.body)}`
        );
    }

    return res.body[0] || res.body;
}

function itemOrcamentos(cotacao, itemId) {
    const item = (cotacao.cotacao_itens || []).find(
        (linha) => linha.id === itemId
    );

    return item?.orcamentos || [];
}

function postOrcamentos(token, cotacaoId, itemId, blocos) {
    const req = request(app)
        .post(`/cotacoes/${cotacaoId}/itens/${itemId}/orcamentos`);

    if (token) {
        req.set('Authorization', `Bearer ${token}`);
    }

    return req.send(blocos);
}

function putOrcamento(token, cotacaoId, itemId, orcamentoId, body) {
    const req = request(app)
        .put(
            `/cotacoes/${cotacaoId}/itens/${itemId}/orcamentos/${orcamentoId}`
        );

    if (token) {
        req.set('Authorization', `Bearer ${token}`);
    }

    return req.send(body);
}

function deleteOrcamento(token, cotacaoId, itemId, orcamentoId) {
    const req = request(app)
        .delete(
            `/cotacoes/${cotacaoId}/itens/${itemId}/orcamentos/${orcamentoId}`
        );

    if (token) {
        req.set('Authorization', `Bearer ${token}`);
    }

    return req;
}

function escolherVencedor(token, cotacaoId, itemId, orcamentoId) {
    const req = request(app)
        .patch(`/cotacoes/${cotacaoId}/itens/${itemId}/vencedor`);

    if (token) {
        req.set('Authorization', `Bearer ${token}`);
    }

    return req.send({
        orcamento_id: orcamentoId
    });
}

function getCotacao(token, cotacaoId) {
    const req = request(app).get(`/cotacoes/${cotacaoId}`);

    if (token) {
        req.set('Authorization', `Bearer ${token}`);
    }

    return req;
}

function postItem(token, cotacaoId, body) {
    const req = request(app)
        .post(`/cotacao-itens/cotacao/${cotacaoId}`);

    if (token) {
        req.set('Authorization', `Bearer ${token}`);
    }

    return req.send(body);
}

function putItem(token, itemId, body) {
    const req = request(app).put(`/cotacao-itens/${itemId}`);

    if (token) {
        req.set('Authorization', `Bearer ${token}`);
    }

    return req.send(body);
}

function deleteItem(token, itemId) {
    const req = request(app).delete(`/cotacao-itens/${itemId}`);

    if (token) {
        req.set('Authorization', `Bearer ${token}`);
    }

    return req;
}

const tresOrcamentos = () => [
    {
        fornecedor_id: fornecedorA.id,
        valor_unitario: 10
    },
    {
        fornecedor_id: fornecedorB.id,
        valor_unitario: 11
    },
    {
        fornecedor_id: fornecedorC.id,
        valor_unitario: 12
    }
];

async function tornarFinalizada(cotacao) {
    const itemId = cotacao.cotacao_itens[0].id;
    const lancado = await postOrcamentos(
        tokenGestor,
        cotacao.id,
        itemId,
        tresOrcamentos()
    );

    if (lancado.statusCode !== 201) {
        throw new Error(
            `Não lançou orçamentos: ${lancado.statusCode} ${JSON.stringify(lancado.body)}`
        );
    }

    const orcamento = itemOrcamentos(lancado.body, itemId)[0];
    const escolhe = await escolherVencedor(
        tokenGestor,
        cotacao.id,
        itemId,
        orcamento.id
    );

    if (escolhe.statusCode !== 200) {
        throw new Error(
            `Não finalizou cotação: ${escolhe.statusCode} ${JSON.stringify(escolhe.body)}`
        );
    }

    return {
        cotacao: escolhe.body,
        itemId,
        orcamentoId: orcamento.id
    };
}

async function inativarFornecedor(id) {
    const res = await request(app)
        .patch(`/fornecedores/${id}/status`)
        .set('Authorization', `Bearer ${tokenGestor}`);

    if (res.statusCode !== 200) {
        throw new Error(
            `Não inativou fornecedor: ${res.statusCode} ${JSON.stringify(res.body)}`
        );
    }

    return res.body.data || res.body;
}

describe('Orçamentos no Item da Cotação', () => {

    it('gestor lança um orçamento e o detalhe lista a linha sob o item, sem vencedor, com status em_andamento', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Seringa 10ml',
                quantidade: 2,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        expect(cotacao.status).toBe('aberta');

        const res = await request(app)
            .post(`/cotacoes/${cotacao.id}/itens/${itemId}/orcamentos`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send([
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                }
            ]);

        expect(res.statusCode).toBe(201);
        expect(res.body.status).toBe('em_andamento');

        const orcamentos = itemOrcamentos(res.body, itemId);

        expect(orcamentos).toHaveLength(1);
        expect(orcamentos[0]).toEqual(
            expect.objectContaining({
                fornecedor_id: fornecedorA.id,
                fornecedor_nome: 'Farmacia Central',
                valor_unitario: 10,
                valor_total: 20,
                selecionada: false
            })
        );
        expect(orcamentos[0]).toHaveProperty('id');

        const detalhe = await request(app)
            .get(`/cotacoes/${cotacao.id}`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(detalhe.statusCode).toBe(200);
        expect(detalhe.body.status).toBe('em_andamento');
        expect(itemOrcamentos(detalhe.body, itemId)).toHaveLength(1);
        expect(itemOrcamentos(detalhe.body, itemId)[0].selecionada).toBe(false);
    });

    it('quem já lê a cotação vê os orçamentos aninhados; sem token a rota recusa', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item leitura',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        await postOrcamentos(tokenGestor, cotacao.id, itemId, [
            {
                fornecedor_id: fornecedorA.id,
                valor_unitario: 7.5
            }
        ]);

        const operador = await request(app)
            .get(`/cotacoes/${cotacao.id}`)
            .set('Authorization', `Bearer ${tokenOperador}`);

        expect(operador.statusCode).toBe(200);
        expect(itemOrcamentos(operador.body, itemId)).toHaveLength(1);
        expect(itemOrcamentos(operador.body, itemId)[0].fornecedor_nome)
            .toBe('Farmacia Central');

        const semToken = await postOrcamentos(
            null,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorB.id,
                    valor_unitario: 8
                }
            ]
        );

        expect(semToken.statusCode).toBe(401);

        const getSemToken = await request(app)
            .get(`/cotacoes/${cotacao.id}`);

        expect(getSemToken.statusCode).toBe(401);
    });

    it('operador não grava orçamento; só gestor cria', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item gestor',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        const res = await postOrcamentos(
            tokenOperador,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                }
            ]
        );

        expect(res.statusCode).toBe(403);

        const detalhe = await request(app)
            .get(`/cotacoes/${cotacao.id}`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(detalhe.body.status).toBe('aberta');
        expect(itemOrcamentos(detalhe.body, itemId)).toHaveLength(0);
    });

    it('segundo orçamento do mesmo fornecedor no mesmo item é recusado; no outro item é aceito', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item um',
                quantidade: 2,
                unidade: 'UN'
            },
            {
                descricao: 'Item dois',
                quantidade: 3,
                unidade: 'UN'
            }
        ]);

        const itemUm = cotacao.cotacao_itens[0].id;
        const itemDois = cotacao.cotacao_itens[1].id;

        const primeiro = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemUm,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                }
            ]
        );

        expect(primeiro.statusCode).toBe(201);

        const duplicado = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemUm,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 12
                }
            ]
        );

        expect(duplicado.statusCode).toBe(400);
        expect(itemOrcamentos(duplicado.body, itemUm)).toHaveLength(0);

        const outroItem = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemDois,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 4
                }
            ]
        );

        expect(outroItem.statusCode).toBe(201);
        expect(itemOrcamentos(outroItem.body, itemUm)).toHaveLength(1);
        expect(itemOrcamentos(outroItem.body, itemUm)[0].valor_unitario)
            .toBe(10);
        expect(itemOrcamentos(outroItem.body, itemDois)).toHaveLength(1);
        expect(itemOrcamentos(outroItem.body, itemDois)[0]).toEqual(
            expect.objectContaining({
                fornecedor_id: fornecedorA.id,
                valor_unitario: 4,
                valor_total: 12,
                selecionada: false
            })
        );
    });

    it('cotação com vários itens aceita orçamento em só alguns; o item sem preço fica sem linhas', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Com preço',
                quantidade: 1,
                unidade: 'UN'
            },
            {
                descricao: 'Sem preço',
                quantidade: 5,
                unidade: 'CX'
            }
        ]);

        const comPreco = cotacao.cotacao_itens[0].id;
        const semPreco = cotacao.cotacao_itens[1].id;

        const res = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            comPreco,
            [
                {
                    fornecedor_id: fornecedorB.id,
                    valor_unitario: 15
                }
            ]
        );

        expect(res.statusCode).toBe(201);
        expect(itemOrcamentos(res.body, comPreco)).toHaveLength(1);
        expect(itemOrcamentos(res.body, semPreco)).toHaveLength(0);
    });

    it('valor unitário inválido, fornecedor inexistente ou inativo e item de outra cotação não persistem', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item validação',
                quantidade: 2,
                unidade: 'UN'
            }
        ]);

        const outra = await criarCotacao([
            {
                descricao: 'Item alheio',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;
        const itemAlheio = outra.cotacao_itens[0].id;

        const zero = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 0
                }
            ]
        );

        expect(zero.statusCode).toBe(400);

        const negativo = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: -1
                }
            ]
        );

        expect(negativo.statusCode).toBe(400);

        const inexistente = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: '00000000-0000-4000-8000-000000000000',
                    valor_unitario: 10
                }
            ]
        );

        expect(inexistente.statusCode).toBe(400);

        const inativo = await criarFornecedor({
            razao_social: `Fornecedor inativo ${Date.now()}`,
            nome_fantasia: 'Inativo',
            cnpj: `${Date.now()}9`
        });

        await inativarFornecedor(inativo.id);

        const fornecedorInativo = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: inativo.id,
                    valor_unitario: 10
                }
            ]
        );

        expect(fornecedorInativo.statusCode).toBe(400);

        const itemErrado = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemAlheio,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                }
            ]
        );

        expect(itemErrado.statusCode).toBe(400);

        const detalhe = await request(app)
            .get(`/cotacoes/${cotacao.id}`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(detalhe.body.status).toBe('aberta');
        expect(itemOrcamentos(detalhe.body, itemId)).toHaveLength(0);
    });

    it('cotação finalizada, cancelada ou inativa recusa orçamento novo', async () => {
        const itens = [
            {
                descricao: 'Item terminal',
                quantidade: 1,
                unidade: 'UN'
            }
        ];

        const criadaFinalizada = await criarCotacao(itens);
        const { cotacao: finalizada, itemId: itemFinalizada } =
            await tornarFinalizada(criadaFinalizada);

        const recusaFinalizada = await postOrcamentos(
            tokenGestor,
            finalizada.id,
            itemFinalizada,
            [
                {
                    fornecedor_id: fornecedorD.id,
                    valor_unitario: 10
                }
            ]
        );

        expect(recusaFinalizada.statusCode).toBe(400);

        const cancelada = await criarCotacao(itens);

        const del = await request(app)
            .delete(`/cotacoes/${cancelada.id}`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                motivo_cancelamento: 'Cancelada para recusar orçamento'
            });

        expect(del.statusCode).toBe(200);

        const recusaCancelada = await postOrcamentos(
            tokenGestor,
            cancelada.id,
            cancelada.cotacao_itens[0].id,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                }
            ]
        );

        expect(recusaCancelada.statusCode).toBe(400);

        const inativa = await criarCotacao(itens);

        const toggle = await request(app)
            .patch(`/cotacoes/${inativa.id}/status`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(toggle.statusCode).toBe(200);

        const recusaInativa = await postOrcamentos(
            tokenGestor,
            inativa.id,
            inativa.cotacao_itens[0].id,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                }
            ]
        );

        expect(recusaInativa.statusCode).toBe(400);
    });

    it('data da proposta omitida no envio grava o dia de hoje no servidor', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item data',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        const res = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 9
                }
            ]
        );

        expect(res.statusCode).toBe(201);

        const propostas = await request(app)
            .get('/cotacao-propostas')
            .query({ cotacao_id: cotacao.id })
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(propostas.statusCode).toBe(200);

        const envelope = (propostas.body || []).find(
            (proposta) => proposta.cotacao_id === cotacao.id
        );

        expect(envelope).toBeTruthy();
        expect(String(envelope.data_proposta).slice(0, 10))
            .toBe(new Date().toISOString().slice(0, 10));
        expect(envelope.selecionada).toBe(false);
    });

    it('lote válido grava todas as linhas e o detalhe lista todas com status derivado', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item lote',
                quantidade: 2,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        const res = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                },
                {
                    fornecedor_id: fornecedorB.id,
                    valor_unitario: 12.5
                }
            ]
        );

        expect(res.statusCode).toBe(201);
        expect(res.body.status).toBe('em_andamento');

        const orcamentos = itemOrcamentos(res.body, itemId);

        expect(orcamentos).toHaveLength(2);
        expect(orcamentos).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    fornecedor_id: fornecedorA.id,
                    fornecedor_nome: 'Farmacia Central',
                    valor_unitario: 10,
                    valor_total: 20,
                    selecionada: false
                }),
                expect.objectContaining({
                    fornecedor_id: fornecedorB.id,
                    fornecedor_nome: 'Distribuidora Norte',
                    valor_unitario: 12.5,
                    valor_total: 25,
                    selecionada: false
                })
            ])
        );

        const detalhe = await request(app)
            .get(`/cotacoes/${cotacao.id}`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(detalhe.statusCode).toBe(200);
        expect(detalhe.body.status).toBe('em_andamento');
        expect(itemOrcamentos(detalhe.body, itemId)).toHaveLength(2);
    });

    it('duplicata de fornecedor no payload ou contra linhas já gravadas recusa o lote e não persiste nada novo', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item duplicata',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        const repetidoNoPayload = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                },
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 11
                }
            ]
        );

        expect(repetidoNoPayload.statusCode).toBe(400);

        const aposPayload = await request(app)
            .get(`/cotacoes/${cotacao.id}`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(aposPayload.body.status).toBe('aberta');
        expect(itemOrcamentos(aposPayload.body, itemId)).toHaveLength(0);

        const primeiro = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                }
            ]
        );

        expect(primeiro.statusCode).toBe(201);

        const contraExistente = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorB.id,
                    valor_unitario: 8
                },
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 9
                }
            ]
        );

        expect(contraExistente.statusCode).toBe(400);

        const detalhe = await request(app)
            .get(`/cotacoes/${cotacao.id}`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(detalhe.body.status).toBe('em_andamento');
        expect(itemOrcamentos(detalhe.body, itemId)).toHaveLength(1);
        expect(itemOrcamentos(detalhe.body, itemId)[0]).toEqual(
            expect.objectContaining({
                fornecedor_id: fornecedorA.id,
                valor_unitario: 10
            })
        );
    });

    it('cotação de um item cujo lote completa três fornecedores distintos responde pronta_para_analise', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item único',
                quantidade: 3,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        expect(cotacao.status).toBe('aberta');

        const res = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 5
                },
                {
                    fornecedor_id: fornecedorB.id,
                    valor_unitario: 6
                },
                {
                    fornecedor_id: fornecedorC.id,
                    valor_unitario: 7
                }
            ]
        );

        expect(res.statusCode).toBe(201);
        expect(res.body.status).toBe('pronta_para_analise');
        expect(itemOrcamentos(res.body, itemId)).toHaveLength(3);
        expect(
            itemOrcamentos(res.body, itemId).every(
                (orcamento) => orcamento.selecionada === false
            )
        ).toBe(true);

        const detalhe = await request(app)
            .get(`/cotacoes/${cotacao.id}`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(detalhe.body.status).toBe('pronta_para_analise');
        expect(itemOrcamentos(detalhe.body, itemId)).toHaveLength(3);
    });

    it('quarto e quinto orçamento no mesmo item são aceitos depois do mínimo', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item extra',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        const minimo = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 4
                },
                {
                    fornecedor_id: fornecedorB.id,
                    valor_unitario: 5
                },
                {
                    fornecedor_id: fornecedorC.id,
                    valor_unitario: 6
                }
            ]
        );

        expect(minimo.statusCode).toBe(201);
        expect(minimo.body.status).toBe('pronta_para_analise');

        const quarto = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorD.id,
                    valor_unitario: 7
                }
            ]
        );

        expect(quarto.statusCode).toBe(201);
        expect(quarto.body.status).toBe('pronta_para_analise');
        expect(itemOrcamentos(quarto.body, itemId)).toHaveLength(4);
        expect(itemOrcamentos(quarto.body, itemId)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    fornecedor_id: fornecedorD.id,
                    fornecedor_nome: 'Farma Leste',
                    valor_unitario: 7,
                    valor_total: 7,
                    selecionada: false
                })
            ])
        );

        const quinto = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorE.id,
                    valor_unitario: 8
                }
            ]
        );

        expect(quinto.statusCode).toBe(201);
        expect(quinto.body.status).toBe('pronta_para_analise');
        expect(itemOrcamentos(quinto.body, itemId)).toHaveLength(5);
    });

    it('lote com valor inválido ou fornecedor inativo não persiste nenhuma linha', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item validação lote',
                quantidade: 2,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        const valorZero = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                },
                {
                    fornecedor_id: fornecedorB.id,
                    valor_unitario: 0
                }
            ]
        );

        expect(valorZero.statusCode).toBe(400);

        const inativo = await criarFornecedor({
            razao_social: `Fornecedor lote inativo ${Date.now()}`,
            nome_fantasia: 'Lote Inativo',
            cnpj: `${Date.now()}8`
        });

        await inativarFornecedor(inativo.id);

        const fornecedorInativo = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                },
                {
                    fornecedor_id: inativo.id,
                    valor_unitario: 11
                }
            ]
        );

        expect(fornecedorInativo.statusCode).toBe(400);

        const detalhe = await request(app)
            .get(`/cotacoes/${cotacao.id}`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(detalhe.body.status).toBe('aberta');
        expect(itemOrcamentos(detalhe.body, itemId)).toHaveLength(0);
    });

    it('gestor corrige o valor unitário; o total recalcula e o fornecedor permanece', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item correção',
                quantidade: 2,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        const criado = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                }
            ]
        );

        expect(criado.statusCode).toBe(201);

        const orcamentoId = itemOrcamentos(criado.body, itemId)[0].id;

        const res = await putOrcamento(
            tokenGestor,
            cotacao.id,
            itemId,
            orcamentoId,
            {
                valor_unitario: 15
            }
        );

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('em_andamento');

        const orcamentos = itemOrcamentos(res.body, itemId);

        expect(orcamentos).toHaveLength(1);
        expect(orcamentos[0]).toEqual(
            expect.objectContaining({
                id: orcamentoId,
                fornecedor_id: fornecedorA.id,
                fornecedor_nome: 'Farmacia Central',
                valor_unitario: 15,
                valor_total: 30,
                selecionada: false
            })
        );

        const detalhe = await request(app)
            .get(`/cotacoes/${cotacao.id}`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(detalhe.statusCode).toBe(200);
        expect(itemOrcamentos(detalhe.body, itemId)[0]).toEqual(
            expect.objectContaining({
                fornecedor_id: fornecedorA.id,
                valor_unitario: 15,
                valor_total: 30
            })
        );
    });

    it('tentativa de alterar o fornecedor do orçamento é recusada', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item fornecedor fixo',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        const criado = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                }
            ]
        );

        expect(criado.statusCode).toBe(201);

        const orcamento = itemOrcamentos(criado.body, itemId)[0];

        const res = await putOrcamento(
            tokenGestor,
            cotacao.id,
            itemId,
            orcamento.id,
            {
                fornecedor_id: fornecedorB.id,
                valor_unitario: 12
            }
        );

        expect(res.statusCode).toBe(400);

        const detalhe = await request(app)
            .get(`/cotacoes/${cotacao.id}`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(itemOrcamentos(detalhe.body, itemId)).toHaveLength(1);
        expect(itemOrcamentos(detalhe.body, itemId)[0]).toEqual(
            expect.objectContaining({
                id: orcamento.id,
                fornecedor_id: fornecedorA.id,
                valor_unitario: 10,
                valor_total: 10
            })
        );
    });

    it('valor unitário zero ou negativo na correção é recusado e o lançamento permanece', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item valor inválido',
                quantidade: 2,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        const criado = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                }
            ]
        );

        const orcamentoId = itemOrcamentos(criado.body, itemId)[0].id;

        const zero = await putOrcamento(
            tokenGestor,
            cotacao.id,
            itemId,
            orcamentoId,
            {
                valor_unitario: 0
            }
        );

        expect(zero.statusCode).toBe(400);

        const negativo = await putOrcamento(
            tokenGestor,
            cotacao.id,
            itemId,
            orcamentoId,
            {
                valor_unitario: -3
            }
        );

        expect(negativo.statusCode).toBe(400);

        const detalhe = await request(app)
            .get(`/cotacoes/${cotacao.id}`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(itemOrcamentos(detalhe.body, itemId)[0]).toEqual(
            expect.objectContaining({
                valor_unitario: 10,
                valor_total: 20
            })
        );
    });

    it('gestor apaga um orçamento; a linha some e o envelope sem linhas é removido', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item apagar',
                quantidade: 2,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        const criado = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                },
                {
                    fornecedor_id: fornecedorB.id,
                    valor_unitario: 8
                }
            ]
        );

        expect(criado.statusCode).toBe(201);

        const orcamentoA = itemOrcamentos(criado.body, itemId).find(
            (orcamento) => orcamento.fornecedor_id === fornecedorA.id
        );

        const res = await deleteOrcamento(
            tokenGestor,
            cotacao.id,
            itemId,
            orcamentoA.id
        );

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('em_andamento');
        expect(itemOrcamentos(res.body, itemId)).toHaveLength(1);
        expect(itemOrcamentos(res.body, itemId)[0]).toEqual(
            expect.objectContaining({
                fornecedor_id: fornecedorB.id,
                valor_unitario: 8,
                valor_total: 16
            })
        );

        const propostas = await request(app)
            .get('/cotacao-propostas')
            .query({ cotacao_id: cotacao.id })
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(propostas.statusCode).toBe(200);

        const envelopes = (propostas.body || []).filter(
            (proposta) => proposta.cotacao_id === cotacao.id
        );

        expect(envelopes).toHaveLength(1);
        expect(envelopes[0].fornecedor_id).toBe(fornecedorB.id);
        expect(envelopes[0].cotacao_proposta_itens).toHaveLength(1);
    });

    it('apagar o último orçamento da cotação devolve status aberta', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item último',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        const criado = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 9
                }
            ]
        );

        expect(criado.statusCode).toBe(201);
        expect(criado.body.status).toBe('em_andamento');

        const orcamentoId = itemOrcamentos(criado.body, itemId)[0].id;

        const res = await deleteOrcamento(
            tokenGestor,
            cotacao.id,
            itemId,
            orcamentoId
        );

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('aberta');
        expect(itemOrcamentos(res.body, itemId)).toHaveLength(0);

        const detalhe = await request(app)
            .get(`/cotacoes/${cotacao.id}`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(detalhe.statusCode).toBe(200);
        expect(detalhe.body.status).toBe('aberta');
        expect(itemOrcamentos(detalhe.body, itemId)).toHaveLength(0);

        const propostas = await request(app)
            .get('/cotacao-propostas')
            .query({ cotacao_id: cotacao.id })
            .set('Authorization', `Bearer ${tokenGestor}`);

        const envelopes = (propostas.body || []).filter(
            (proposta) => proposta.cotacao_id === cotacao.id
        );

        expect(envelopes).toHaveLength(0);
    });

    it('operador leva 403 ao editar e ao apagar orçamento', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item operador',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        const criado = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                }
            ]
        );

        const orcamentoId = itemOrcamentos(criado.body, itemId)[0].id;

        const editar = await putOrcamento(
            tokenOperador,
            cotacao.id,
            itemId,
            orcamentoId,
            {
                valor_unitario: 20
            }
        );

        expect(editar.statusCode).toBe(403);

        const apagar = await deleteOrcamento(
            tokenOperador,
            cotacao.id,
            itemId,
            orcamentoId
        );

        expect(apagar.statusCode).toBe(403);

        const detalhe = await request(app)
            .get(`/cotacoes/${cotacao.id}`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(itemOrcamentos(detalhe.body, itemId)).toHaveLength(1);
        expect(itemOrcamentos(detalhe.body, itemId)[0]).toEqual(
            expect.objectContaining({
                valor_unitario: 10,
                valor_total: 10
            })
        );
    });

    it('cotação finalizada, cancelada ou inativa recusa editar e apagar orçamento', async () => {
        const itens = [
            {
                descricao: 'Item terminal',
                quantidade: 1,
                unidade: 'UN'
            }
        ];

        const criadaFinalizada = await criarCotacao(itens);
        const {
            cotacao: finalizada,
            itemId: itemFinalizada,
            orcamentoId: idFinalizada
        } = await tornarFinalizada(criadaFinalizada);

        const editarFinalizada = await putOrcamento(
            tokenGestor,
            finalizada.id,
            itemFinalizada,
            idFinalizada,
            {
                valor_unitario: 20
            }
        );

        expect(editarFinalizada.statusCode).toBe(400);

        const apagarFinalizada = await deleteOrcamento(
            tokenGestor,
            finalizada.id,
            itemFinalizada,
            idFinalizada
        );

        expect(apagarFinalizada.statusCode).toBe(400);

        const cancelada = await criarCotacao(itens);
        const itemCancelada = cancelada.cotacao_itens[0].id;

        const orcamentoCancelada = await postOrcamentos(
            tokenGestor,
            cancelada.id,
            itemCancelada,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                }
            ]
        );

        const idCancelada = itemOrcamentos(
            orcamentoCancelada.body,
            itemCancelada
        )[0].id;

        const del = await request(app)
            .delete(`/cotacoes/${cancelada.id}`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                motivo_cancelamento: 'Cancelada para recusar correção'
            });

        expect(del.statusCode).toBe(200);

        const editarCancelada = await putOrcamento(
            tokenGestor,
            cancelada.id,
            itemCancelada,
            idCancelada,
            {
                valor_unitario: 20
            }
        );

        expect(editarCancelada.statusCode).toBe(400);

        const apagarCancelada = await deleteOrcamento(
            tokenGestor,
            cancelada.id,
            itemCancelada,
            idCancelada
        );

        expect(apagarCancelada.statusCode).toBe(400);

        const inativa = await criarCotacao(itens);
        const itemInativa = inativa.cotacao_itens[0].id;

        const orcamentoInativa = await postOrcamentos(
            tokenGestor,
            inativa.id,
            itemInativa,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                }
            ]
        );

        const idInativa = itemOrcamentos(
            orcamentoInativa.body,
            itemInativa
        )[0].id;

        const toggle = await request(app)
            .patch(`/cotacoes/${inativa.id}/status`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(toggle.statusCode).toBe(200);

        const editarInativa = await putOrcamento(
            tokenGestor,
            inativa.id,
            itemInativa,
            idInativa,
            {
                valor_unitario: 20
            }
        );

        expect(editarInativa.statusCode).toBe(400);

        const apagarInativa = await deleteOrcamento(
            tokenGestor,
            inativa.id,
            itemInativa,
            idInativa
        );

        expect(apagarInativa.statusCode).toBe(400);
    });

    it('gestor escolhe um orçamento como vencedor no item com três lançamentos e a cotação de um item fica finalizada', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item vencedor único',
                quantidade: 2,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        const lancado = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                },
                {
                    fornecedor_id: fornecedorB.id,
                    valor_unitario: 11
                },
                {
                    fornecedor_id: fornecedorC.id,
                    valor_unitario: 12
                }
            ]
        );

        expect(lancado.statusCode).toBe(201);
        expect(lancado.body.status).toBe('pronta_para_analise');

        const vencedor = itemOrcamentos(lancado.body, itemId).find(
            (orcamento) => orcamento.fornecedor_id === fornecedorA.id
        );

        const res = await escolherVencedor(
            tokenGestor,
            cotacao.id,
            itemId,
            vencedor.id
        );

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('finalizada');

        const orcamentos = itemOrcamentos(res.body, itemId);

        expect(orcamentos).toHaveLength(3);
        expect(
            orcamentos.find((orcamento) => orcamento.id === vencedor.id)
                .selecionada
        ).toBe(true);
        expect(
            orcamentos.filter((orcamento) => orcamento.selecionada === true)
        ).toHaveLength(1);

        const detalhe = await request(app)
            .get(`/cotacoes/${cotacao.id}`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(detalhe.statusCode).toBe(200);
        expect(detalhe.body.status).toBe('finalizada');
        expect(
            itemOrcamentos(detalhe.body, itemId).find(
                (orcamento) => orcamento.id === vencedor.id
            ).selecionada
        ).toBe(true);

        const propostas = await request(app)
            .get('/cotacao-propostas')
            .query({ cotacao_id: cotacao.id })
            .set('Authorization', `Bearer ${tokenGestor}`);

        const envelopes = (propostas.body || []).filter(
            (proposta) => proposta.cotacao_id === cotacao.id
        );

        expect(envelopes.length).toBeGreaterThan(0);
        expect(
            envelopes.every((envelope) => envelope.selecionada === false)
        ).toBe(true);
    });

    it('definir vencedor fica recusado com menos de três orçamentos no item', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item ainda incompleto',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        const dois = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                },
                {
                    fornecedor_id: fornecedorB.id,
                    valor_unitario: 11
                }
            ]
        );

        expect(dois.statusCode).toBe(201);

        const orcamentoId = itemOrcamentos(dois.body, itemId)[0].id;

        const res = await escolherVencedor(
            tokenGestor,
            cotacao.id,
            itemId,
            orcamentoId
        );

        expect(res.statusCode).toBe(400);
        expect(itemOrcamentos(dois.body, itemId).every(
            (orcamento) => orcamento.selecionada === false
        )).toBe(true);

        const detalhe = await request(app)
            .get(`/cotacoes/${cotacao.id}`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(detalhe.body.status).toBe('em_andamento');
        expect(
            itemOrcamentos(detalhe.body, itemId).every(
                (orcamento) => orcamento.selecionada === false
            )
        ).toBe(true);
    });

    it('escolher outro vencedor no mesmo item desmarca o anterior; itens distintos aceitam vencedores distintos', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item A',
                quantidade: 1,
                unidade: 'UN'
            },
            {
                descricao: 'Item B',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);

        const itemA = cotacao.cotacao_itens[0].id;
        const itemB = cotacao.cotacao_itens[1].id;

        const tres = [
            {
                fornecedor_id: fornecedorA.id,
                valor_unitario: 10
            },
            {
                fornecedor_id: fornecedorB.id,
                valor_unitario: 11
            },
            {
                fornecedor_id: fornecedorC.id,
                valor_unitario: 12
            }
        ];

        const lancadoA = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemA,
            tres
        );
        const lancadoB = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemB,
            tres
        );

        expect(lancadoA.statusCode).toBe(201);
        expect(lancadoB.statusCode).toBe(201);

        const primeiroA = itemOrcamentos(lancadoA.body, itemA).find(
            (orcamento) => orcamento.fornecedor_id === fornecedorA.id
        );
        const segundoA = itemOrcamentos(lancadoA.body, itemA).find(
            (orcamento) => orcamento.fornecedor_id === fornecedorB.id
        );
        const vencedorB = itemOrcamentos(lancadoB.body, itemB).find(
            (orcamento) => orcamento.fornecedor_id === fornecedorC.id
        );

        const escolheA = await escolherVencedor(
            tokenGestor,
            cotacao.id,
            itemA,
            primeiroA.id
        );

        expect(escolheA.statusCode).toBe(200);
        expect(escolheA.body.status).toBe('pronta_para_analise');
        expect(
            itemOrcamentos(escolheA.body, itemA).find(
                (orcamento) => orcamento.id === primeiroA.id
            ).selecionada
        ).toBe(true);

        const trocaA = await escolherVencedor(
            tokenGestor,
            cotacao.id,
            itemA,
            segundoA.id
        );

        expect(trocaA.statusCode).toBe(200);
        expect(
            itemOrcamentos(trocaA.body, itemA).find(
                (orcamento) => orcamento.id === segundoA.id
            ).selecionada
        ).toBe(true);
        expect(
            itemOrcamentos(trocaA.body, itemA).find(
                (orcamento) => orcamento.id === primeiroA.id
            ).selecionada
        ).toBe(false);

        const escolheB = await escolherVencedor(
            tokenGestor,
            cotacao.id,
            itemB,
            vencedorB.id
        );

        expect(escolheB.statusCode).toBe(200);
        expect(escolheB.body.status).toBe('finalizada');
        expect(
            itemOrcamentos(escolheB.body, itemA).find(
                (orcamento) => orcamento.id === segundoA.id
            ).selecionada
        ).toBe(true);
        expect(
            itemOrcamentos(escolheB.body, itemB).find(
                (orcamento) => orcamento.id === vencedorB.id
            ).selecionada
        ).toBe(true);
        expect(
            itemOrcamentos(escolheB.body, itemB).filter(
                (orcamento) => orcamento.selecionada === true
            )
        ).toHaveLength(1);
    });

    it('dois itens com três orçamentos no A e um no B ficam em_andamento; vencedor só no A', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item A',
                quantidade: 1,
                unidade: 'UN'
            },
            {
                descricao: 'Item B',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);

        const itemA = cotacao.cotacao_itens[0].id;
        const itemB = cotacao.cotacao_itens[1].id;

        const lancadoA = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemA,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                },
                {
                    fornecedor_id: fornecedorB.id,
                    valor_unitario: 11
                },
                {
                    fornecedor_id: fornecedorC.id,
                    valor_unitario: 12
                }
            ]
        );
        const lancadoB = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemB,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 8
                }
            ]
        );

        expect(lancadoA.statusCode).toBe(201);
        expect(lancadoB.statusCode).toBe(201);

        const vencedorA = itemOrcamentos(lancadoA.body, itemA)[0];
        const orcamentoB = itemOrcamentos(lancadoB.body, itemB)[0];

        const escolheA = await escolherVencedor(
            tokenGestor,
            cotacao.id,
            itemA,
            vencedorA.id
        );

        expect(escolheA.statusCode).toBe(200);
        expect(escolheA.body.status).toBe('em_andamento');
        expect(
            itemOrcamentos(escolheA.body, itemA).find(
                (orcamento) => orcamento.id === vencedorA.id
            ).selecionada
        ).toBe(true);

        const escolheB = await escolherVencedor(
            tokenGestor,
            cotacao.id,
            itemB,
            orcamentoB.id
        );

        expect(escolheB.statusCode).toBe(400);
        expect(
            itemOrcamentos(escolheA.body, itemB).every(
                (orcamento) => orcamento.selecionada === false
            )
        ).toBe(true);
    });

    it('dois itens com três orçamentos cada e vencedor só no A ficam pronta_para_analise', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item A',
                quantidade: 1,
                unidade: 'UN'
            },
            {
                descricao: 'Item B',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);

        const itemA = cotacao.cotacao_itens[0].id;
        const itemB = cotacao.cotacao_itens[1].id;

        const tres = [
            {
                fornecedor_id: fornecedorA.id,
                valor_unitario: 10
            },
            {
                fornecedor_id: fornecedorB.id,
                valor_unitario: 11
            },
            {
                fornecedor_id: fornecedorC.id,
                valor_unitario: 12
            }
        ];

        await postOrcamentos(tokenGestor, cotacao.id, itemA, tres);
        const lancadoB = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemB,
            tres
        );

        expect(lancadoB.statusCode).toBe(201);
        expect(lancadoB.body.status).toBe('pronta_para_analise');

        const vencedorA = itemOrcamentos(lancadoB.body, itemA).find(
            (orcamento) => orcamento.fornecedor_id === fornecedorA.id
        );

        const res = await escolherVencedor(
            tokenGestor,
            cotacao.id,
            itemA,
            vencedorA.id
        );

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('pronta_para_analise');
        expect(
            itemOrcamentos(res.body, itemA).filter(
                (orcamento) => orcamento.selecionada === true
            )
        ).toHaveLength(1);
        expect(
            itemOrcamentos(res.body, itemB).every(
                (orcamento) => orcamento.selecionada === false
            )
        ).toBe(true);
    });

    it('apagar até o item ter menos de três zera o vencedor daquele item e recalcula o status', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item A',
                quantidade: 1,
                unidade: 'UN'
            },
            {
                descricao: 'Item B',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);

        const itemA = cotacao.cotacao_itens[0].id;
        const itemB = cotacao.cotacao_itens[1].id;

        const tres = [
            {
                fornecedor_id: fornecedorA.id,
                valor_unitario: 10
            },
            {
                fornecedor_id: fornecedorB.id,
                valor_unitario: 11
            },
            {
                fornecedor_id: fornecedorC.id,
                valor_unitario: 12
            }
        ];

        await postOrcamentos(tokenGestor, cotacao.id, itemA, tres);
        const lancadoB = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemB,
            tres
        );

        const vencedorA = itemOrcamentos(lancadoB.body, itemA).find(
            (orcamento) => orcamento.fornecedor_id === fornecedorA.id
        );
        const outroA = itemOrcamentos(lancadoB.body, itemA).find(
            (orcamento) => orcamento.fornecedor_id === fornecedorB.id
        );

        const escolheA = await escolherVencedor(
            tokenGestor,
            cotacao.id,
            itemA,
            vencedorA.id
        );

        expect(escolheA.statusCode).toBe(200);
        expect(escolheA.body.status).toBe('pronta_para_analise');

        const res = await deleteOrcamento(
            tokenGestor,
            cotacao.id,
            itemA,
            outroA.id
        );

        expect(res.statusCode).toBe(200);
        expect(res.body.status).toBe('em_andamento');
        expect(itemOrcamentos(res.body, itemA)).toHaveLength(2);
        expect(
            itemOrcamentos(res.body, itemA).every(
                (orcamento) => orcamento.selecionada === false
            )
        ).toBe(true);
        expect(
            itemOrcamentos(res.body, itemB).every(
                (orcamento) => orcamento.selecionada === false
            )
        ).toBe(true);
    });

    it('operador leva 403 ao definir vencedor; cotação terminal e linha de outro item são recusadas', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item A',
                quantidade: 1,
                unidade: 'UN'
            },
            {
                descricao: 'Item B',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);

        const itemA = cotacao.cotacao_itens[0].id;
        const itemB = cotacao.cotacao_itens[1].id;

        const tres = [
            {
                fornecedor_id: fornecedorA.id,
                valor_unitario: 10
            },
            {
                fornecedor_id: fornecedorB.id,
                valor_unitario: 11
            },
            {
                fornecedor_id: fornecedorC.id,
                valor_unitario: 12
            }
        ];

        await postOrcamentos(tokenGestor, cotacao.id, itemA, tres);
        const lancadoB = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemB,
            tres
        );

        const orcamentoA = itemOrcamentos(lancadoB.body, itemA)[0];
        const orcamentoB = itemOrcamentos(lancadoB.body, itemB)[0];

        const operador = await escolherVencedor(
            tokenOperador,
            cotacao.id,
            itemA,
            orcamentoA.id
        );

        expect(operador.statusCode).toBe(403);

        const linhaErrada = await escolherVencedor(
            tokenGestor,
            cotacao.id,
            itemA,
            orcamentoB.id
        );

        expect(linhaErrada.statusCode).toBe(400);

        const cancelada = await criarCotacao([
            {
                descricao: 'Item cancelado',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);
        const itemCancelada = cancelada.cotacao_itens[0].id;

        const lancadoCancelada = await postOrcamentos(
            tokenGestor,
            cancelada.id,
            itemCancelada,
            tres
        );
        const orcamentoCancelada = itemOrcamentos(
            lancadoCancelada.body,
            itemCancelada
        )[0];

        const del = await request(app)
            .delete(`/cotacoes/${cancelada.id}`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                motivo_cancelamento: 'Cancelada para recusar vencedor'
            });

        expect(del.statusCode).toBe(200);

        const vencedorCancelada = await escolherVencedor(
            tokenGestor,
            cancelada.id,
            itemCancelada,
            orcamentoCancelada.id
        );

        expect(vencedorCancelada.statusCode).toBe(400);

        const criadaFinalizada = await criarCotacao([
            {
                descricao: 'Item finalizado',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);
        const {
            cotacao: finalizada,
            itemId: itemFinalizada
        } = await tornarFinalizada(criadaFinalizada);
        const outroOrcamento = itemOrcamentos(
            finalizada,
            itemFinalizada
        ).find((orcamento) => orcamento.selecionada !== true);

        const vencedorFinalizada = await escolherVencedor(
            tokenGestor,
            finalizada.id,
            itemFinalizada,
            outroOrcamento.id
        );

        expect(vencedorFinalizada.statusCode).toBe(400);
        expect(
            itemOrcamentos(lancadoB.body, itemA).every(
                (orcamento) => orcamento.selecionada === false
            )
        ).toBe(true);
    });

    it('cotação finalizada pela escolha do vencedor recusa troca', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item único finalizado',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        const lancado = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                },
                {
                    fornecedor_id: fornecedorB.id,
                    valor_unitario: 11
                },
                {
                    fornecedor_id: fornecedorC.id,
                    valor_unitario: 12
                }
            ]
        );

        const primeiro = itemOrcamentos(lancado.body, itemId).find(
            (orcamento) => orcamento.fornecedor_id === fornecedorA.id
        );
        const segundo = itemOrcamentos(lancado.body, itemId).find(
            (orcamento) => orcamento.fornecedor_id === fornecedorB.id
        );

        const escolhe = await escolherVencedor(
            tokenGestor,
            cotacao.id,
            itemId,
            primeiro.id
        );

        expect(escolhe.statusCode).toBe(200);
        expect(escolhe.body.status).toBe('finalizada');

        const troca = await escolherVencedor(
            tokenGestor,
            cotacao.id,
            itemId,
            segundo.id
        );

        expect(troca.statusCode).toBe(400);
        expect(
            itemOrcamentos(escolhe.body, itemId).find(
                (orcamento) => orcamento.id === primeiro.id
            ).selecionada
        ).toBe(true);
    });

    it('incluir item sem orçamentos numa cotação pronta_para_analise volta para em_andamento e mantém vencedores', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item A',
                quantidade: 2,
                unidade: 'UN'
            },
            {
                descricao: 'Item B',
                quantidade: 2,
                unidade: 'UN'
            }
        ]);

        const itemA = cotacao.cotacao_itens[0].id;
        const itemB = cotacao.cotacao_itens[1].id;
        const tres = tresOrcamentos();

        await postOrcamentos(tokenGestor, cotacao.id, itemA, tres);
        const lancadoB = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemB,
            tres
        );

        const vencedorA = itemOrcamentos(lancadoB.body, itemA).find(
            (orcamento) => orcamento.fornecedor_id === fornecedorA.id
        );

        const escolheA = await escolherVencedor(
            tokenGestor,
            cotacao.id,
            itemA,
            vencedorA.id
        );

        expect(escolheA.statusCode).toBe(200);
        expect(escolheA.body.status).toBe('pronta_para_analise');

        const res = await postItem(tokenGestor, cotacao.id, {
            descricao: 'Item C novo',
            quantidade: 1,
            unidade: 'UN'
        });

        expect(res.statusCode).toBe(201);

        const detalhe = await getCotacao(tokenGestor, cotacao.id);

        expect(detalhe.statusCode).toBe(200);
        expect(detalhe.body.status).toBe('em_andamento');
        expect(detalhe.body.cotacao_itens).toHaveLength(3);

        const itemNovo = detalhe.body.cotacao_itens.find(
            (item) => item.descricao === 'Item C novo'
        );

        expect(itemNovo).toBeDefined();
        expect(itemOrcamentos(detalhe.body, itemNovo.id)).toHaveLength(0);
        expect(
            itemOrcamentos(detalhe.body, itemA).find(
                (orcamento) => orcamento.id === vencedorA.id
            ).selecionada
        ).toBe(true);
    });

    it('apagar um item remove os orçamentos dele e o status volta para aberta se não sobrar preço', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item com preço',
                quantidade: 2,
                unidade: 'UN'
            },
            {
                descricao: 'Item sem preço',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);

        const itemComPreco = cotacao.cotacao_itens[0].id;
        const itemSemPreco = cotacao.cotacao_itens[1].id;

        const lancado = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemComPreco,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                }
            ]
        );

        expect(lancado.statusCode).toBe(201);
        expect(lancado.body.status).toBe('em_andamento');

        const res = await deleteItem(tokenGestor, itemComPreco);

        expect(res.statusCode).toBe(200);

        const detalhe = await getCotacao(tokenGestor, cotacao.id);

        expect(detalhe.statusCode).toBe(200);
        expect(detalhe.body.status).toBe('aberta');
        expect(detalhe.body.cotacao_itens).toHaveLength(1);
        expect(detalhe.body.cotacao_itens[0].id).toBe(itemSemPreco);
        expect(itemOrcamentos(detalhe.body, itemSemPreco)).toHaveLength(0);

        const propostas = await request(app)
            .get('/cotacao-propostas')
            .query({ cotacao_id: cotacao.id })
            .set('Authorization', `Bearer ${tokenGestor}`);

        const envelopes = (propostas.body || []).filter(
            (proposta) => proposta.cotacao_id === cotacao.id
        );

        expect(envelopes).toHaveLength(0);
    });

    it('apagar o último item da cotação é recusado e o item permanece', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Único item',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        const res = await deleteItem(tokenGestor, itemId);

        expect(res.statusCode).toBe(400);

        const detalhe = await getCotacao(tokenGestor, cotacao.id);

        expect(detalhe.statusCode).toBe(200);
        expect(detalhe.body.cotacao_itens).toHaveLength(1);
        expect(detalhe.body.cotacao_itens[0].id).toBe(itemId);
        expect(detalhe.body.cotacao_itens[0].descricao).toBe('Único item');
    });

    it('alterar quantidade do item recalcula valor_total dos orçamentos e preserva valor_unitario', async () => {
        const cotacao = await criarCotacao([
            {
                descricao: 'Item quantidade',
                quantidade: 2,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        const lancado = await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                },
                {
                    fornecedor_id: fornecedorB.id,
                    valor_unitario: 15
                }
            ]
        );

        expect(lancado.statusCode).toBe(201);
        expect(itemOrcamentos(lancado.body, itemId)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10,
                    valor_total: 20
                }),
                expect.objectContaining({
                    fornecedor_id: fornecedorB.id,
                    valor_unitario: 15,
                    valor_total: 30
                })
            ])
        );

        const res = await putItem(tokenGestor, itemId, {
            quantidade: 4
        });

        expect(res.statusCode).toBe(200);
        expect(res.body.quantidade).toBe(4);

        const detalhe = await getCotacao(tokenGestor, cotacao.id);

        expect(detalhe.statusCode).toBe(200);
        expect(detalhe.body.status).toBe('em_andamento');
        expect(itemOrcamentos(detalhe.body, itemId)).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10,
                    valor_total: 40
                }),
                expect.objectContaining({
                    fornecedor_id: fornecedorB.id,
                    valor_unitario: 15,
                    valor_total: 60
                })
            ])
        );
    });

    it('create e update de descrição, produto e unidade do item valem em cotação não terminal', async () => {
        const produto = await request(app)
            .post('/produtos')
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                nome: `Produto item ${Date.now()}`,
                descricao: 'Produto para item da cotação',
                unidade: 'CX'
            });

        const produtoCriado = produto.body[0] || produto.body;

        expect(produto.statusCode).toBe(201);
        expect(produtoCriado.id).toBeDefined();

        const cotacao = await criarCotacao([
            {
                descricao: 'Item original',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);

        const itemId = cotacao.cotacao_itens[0].id;

        await postOrcamentos(
            tokenGestor,
            cotacao.id,
            itemId,
            [
                {
                    fornecedor_id: fornecedorA.id,
                    valor_unitario: 10
                }
            ]
        );

        const criado = await postItem(tokenGestor, cotacao.id, {
            descricao: 'Item extra cadastro',
            quantidade: 3,
            unidade: 'CX',
            produto_id: produtoCriado.id
        });

        expect(criado.statusCode).toBe(201);
        expect(criado.body.descricao).toBe('Item extra cadastro');
        expect(criado.body.unidade).toBe('CX');
        expect(criado.body.produto_id).toBe(produtoCriado.id);

        const res = await putItem(tokenGestor, itemId, {
            descricao: 'Item atualizado cadastro',
            unidade: 'CX',
            produto_id: produtoCriado.id
        });

        expect(res.statusCode).toBe(200);
        expect(res.body.descricao).toBe('Item atualizado cadastro');
        expect(res.body.unidade).toBe('CX');
        expect(res.body.produto_id).toBe(produtoCriado.id);

        const detalheCadastro = await getCotacao(tokenGestor, cotacao.id);

        expect(detalheCadastro.statusCode).toBe(200);
        expect(detalheCadastro.body.status).toBe('em_andamento');

        const itemAtualizado = detalheCadastro.body.cotacao_itens.find(
            (item) => item.id === itemId
        );
        const itemNovo = detalheCadastro.body.cotacao_itens.find(
            (item) => item.id === criado.body.id
        );

        expect(itemAtualizado).toEqual(
            expect.objectContaining({
                descricao: 'Item atualizado cadastro',
                unidade: 'CX',
                produto_id: produtoCriado.id
            })
        );
        expect(itemNovo).toEqual(
            expect.objectContaining({
                descricao: 'Item extra cadastro',
                unidade: 'CX',
                produto_id: produtoCriado.id
            })
        );
        expect(itemOrcamentos(detalheCadastro.body, itemId)).toHaveLength(1);
    });

    it('cotação finalizada ou cancelada recusa criar, alterar e apagar item', async () => {
        const criadaFinalizada = await criarCotacao([
            {
                descricao: 'Item finalizado',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);
        const { cotacao: finalizada, itemId: itemFinalizada } =
            await tornarFinalizada(criadaFinalizada);

        const criarNaFinalizada = await postItem(
            tokenGestor,
            finalizada.id,
            {
                descricao: 'Item novo',
                quantidade: 1,
                unidade: 'UN'
            }
        );

        expect(criarNaFinalizada.statusCode).toBe(400);

        const alterarFinalizada = await putItem(
            tokenGestor,
            itemFinalizada,
            {
                descricao: 'Tentativa de alterar'
            }
        );

        expect(alterarFinalizada.statusCode).toBe(400);

        const apagarFinalizada = await deleteItem(
            tokenGestor,
            itemFinalizada
        );

        expect(apagarFinalizada.statusCode).toBe(400);

        const cancelada = await criarCotacao([
            {
                descricao: 'Item cancelado',
                quantidade: 1,
                unidade: 'UN'
            }
        ]);
        const itemCancelada = cancelada.cotacao_itens[0].id;

        const del = await request(app)
            .delete(`/cotacoes/${cancelada.id}`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                motivo_cancelamento: 'Cancelada para recusar item'
            });

        expect(del.statusCode).toBe(200);

        const criarNaCancelada = await postItem(
            tokenGestor,
            cancelada.id,
            {
                descricao: 'Item novo',
                quantidade: 1,
                unidade: 'UN'
            }
        );

        expect(criarNaCancelada.statusCode).toBe(400);

        const alterarCancelada = await putItem(
            tokenGestor,
            itemCancelada,
            {
                descricao: 'Tentativa de alterar'
            }
        );

        expect(alterarCancelada.statusCode).toBe(400);

        const apagarCancelada = await deleteItem(
            tokenGestor,
            itemCancelada
        );

        expect(apagarCancelada.statusCode).toBe(400);

        const detalheFinalizada = await getCotacao(
            tokenGestor,
            finalizada.id
        );
        const detalheCancelada = await getCotacao(
            tokenGestor,
            cancelada.id
        );

        expect(detalheFinalizada.body.status).toBe('finalizada');
        expect(detalheFinalizada.body.cotacao_itens).toHaveLength(1);
        expect(detalheCancelada.body.status).toBe('cancelada');
        expect(detalheCancelada.body.cotacao_itens).toHaveLength(1);
    });

});
