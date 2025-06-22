// src/routes/busRoutes.js
const express = require('express');
const router = express.Router();
const busController = require('../controllers/busController');

// Rota para encontrar paradas próximas
router.get('/stops/nearby', busController.findNearestStops);

// Rota para obter a previsão de chegada em uma parada específica
router.get('/predict/stop/:stopId', busController.predictArrivalTime);

// Rota para encontrar o próximo ônibus de uma linha perto do usuário
router.get('/lines/:lineNumber/next-arrival', busController.getNextBusForUser);

// --- NOVAS ROTAS ADICIONADAS AQUI ---

// 1. Rota para obter o trajeto (lista de paradas) de uma linha específica
// Exemplo: GET /api/lines/21/route
router.get('/lines/:lineNumber/route', busController.getLineRoute);

// 2. Rota para planejar uma viagem de um ponto de origem a um destino
// Exemplo: GET /api/planner/trip?fromLat=...&fromLng=...&toAddress=...
router.get('/planner/trip', busController.planTrip);

// --- FIM DAS NOVAS ROTAS ---

module.exports = router;