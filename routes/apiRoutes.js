const express = require('express');
const apiController = require('../controllers/apiController');
const router = express.Router();

// Listar todas as linhas
router.get('/linhas', apiController.getLinhas);

// Listar pontos (opcionalmente filtrar por bairro)
// Ex: /api/pontos
// Ex: /api/pontos?bairro=Centro
router.get('/pontos', apiController.getPontos);

// Obter previsão de chegada
// Ex: /api/linhas/1/proximos-horarios/ponto/5?dia_semana=seg-sex&hora_atual=08:00
router.get('/linhas/:id_linha/proximos-horarios/ponto/:id_ponto', apiController.getPrevisaoChegada);


module.exports = router;