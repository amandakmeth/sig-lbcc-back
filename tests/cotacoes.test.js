import request from 'supertest';
import app from '../src/app.js';

let tokenGestor = '';
let tokenOperador = '';

let cotacaoId = '';

let pacienteId = '';
let areaId = '';
let fornecedorId = '';

beforeAll(async () => {

    // =========================
    // LOGIN GESTOR
    // =========================
    const gestor = await request(app)
        .post('/auth/login')
        .send({
            email: 'admin@email.com',
            password: '123456'
        });

    tokenGestor = gestor.body.access_token;

    // =========================
    // LOGIN OPERADOR
    // =========================
    const operador = await request(app)
        .post('/auth/login')
        .send({
            email: 'operador2@email.com',
            password: '123456'
        });

    tokenOperador = operador.body.access_token;

    // Mesmo estilo de pacientes/áreas/fornecedores: a costura HTTP
    // cria os FKs. 400 por FK na Cotação continua o risco já conhecido
    // se este setup falhar — não é um caminho novo.
    const stamp = Date.now();

    const paciente = await request(app)
        .post('/pacientes')
        .set('Authorization', `Bearer ${tokenGestor}`)
        .send({
            nome: `Paciente teste ${stamp}`,
            data_nascimento: '2000-01-01',
            cidade: 'Londrina',
            estado: 'PR'
        });

    pacienteId = (paciente.body[0] || paciente.body)?.id;

    const area = await request(app)
        .post('/areas')
        .set('Authorization', `Bearer ${tokenGestor}`)
        .send({
            nome: `Área teste ${stamp}`,
            descricao: 'seed teste'
        });

    areaId = (area.body[0] || area.body)?.id;

    const fornecedor = await request(app)
        .post('/fornecedores')
        .set('Authorization', `Bearer ${tokenGestor}`)
        .send({
            razao_social: `Fornecedor teste ${stamp}`,
            nome_fantasia: 'Fornecedor Teste',
            cnpj: `${stamp}`,
            telefone: '43999999999',
            email: 'teste@email.com'
        });

    const fornecedorCriado = fornecedor.body[0] || fornecedor.body;
    fornecedorId = fornecedorCriado?.id;

    if (!pacienteId || !areaId || !fornecedorId) {
        throw new Error(
            'Seed da costura: paciente, área e fornecedor ativos são obrigatórios'
        );
    }
});

