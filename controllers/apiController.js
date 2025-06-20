const LinhaModel = require('../models/LinhaModel');
const PontoModel = require('../models/PontoModel');
const { getProximosHorarios } = require('../services/predictionService');

exports.getLinhas = async (req, res, next) => {
    try {
        const linhas = await LinhaModel.getAll();
        res.json(linhas);
    } catch (error) {
        next(error);
    }
};

exports.getPontos = async (req, res, next) => {
    try {
        const { bairro } = req.query;
        const pontos = await PontoModel.getAll(bairro);
        res.json(pontos);
    } catch (error) {
        next(error);
    }
};

exports.getPrevisaoChegada = async (req, res, next) => {
    try {
        const { id_linha, id_ponto } = req.params;
        const { dia_semana, hora_atual } = req.query;

        if (!dia_semana || !hora_atual) {
            return res.status(400).json({ error: 'Parâmetros dia_semana (seg-sex, sab, dom-fer) e hora_atual (HH:MM) são obrigatórios na query string.' });
        }
        if (!['seg-sex', 'sab', 'dom-fer'].includes(dia_semana)) {
            return res.status(400).json({ error: "Valor de dia_semana inválido. Use 'seg-sex', 'sab', ou 'dom-fer'." });
        }
        if (!/^\d{2}:\d{2}$/.test(hora_atual)) {
            return res.status(400).json({ error: "Formato de hora_atual inválido. Use HH:MM." });
        }


        const proximos = await getProximosHorarios(
            parseInt(id_linha),
            parseInt(id_ponto),
            dia_semana,
            hora_atual
        );

        if (proximos.length === 0) {
            return res.json({ message: 'Não há próximos horários estimados para os critérios informados ou dados insuficientes (verifique cadastro de horários de saída e sequência de paradas com tempos).' });
        }
        res.json({ proximos_horarios_estimados: proximos });
    } catch (error) {
        if (error.message.includes('Ponto não encontrado') || error.message.includes('tempo de trajeto não definido')) {
            return res.status(404).json({ error: error.message });
    }
    next(error);
    }
};

exports.getLinhasPorProximidade = async (req, res, next) => {
    try {
        const { lat, lon, raio } = req.query;

        if (!lat || !lon) {
            return res.status(400).json({ error: 'Parâmetros de latitude (lat) e longitude (lon) são obrigatórios.' });
        }

        const latitude = parseFloat(lat);
        const longitude = parseFloat(lon);
        const raio_km = raio ? parseFloat(raio) : 0.5; // Raio de 500m por padrão

        if (isNaN(latitude) || isNaN(longitude)) {
            return res.status(400).json({ error: 'Valores de latitude e longitude inválidos.' });
        }

        // 1. Encontra os pontos próximos
        const pontosProximos = await PontoModel.findPontosProximos(latitude, longitude, raio_km);
        if (pontosProximos.length === 0) {
            return res.json([]); // Retorna um array vazio se nenhum ponto for encontrado
        }

        // 2. Extrai os IDs dos pontos
        const pontoIds = pontosProximos.map(p => p.id_ponto);

        // 3. Encontra as linhas que passam por esses pontos
        const linhas = await LinhaModel.findByPontoIds(pontoIds);

        res.json(linhas);

    } catch (error) {
        next(error);
    }
};