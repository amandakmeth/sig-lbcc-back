import request from 'supertest';
import app from '../src/app.js';

let tokenGestor = '';
let tokenOperador = '';

let pacienteId = '';
let areaId = '';
let fornecedorA = null;
let fornecedorB = null;

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

    if (!pacienteId || !areaId || !fornecedorA?.id || !fornecedorB?.id) {
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

        const finalizada = await criarCotacao(itens);

        const patchFinalizada = await request(app)
            .patch(`/cotacoes/${finalizada.id}/status-progresso`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                status: 'finalizada'
            });

        expect(patchFinalizada.statusCode).toBe(200);

        const recusaFinalizada = await postOrcamentos(
            tokenGestor,
            finalizada.id,
            finalizada.cotacao_itens[0].id,
            [
                {
                    fornecedor_id: fornecedorA.id,
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
});
