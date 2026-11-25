
import { gerarRelatorioPorPeriodo } from '../services/relatorios.service.js';

const dataValida = (data) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data || '')) {
        return false;
    }

    const [ano, mes, dia] = data.split('-').map(Number);
    const dataConvertida = new Date(Date.UTC(ano, mes - 1, dia));

    return (
        dataConvertida.getUTCFullYear() === ano &&
        dataConvertida.getUTCMonth() === mes - 1 &&
        dataConvertida.getUTCDate() === dia
    );
};

export const obterRelatorioPorPeriodo = async (req, res) => {
    try {
        const { data_inicio, data_fim } = req.query;

        if (!dataValida(data_inicio) || !dataValida(data_fim)) {
            return res.status(400).json({
                mensagem: 'Informe data_inicio e data_fim no formato YYYY-MM-DD.'
            });
        }

        if (data_inicio > data_fim) {
            return res.status(400).json({
                mensagem: 'A data inicial não pode ser maior que a data final.'
            });
        }

        const relatorio = await gerarRelatorioPorPeriodo({
            dataInicio: data_inicio,
            dataFim: data_fim
        });

        return res.status(200).json(relatorio);
    } catch (error) {
        console.error('Erro ao gerar relatório por período:', error);

        return res.status(500).json({
            mensagem: 'Erro ao gerar relatório por período.',
            erro: error.message
        });
    }
};
