const express = require('express');
const adminController = require('../controllers/adminController');
const router = express.Router();

// Rotas para Linhas
router.post('/linhas', adminController.addLinha);
router.get('/linhas', adminController.getLinhas);

// Rotas para Pontos
router.post('/pontos', adminController.addPonto);
router.get('/pontos', adminController.getPontos);

// Rotas para Horários de Saída
router.post('/linhas/:id_linha/horarios-saida', adminController.addHorarioSaida);
router.get('/linhas/:id_linha/horarios-saida', adminController.getHorariosSaida);

// Rotas para Sequência de Paradas
router.post('/linhas/:id_linha/sequencia-paradas', adminController.addParadaSequencia);
router.get('/linhas/:id_linha/sequencia-paradas', adminController.getSequenciaParadas);

// Rota para executar o scraper (experimental)
router.post('/run-scraper', adminController.runScraper);


module.exports = router;