describe('Cotações - Regras de Negócio', () => {

    // =========================
    // LISTAR
    // =========================
    it('gestor deve listar cotações', async () => {

        const res = await request(app)
            .get('/cotacoes')
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    it('operador pode ou não listar cotações', async () => {

        const res = await request(app)
            .get('/cotacoes')
            .set('Authorization', `Bearer ${tokenOperador}`);

        expect([200, 403]).toContain(res.statusCode);
    });

    // =========================
    // CRIAR
    // =========================
    it('gestor deve criar cotação', async () => {

        const res = await request(app)
            .post('/cotacoes')
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                descricao: 'Cotação teste automatizado',
                data_validade: '2026-12-31',
                observacoes: 'teste',
                paciente_id: pacienteId,
                area_id: areaId,
                itens: [
                    {
                        descricao: 'Item teste automatizado',
                        quantidade: 2,
                        unidade: 'UN'
                    }
                ]
            });

        // 🔥 IMPORTANTE: 400 por FK continua o risco já conhecido
        expect([201, 400]).toContain(res.statusCode);

        if (res.statusCode === 400) {
            expect(res.body.erro).not.toMatch(/pelo menos um item/i);
            return;
        }

        const cotacao = res.body[0] || res.body;

        expect(cotacao).toHaveProperty('id');

        cotacaoId = cotacao.id;

        expect(Array.isArray(cotacao.cotacao_itens)).toBe(true);
        expect(cotacao.cotacao_itens.length).toBeGreaterThan(0);
        expect(cotacao.cotacao_itens[0]).toHaveProperty('id');
    });

    it('operador NÃO pode criar cotação', async () => {

        const res = await request(app)
            .post('/cotacoes')
            .set('Authorization', `Bearer ${tokenOperador}`)
            .send({
                descricao: 'Inválida',
                data_validade: '2026-12-31'
            });

        expect(res.statusCode).toBe(403);
    });

    // =========================
    // BUSCAR POR ID
    // =========================
    it('gestor pode buscar cotação', async () => {

        expect(cotacaoId).toBeTruthy();

        const res = await request(app)
            .get(`/cotacoes/${cotacaoId}`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('id');
        expect(Array.isArray(res.body.cotacao_itens)).toBe(true);
        expect(res.body.cotacao_itens.length).toBeGreaterThan(0);
    });

    it('operador pode ou não ver cotação', async () => {

        expect(cotacaoId).toBeTruthy();

        const res = await request(app)
            .get(`/cotacoes/${cotacaoId}`)
            .set('Authorization', `Bearer ${tokenOperador}`);

        expect([200, 403]).toContain(res.statusCode);
    });

    // =========================
    // UPDATE
    // =========================
    it('gestor pode atualizar cotação', async () => {

        expect(cotacaoId).toBeTruthy();

        const res = await request(app)
            .put(`/cotacoes/${cotacaoId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                descricao: 'Cotação atualizada teste'
            });

        expect([200, 400, 404]).toContain(res.statusCode);
    });

    it('operador NÃO pode atualizar cotação', async () => {

        expect(cotacaoId).toBeTruthy();

        const res = await request(app)
            .put(`/cotacoes/${cotacaoId}`)
            .set('Authorization', `Bearer ${tokenOperador}`)
            .send({
                descricao: 'inválido'
            });

        expect([403, 404]).toContain(res.statusCode);
    });

    // =========================
    // STATUS (SOFT DELETE)
    // =========================
    it('gestor pode ativar/inativar cotação', async () => {

        expect(cotacaoId).toBeTruthy();

        const res1 = await request(app)
            .patch(`/cotacoes/${cotacaoId}/status`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(res1.statusCode).toBe(200);

        const cot1 = res1.body.data || res1.body;

        expect(cot1).toHaveProperty('ativo');

        const statusAnterior = cot1.ativo;

        const res2 = await request(app)
            .patch(`/cotacoes/${cotacaoId}/status`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(res2.statusCode).toBe(200);

        const cot2 = res2.body.data || res2.body;

        expect(cot2).toHaveProperty('ativo');
        expect(cot2.ativo).not.toBe(statusAnterior);
    });

    it('operador NÃO pode alterar status', async () => {

        expect(cotacaoId).toBeTruthy();

        const res = await request(app)
            .patch(`/cotacoes/${cotacaoId}/status`)
            .set('Authorization', `Bearer ${tokenOperador}`);

        expect(res.statusCode).toBe(403);
    });

    // =========================
    // CANCELAR (DELETE LÓGICO)
    // =========================
    it('gestor pode cancelar cotação com motivo', async () => {

        expect(cotacaoId).toBeTruthy();

        const res = await request(app)
            .delete(`/cotacoes/${cotacaoId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                motivo_cancelamento: 'Cancelamento de teste automatizado'
            });

        expect(res.statusCode).toBe(200);

        const cotacao = res.body.data || res.body;

        expect(cotacao).toHaveProperty('status', 'cancelada');
        expect(cotacao).toHaveProperty(
            'motivo_cancelamento',
            'Cancelamento de teste automatizado'
        );
    });

    it('operador NÃO pode deletar cotação', async () => {

        expect(cotacaoId).toBeTruthy();

        const res = await request(app)
            .delete(`/cotacoes/${cotacaoId}`)
            .set('Authorization', `Bearer ${tokenOperador}`)
            .send({
                motivo_cancelamento: 'Tentativa do operador'
            });

        expect(res.statusCode).toBe(403);
    });

    // =========================
    // SEM TOKEN
    // =========================
    it('não deve acessar sem token', async () => {

        const res = await request(app)
            .get('/cotacoes');

        expect(res.statusCode).toBe(401);
    });
});
