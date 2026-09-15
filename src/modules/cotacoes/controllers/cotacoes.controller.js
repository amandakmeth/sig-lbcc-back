import {
  listarCotacoes,
  buscarCotacaoPorId,
  inserirCotacao,
  atualizarCotacao,
  alterarStatusCotacao,
  alterarStatusProgressoCotacao,
  verificarRelacionamentosCotacaoService,
} from "../services/cotacoes.service.js";

import { registrarOcorrencia } from "../../historico_pacientes/services/auditoria.service.js";


// =========================
// LISTAR COTAÇÕES
// =========================
export const getCotacoes = async (req, res) => {

  try {

    const ativo = req.query.ativo !== "false";

    const {
      data,
      error
    } = await listarCotacoes(ativo);

    if (error) {
      return res.status(500).json({
        erro: error.message,
      });
    }

    return res.json(data);

  } catch (err) {

    console.error(
      "Erro ao listar cotações:",
      err
    );

    return res.status(500).json({
      erro: "Erro ao listar cotações",
    });

  }
};


// =========================
// BUSCAR COTAÇÃO POR ID
// =========================
export const getCotacaoById = async (req, res) => {

  try {

    const { id } = req.params;

    const {
      data,
      error
    } = await buscarCotacaoPorId(id);

    if (error || !data) {
      return res.status(404).json({
        erro: "Cotação não encontrada",
      });
    }

    return res.json(data);

  } catch (err) {

    console.error(
      "Erro ao buscar cotação:",
      err
    );

    return res.status(500).json({
      erro: "Erro ao buscar cotação",
    });

  }
};


// =========================
// CRIAR COTAÇÃO
// =========================
export const createCotacao = async (req, res) => {

  try {

    if (req.user.perfil !== "gestor") {
      return res.status(403).json({
        erro: "Apenas gestor pode criar cotações",
      });
    }

    const {
      descricao,
      data_validade,
      paciente_id,
      itens
    } = req.body;


    // =========================
    // VALIDAR COTAÇÃO
    // =========================

    if (
      !descricao ||
      !data_validade ||
      !paciente_id
    ) {
      return res.status(400).json({
        erro:
          "Descrição, data de validade e paciente são obrigatórios",
      });
    }


    // =========================
    // VALIDAR ITENS
    // =========================

    if (
      !Array.isArray(itens) ||
      itens.length === 0
    ) {
      return res.status(400).json({
        erro:
          "A cotação deve possuir pelo menos um item",
      });
    }


    // =========================
    // CRIAR COTAÇÃO + ITENS
    // =========================

    const {
      data,
      error
    } = await inserirCotacao({

      ...req.body,

      // Usuário responsável pela criação
      created_by: req.user.id,

    });

    if (error) {
      return res.status(400).json({
        erro:
          error.message || error,
      });
    }


    // =========================
    // REGISTRAR AUDITORIA
    // =========================

    await registrarOcorrencia({
      paciente_id: data.paciente_id,
      usuario_id: req.user.id,
      tipo_evento: "COTACAO_CRIADA",
      descricao:
        `Cotação criada: ${data.descricao}`,
      referencia_id: data.id,
    });


    // =========================
    // RETORNO
    // =========================

    return res.status(201).json(data);

  } catch (err) {

    console.error(
      "Erro ao criar cotação:",
      err
    );

    return res.status(500).json({
      erro: "Erro ao criar cotação",
    });

  }
};


