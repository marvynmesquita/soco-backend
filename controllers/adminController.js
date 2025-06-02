const LinhaModel = require('../models/LinhaModel');
const PontoModel = require('../models/PontoModel');
const HorarioModel = require('../models/HorarioModel');
const TrajetoModel = require('../models/TrajetoModel');
const { scrapeAndPopulate } = require('../services/scraperService');


// Linhas
exports.addLinha = async (req, res, next) => {
    try {
        const { nome_linha } = req.body;
        if (!nome_linha) return res.status(400).json({ error: 'Nome da linha é obrigatório.' });
        const linha = await LinhaModel.create({ nome_linha });
        res.status(201).json(linha);
    } catch (error) {
        if (error.code === '23505') { // unique_violation
            return res.status(409).json({ error: 'Linha com este nome já existe.' });
        }
        next(error);
    }
};

exports.getLinhas = async (req, res, next) => {
    try {
        const linhas = await LinhaModel.getAll();
        res.json(linhas);
    } catch (error) {
        next(error);
    }
};

// Pontos
exports.addPonto = async (req, res, next) => {
    try {
        const { nome_ponto, bairro, latitude, longitude } = req.body;
        if (!nome_ponto) return res.status(400).json({ error: 'Nome do ponto é obrigatório.' });
        const ponto = await PontoModel.create({ nome_ponto, bairro, latitude, longitude });
        res.status(201).json(ponto);
    } catch (error) {
        next(error);
    }
};

exports.getPontos = async (req, res, next) => {
    try {
        const pontos = await PontoModel.getAll();
        res.json(pontos);
    } catch (error) {
        next(error);
    }
};

// Horários de Saída
exports.addHorarioSaida = async (req, res, next) => {
    try {
        const { id_linha } = req.params;
        const { dia_semana, horario_saida } = req.body;
        if (!dia_semana || !horario_saida) {
            return res.status(400).json({ error: 'Dia da semana e horário de saída são obrigatórios.' });
        }
        if (!['seg-sex', 'sab', 'dom-fer'].includes(dia_semana)) {
            return res.status(400).json({ error: "Dia da semana inválido. Use 'seg-sex', 'sab', ou 'dom-fer'." });
        }
        // Validação simples do formato HH:MM
        if (!/^\d{2}:\d{2}$/.test(horario_saida) && !/^\d{2}:\d{2}:\d{2}$/.test(horario_saida)) {
            return res.status(400).json({ error: "Formato de horário inválido. Use HH:MM ou HH:MM:SS." });
        }

        const horario = await HorarioModel.addHorarioSaida({ id_linha: parseInt(id_linha), dia_semana, horario_saida });
        res.status(201).json(horario);
    } catch (error) {
        if (error.code === '23503') { // foreign_key_violation (linha não existe)
            return res.status(404).json({ error: 'Linha não encontrada.' });
        }
        if (error.code === '23505') { // unique_violation
            return res.status(409).json({ error: 'Este horário de saída já existe para esta linha e dia.' });
        }
        next(error);
    }
};

exports.getHorariosSaida = async (req, res, next) => {
    try {
        const { id_linha } = req.params;
        const horarios = await HorarioModel.getHorariosSaidaByLinha(parseInt(id_linha));
        res.json(horarios);
    } catch (error) {
        next(error);
    }
};


// Sequência de Paradas
exports.addParadaSequencia = async (req, res, next) => {
    try {
        const { id_linha } = req.params;
        const { id_ponto, ordem, tempo_desde_inicio_minutos } = req.body;

        if (typeof id_ponto === 'undefined' || typeof ordem === 'undefined' || typeof tempo_desde_inicio_minutos === 'undefined') {
            return res.status(400).json({ error: 'id_ponto, ordem e tempo_desde_inicio_minutos são obrigatórios.' });
        }
        if (parseInt(ordem) <=0 || parseInt(tempo_desde_inicio_minutos) < 0) {
            return res.status(400).json({ error: 'Ordem deve ser > 0 e tempo_desde_inicio_minutos deve ser >= 0.' });
        }

        const sequencia = await TrajetoModel.addParadaSequencia({
            id_linha: parseInt(id_linha),
            id_ponto: parseInt(id_ponto),
            ordem: parseInt(ordem),
            tempo_desde_inicio_minutos: parseInt(tempo_desde_inicio_minutos)
        });
        res.status(201).json(sequencia);
    } catch (error) {
        if (error.code === '23503') { // foreign_key_violation (linha ou ponto não existe)
            return res.status(404).json({ error: 'Linha ou Ponto não encontrado.' });
        }
        if (error.code === '23505') { // unique_violation
            return res.status(409).json({ error: 'Conflito de dados: Esta parada/ordem já existe para esta linha ou a ordem já está em uso.' });
        }
        next(error);
    }
};

exports.getSequenciaParadas = async (req, res, next) => {
    try {
        const { id_linha } = req.params;
        const sequencia = await TrajetoModel.getSequenciaByLinha(parseInt(id_linha));
        res.json(sequencia);
    } catch (error) {
        next(error);
    }
};

// Scraper
exports.runScraper = async (req, res, next) => {
    try {
        console.log("Endpoint /admin/run-scraper chamado.");
        // Não envie `res` para scrapeAndPopulate, pois ele pode demorar e causar timeout.
        // Execute em background e retorne uma resposta imediata.
        scrapeAndPopulate().catch(err => {
            // Logar erro do scraping, mas a requisição HTTP já terá respondido.
            console.error("Erro durante o scraping em background:", err);
        });
        res.status(202).json({ message: "Processo de scraping iniciado em background. Verifique os logs do servidor para o progresso." });
    } catch (error) {
        next(error);
    }
};