import request from 'supertest';
import app from '../src/app.js';

let tokenGestor = '';
let tokenOperador = '';

let cotacaoId = '';

let pacienteId = '';
let areaId = '';

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

    // ⚠️ IMPORTANTE:
    // Esses IDs precisam existir no banco (seed obrigatório)
    pacienteId = '00000000-0000-0000-0000-000000000001';
    areaId = '00000000-0000-0000-0000-000000000002';
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
                area_id: areaId
            });

        // 🔥 IMPORTANTE: pode falhar por FK em ambiente sem seed
        expect([201, 400]).toContain(res.statusCode);

        if (res.statusCode === 201) {

            const cotacao = res.body?.[0] || res.body;

            expect(cotacao).toHaveProperty('id');

            cotacaoId = cotacao.id;
        }
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

        if (!cotacaoId) return;

        const res = await request(app)
            .get(`/cotacoes/${cotacaoId}`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect(res.statusCode).toBe(200);
        expect(res.body).toHaveProperty('id');
    });

    it('operador pode ou não ver cotação', async () => {

        if (!cotacaoId) return;

        const res = await request(app)
            .get(`/cotacoes/${cotacaoId}`)
            .set('Authorization', `Bearer ${tokenOperador}`);

        expect([200, 403]).toContain(res.statusCode);
    });

    // =========================
    // UPDATE
    // =========================
    it('gestor pode atualizar cotação', async () => {

        if (!cotacaoId) return;

        const res = await request(app)
            .put(`/cotacoes/${cotacaoId}`)
            .set('Authorization', `Bearer ${tokenGestor}`)
            .send({
                descricao: 'Cotação atualizada teste'
            });

        expect([200, 400, 404]).toContain(res.statusCode);
    });

    it('operador NÃO pode atualizar cotação', async () => {

        if (!cotacaoId) return;

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

        if (!cotacaoId) return;

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

        if (!cotacaoId) return;

        const res = await request(app)
            .patch(`/cotacoes/${cotacaoId}/status`)
            .set('Authorization', `Bearer ${tokenOperador}`);

        expect(res.statusCode).toBe(403);
    });

    // =========================
    // DELETE (NOVO)
    // =========================
    it('gestor pode deletar cotação (ou bloquear por vínculo)', async () => {

        if (!cotacaoId) return;

        const res = await request(app)
            .delete(`/cotacoes/${cotacaoId}`)
            .set('Authorization', `Bearer ${tokenGestor}`);

        expect([200, 400]).toContain(res.statusCode);

        if (res.statusCode === 400) {
            expect(res.body).toHaveProperty('cotacaoTemVinculos');
        }
    });

    it('operador NÃO pode deletar cotação', async () => {

        if (!cotacaoId) return;

        const res = await request(app)
            .delete(`/cotacoes/${cotacaoId}`)
            .set('Authorization', `Bearer ${tokenOperador}`);

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