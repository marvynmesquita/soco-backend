// src/routes/busRoutes.js
const express = require('express');
const router = express.Router();
const busController = require('../controllers/busController');

// Endpoint principal: Planeja uma viagem completa
router.get('/planner/trip', busController.planTrip);

// NOVO ENDPOINT: Encontra linhas que servem uma origem e um destino
router.get('/lines/common', busController.findCommonLines);

// Endpoint para visualizar o trajeto de uma linha no mapa
router.get('/lines/:lineNumber/route', busController.getLineRoute);

// Endpoint para encontrar as paradas mais próximas do usuário
router.get('/stops/nearby', busController.findNearestStops);

module.exports = router;