// =========================
// ATUALIZAR COTAÇÃO
// =========================
export const updateCotacao = async (req, res) => {

  try {

    if (req.user.perfil !== "gestor") {
      return res.status(403).json({
        erro:
          "Apenas gestor pode atualizar cotações",
      });
    }

    const { id } = req.params;

    const {
      data,
      error
    } = await atualizarCotacao(
      id,
      {
        ...req.body,
        updated_by: req.user.id,
      }
    );

    if (error) {
      return res.status(400).json({
        erro:
          error.message || error,
      });
    }


    // =========================
    // REGISTRAR AUDITORIA
    // =========================

    await registrarOcorrencia({
      paciente_id: data.paciente_id,
      usuario_id: req.user.id,
      tipo_evento: "COTACAO_EDITADA",
      descricao:
        "Cotação atualizada",
      referencia_id: data.id,
    });

    return res.json(data);

  } catch (err) {

    console.error(
      "Erro ao atualizar cotação:",
      err
    );

    return res.status(500).json({
      erro:
        "Erro ao atualizar cotação",
    });

  }
};


// =========================
// ATIVAR / INATIVAR REGISTRO
// =========================
// OBS:
// Este endpoint altera somente o campo "ativo".
// Não altera o status de progresso da cotação.
export const toggleStatusCotacao = async (
  req,
  res
) => {

  try {

    if (req.user.perfil !== "gestor") {
      return res.status(403).json({
        erro:
          "Apenas gestor pode alterar o status de ativação",
      });
    }

    const { id } = req.params;

    const {
      data,
      error
    } = await alterarStatusCotacao(id);

    if (error) {
      return res.status(400).json({
        erro: error.message,
      });
    }


    // =========================
    // REGISTRAR AUDITORIA
    // =========================

    await registrarOcorrencia({
      paciente_id: data.paciente_id,
      usuario_id: req.user.id,
      tipo_evento: "ALTERACAO_STATUS_ATIVACAO",
      descricao:
        `Cotação ${
          data.ativo
            ? "ativada"
            : "inativada"
        }`,
      referencia_id: data.id,
    });


    return res.status(200).json({
      message:
        "Status de ativação alterado com sucesso",
      data,
    });

  } catch (err) {

    console.error(
      "Erro ao alterar status de ativação:",
      err
    );

    return res.status(500).json({
      erro:
        "Erro ao alterar status de ativação",
    });

  }
};


// =========================
// VERIFICAR RELACIONAMENTOS
// =========================
export const verificarRelacionamentosCotacao = async (
  req,
  res
) => {

  try {

    if (req.user.perfil !== "gestor") {
      return res.status(403).json({
        erro: "Sem permissão",
      });
    }

    const { id } = req.params;

    const {
      data,
      error
    } = await verificarRelacionamentosCotacaoService(id);

    if (error) {
      return res.status(500).json({
        erro: error.message,
      });
    }

    return res.json(data);

  } catch (err) {

    console.error(
      "Erro ao verificar relacionamentos da cotação:",
      err
    );

    return res.status(500).json({
      erro:
        "Erro ao verificar relacionamentos da cotação",
    });

  }
};


