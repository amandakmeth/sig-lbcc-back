import {
    listarCotacoes,
    buscarCotacaoPorId,
    inserirCotacao,
    atualizarCotacao,
    alterarStatusCotacao,
    alterarValidadeCotacao,
    verificarRelacionamentosCotacaoService,
    deletarCotacao,
} from '../services/cotacoes.service.js';
import { registrarOcorrencia } from '../../historico_pacientes/services/auditoria.service.js';
// =========================
// LISTAR COTAÇÕES
// =========================
export const getCotacoes = async (req, res) => {

    try {

        const ativo = req.query.ativo !== 'false';

        const { data, error } = await listarCotacoes(ativo);

        if (error) {
            return res.status(500).json({
                erro: error.message
            });
        }

        return res.json(data);

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao listar cotações'
        });
    }
};

// =========================
// BUSCAR COTAÇÃO POR ID
// =========================
export const getCotacaoById = async (req, res) => {

    try {

        const { id } = req.params;

        const { data, error } = await buscarCotacaoPorId(id);

        if (error || !data) {
            return res.status(404).json({
                erro: 'Cotação não encontrada'
            });
        }

        return res.json(data);

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao buscar cotação'
        });
    }
};

// =========================
// CRIAR COTAÇÃO
// =========================
export const createCotacao = async (req, res) => {

    try {

        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({
                erro: 'Apenas gestor pode criar cotações'
            });
        }

        const {
            descricao,
            data_validade
        } = req.body;

      const {
    descricao,
    data_validade,
    paciente_id
} = req.body;

if (
    !descricao ||
    !data_validade ||
    !paciente_id
) {
    return res.status(400).json({
        erro: 'Descrição, data de validade e paciente são obrigatórios'
    });
}
     const { data, error } = await inserirCotacao({
    ...req.body,
    created_by: req.user.id
});

if (error) {
    return res.status(400).json({
        erro: error.message || error
    });
}

await registrarOcorrencia({
    paciente_id: data.paciente_id,
    usuario_id: req.user.id,
    tipo_evento: 'COTACAO_CRIADA',
    descricao: `Cotação criada: ${data.descricao}`,
    referencia_id: data.id
});

return res.status(201).json(data);

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao criar cotação'
        });
    }
};

// =========================
// ATUALIZAR COTAÇÃO
// =========================
export const updateCotacao = async (req, res) => {

    try {

        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({
                erro: 'Apenas gestor pode atualizar cotações'
            });
        }

        const { id } = req.params;

        const { data, error } = await atualizarCotacao(
            id,
            {
                ...req.body,
                updated_by: req.user.id
            }
        );

     if (error) {
    return res.status(400).json({
        erro: error.message || error
    });
}

await registrarOcorrencia({
    paciente_id: data.paciente_id,
    usuario_id: req.user.id,
    tipo_evento: 'COTACAO_EDITADA',
    descricao: 'Cotação atualizada',
    referencia_id: data.id
});

return res.json(data);

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao atualizar cotação'
        });
    }
};

// =========================
// ATIVAR / INATIVAR (SOFT DELETE)
// =========================
export const toggleStatusCotacao = async (req, res) => {

    try {

        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({
                erro: 'Apenas gestor pode alterar status'
            });
        }

        const { id } = req.params;

        const { data, error } = await alterarStatusCotacao(id);

  if (error) {
    return res.status(400).json({
        erro: error.message
    });
}

await registrarOcorrencia({
    paciente_id: data.paciente_id,
    usuario_id: req.user.id,
    tipo_evento: 'ALTERACAO_STATUS',
    descricao: `Status alterado para ${
        data.ativo ? 'ATIVA' : 'INATIVA'
    }`,
    referencia_id: data.id
});

return res.status(200).json({
    message: 'Status alterado com sucesso',
    data
});
    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao alterar status da cotação'
        });
    }
};

// =========================
// VERIFICAR RELACIONAMENTOS
// =========================
export const verificarRelacionamentosCotacao = async (req, res) => {

    try {

        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({
                erro: 'Sem permissão'
            });
        }

        const { id } = req.params;

        const { data, error } =
            await verificarRelacionamentosCotacaoService(id);

        if (error) {
            return res.status(500).json({
                erro: error.message
            });
        }

        return res.json(data);

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao verificar relacionamentos da cotação'
        });
    }
};
// =========================
// ALTERAR VALIDADE
// =========================
export const alterarValidade = async (
    req,
    res
) => {

    try {

        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({
                erro: 'Apenas gestor pode alterar validade'
            });
        }

        const { id } = req.params;
        const { status } = req.body;

        const { data, error } =
            await alterarValidadeCotacao(
                id,
                status,
                req.user.id
            );

        if (error) {
            return res.status(400).json({
                erro: error.message
            });
        }

        await registrarOcorrencia({
            paciente_id: data.paciente_id,
            usuario_id: req.user.id,
            tipo_evento: 'ALTERACAO_STATUS',
            descricao: `Cotação marcada como ${status.toUpperCase()}`,
            referencia_id: data.id
        });

        return res.status(200).json({
            message: 'Validade alterada com sucesso',
            data
        });

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao alterar validade'
        });
    }
};
// =========================
// DELETE COM VALIDAÇÃO DE VÍNCULO
// =========================
export const deleteCotacao = async (req, res) => {

    try {

        if (req.user.perfil !== 'gestor') {
            return res.status(403).json({
                erro: 'Apenas gestor pode excluir cotações'
            });
        }

        const { id } = req.params;

        const {
            data: rel,
            error: relError
        } = await verificarRelacionamentosCotacaoService(id);

        if (relError) {
            return res.status(500).json({
                erro: relError.message
            });
        }

        if (rel?.possuiRelacionamentos) {
            return res.status(400).json({
                erro: 'Cotação possui vínculos e não pode ser excluída',
                cotacaoTemVinculos: true,
                relacionamentos: rel.relacionamentos
            });
        }

        const { data, error } = await deletarCotacao(id);

        if (error) {
            return res.status(500).json({
                erro: error.message
            });
        }

        return res.status(200).json({
            message: 'Cotação excluída com sucesso'
        });

    } catch (err) {

        return res.status(500).json({
            erro: 'Erro ao excluir cotação'
        });
    }
};