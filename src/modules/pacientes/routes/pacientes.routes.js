import express from 'express'
import {
    getPacientes,
    getPacienteById,
    createPaciente,
    updatePaciente,
    deletePaciente
} from '../controller/pacientes.controller.js'

import { authMiddleware } from '../../auth/middlewares/auth.middleware.js'

const router = express.Router()

router.use(authMiddleware)

/**
 * @swagger
 * /pacientes:
 *   get:
 *     summary: Listar pacientes
 *     tags: [Pacientes]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de pacientes
 */
router.get('/', getPacientes)

/**
 * @swagger
 * /pacientes/{id}:
 *   get:
 *     summary: Buscar paciente por ID
 *     tags: [Pacientes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do paciente
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paciente encontrado
 *       404:
 *         description: Paciente não encontrado
 */
router.get('/:id', getPacienteById)

/**
 * @swagger
 * /pacientes:
 *   post:
 *     summary: Criar paciente
 *     tags: [Pacientes]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nome
 *               - data_nascimento
 *             properties:
 *               nome:
 *                 type: string
 *                 example: Maria Oliveira Santos
 *               cpf:
 *                 type: string
 *                 example: 123.456.789-00
 *               data_nascimento:
 *                 type: string
 *                 format: date
 *                 example: 1990-05-10
 *               sexo:
 *                 type: string
 *                 example: F
 *               telefone:
 *                 type: string
 *                 example: 1832211000
 *               celular:
 *                 type: string
 *                 example: 18999990000
 *               email:
 *                 type: string
 *                 example: paciente@email.com
 *               cidade:
 *                 type: string
 *                 example: Presidente Prudente
 *               estado:
 *                 type: string
 *                 example: SP
 *               diagnostico:
 *                 type: string
 *                 example: Diabetes tipo 2
 *     responses:
 *       201:
 *         description: Paciente criado com sucesso
 *       400:
 *         description: Dados inválidos
 */
router.post('/', createPaciente)

/**
 * @swagger
 * /pacientes/{id}:
 *   put:
 *     summary: Atualizar paciente
 *     tags: [Pacientes]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do paciente
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           example:
 *             nome: João Atualizado
 *             telefone: 18999999999
 *             cidade: Presidente Prudente
 *     responses:
 *       200:
 *         description: Paciente atualizado
 */
router.put('/:id', updatePaciente)

/**
 * @swagger
 * /pacientes/{id}:
 *   delete:
 *     summary: Inativar paciente
 *     tags: [Pacientes]
 *     security:
 *       - bearerAuth: []
 *     description: Altera o status do paciente para inativo
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         description: ID do paciente
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Paciente inativado
 */
router.delete('/:id', deletePaciente)

export default router