// =========================
// ALTERAR STATUS DE PROGRESSO
// =========================
// O único status posto à mão é cancelada.
// aberta, em_andamento, pronta_para_analise
// e finalizada são derivados pela máquina.
//
// Para cancelar:
// - motivo_cancelamento é obrigatório.
//
// Uma cotação finalizada ou cancelada
// não pode ter seu status alterado.
export const alterarStatusProgresso = async (
  req,
  res
) => {

  try {

    if (req.user.perfil !== "gestor") {
      return res.status(403).json({
        erro:
          "Apenas gestor pode alterar o status da cotação",
      });
    }

    const { id } = req.params;

    const {
      status,
      motivo_cancelamento
    } = req.body;


    // =========================
    // VALIDAR STATUS
    // =========================

    if (!status) {
      return res.status(400).json({
        erro:
          "O status da cotação é obrigatório",
      });
    }


    // =========================
    // VALIDAR MOTIVO
    // =========================

    if (
      status === "cancelada" &&
      (
        !motivo_cancelamento ||
        !motivo_cancelamento.trim()
      )
    ) {
      return res.status(400).json({
        erro:
          "O motivo do cancelamento é obrigatório",
      });
    }


    // =========================
    // ALTERAR STATUS
    // =========================

    const {
      data,
      error
    } = await alterarStatusProgressoCotacao(
      id,
      status,
      motivo_cancelamento,
      req.user.id
    );

    if (error) {
      return res.status(400).json({
        erro: error.message,
      });
    }


    // =========================
    // REGISTRAR AUDITORIA
    // =========================

    await registrarOcorrencia({
      paciente_id: data.paciente_id,
      usuario_id: req.user.id,
      tipo_evento:
        status === "cancelada"
          ? "COTACAO_CANCELADA"
          : "ALTERACAO_STATUS",
      descricao:
        status === "cancelada"
          ? `Cotação cancelada: ${motivo_cancelamento.trim()}`
          : `Cotação alterada para ${data.status.toUpperCase()}`,
      referencia_id: data.id,
    });


    // =========================
    // RETORNO
    // =========================

    return res.status(200).json({
      message:
        status === "cancelada"
          ? "Cotação cancelada com sucesso"
          : "Status da cotação alterado com sucesso",
      data,
    });

  } catch (err) {

    console.error(
      "Erro ao alterar status da cotação:",
      err
    );

    return res.status(500).json({
      erro:
        "Erro ao alterar status da cotação",
    });

  }
};


// =========================
// CANCELAR COTAÇÃO
// =========================
// NÃO exclui o registro.
//
// O DELETE da cotação representa
// um cancelamento lógico:
//
// Cotação -> status = "cancelada"
//
// Itens e propostas permanecem no banco.
//
// O motivo do cancelamento é obrigatório.
export const deleteCotacao = async (
  req,
  res
) => {

  try {

    if (req.user.perfil !== "gestor") {
      return res.status(403).json({
        erro:
          "Apenas gestor pode cancelar cotações",
      });
    }

    const { id } = req.params;

    const {
      motivo_cancelamento
    } = req.body;


    // =========================
    // VALIDAR MOTIVO
    // =========================

    if (
      !motivo_cancelamento ||
      !motivo_cancelamento.trim()
    ) {
      return res.status(400).json({
        erro:
          "O motivo do cancelamento é obrigatório",
      });
    }


    // =========================
    // BUSCAR COTAÇÃO
    // =========================

    const {
      data: cotacao,
      error: buscaError
    } = await buscarCotacaoPorId(id);

    if (buscaError || !cotacao) {
      return res.status(404).json({
        erro: "Cotação não encontrada",
      });
    }


    // =========================
    // VALIDAR STATUS ATUAL
    // =========================

    if (cotacao.status === "finalizada") {
      return res.status(400).json({
        erro:
          "Não é possível cancelar uma cotação finalizada",
      });
    }

    if (cotacao.status === "cancelada") {
      return res.status(400).json({
        erro:
          "A cotação já está cancelada",
      });
    }


    // =========================
    // CANCELAR
    // =========================
    // Não exclui a cotação.
    // Itens e propostas permanecem vinculados.

    const {
      data,
      error
    } = await alterarStatusProgressoCotacao(
      id,
      "cancelada",
      motivo_cancelamento,
      req.user.id
    );

    if (error) {
      return res.status(400).json({
        erro: error.message,
      });
    }


    // =========================
    // REGISTRAR AUDITORIA
    // =========================

    await registrarOcorrencia({
      paciente_id: data.paciente_id,
      usuario_id: req.user.id,
      tipo_evento: "COTACAO_CANCELADA",
      descricao:
        `Cotação cancelada: ${motivo_cancelamento.trim()}`,
      referencia_id: data.id,
    });


    // =========================
    // RETORNO
    // =========================

    return res.status(200).json({
      message:
        "Cotação cancelada com sucesso",
      data,
    });

  } catch (err) {

    console.error(
      "Erro ao cancelar cotação:",
      err
    );

    return res.status(500).json({
      erro:
        "Erro ao cancelar cotação",
    });

  }
};