

const { PrismaClient, DayType } = require('@prisma/client');
const { getDistanceMatrix, getCoordinates } = require('../services/googleMapsService');
const { getArrivalPrediction } = require('../services/geminiService');
const polylineCodec = require('@googlemaps/polyline-codec');

const prisma = new PrismaClient();

// --- FUNÇÕES AUXILIARES ---
function getHaversineDistance(coords1, coords2) {
    function toRad(x) { return (x * Math.PI) / 180; }
    const R = 6371;
    const dLat = toRad(coords2.latitude - coords1.latitude);
    const dLon = toRad(coords2.longitude - coords1.longitude);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(toRad(coords1.latitude)) * Math.cos(toRad(coords2.latitude)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function getCurrentDayType() {
    const dayOfWeek = new Date().getDay();
    if (dayOfWeek === 0) return DayType.DOMINGO;
    if (dayOfWeek === 6) return DayType.SABADO;
    return DayType.SEMANA;
}

// --- ENDPOINTS DA API ---

/**
 * Endpoint 1: Encontra as paradas de ônibus mais próximas de um usuário. (LÓGICA CORRIGIDA)
 */
exports.findNearestStops = async (req, res) => {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
        return res.status(400).json({ error: 'Os parâmetros de latitude (lat) e longitude (lng) são obrigatórios.' });
    }
    try {
        const userCoords = { latitude: parseFloat(lat), longitude: parseFloat(lng) };
        
        // Busca todas as paradas e inclui as linhas que passam por elas através da tabela de junção
        const allStops = await prisma.stop.findMany({
            include: {
                lines: { // 'lines' agora se refere a StopOnRoute
                    include: {
                        line: { // Incluimos o modelo Line a partir de StopOnRoute
                            select: { id: true, number: true, destination: true }
                        }
                    }
                }
            }
        });

        const stopsWithDistance = allStops.map(stop => {
            // Extrai os números das linhas da nova estrutura aninhada
            const lineNumbers = stop.lines.map(stopOnRoute => stopOnRoute.line.number);
            
            return {
                id: stop.id,
                name: stop.name,
                latitude: stop.latitude,
                longitude: stop.longitude,
                distance: getHaversineDistance(userCoords, stop),
                lines: [...new Set(lineNumbers)] // Cria uma lista única de números de linha
            };
        });

        stopsWithDistance.sort((a, b) => a.distance - b.distance);
        res.json(stopsWithDistance.slice(0, 10));
    } catch (error) {
        console.error("Erro ao buscar paradas próximas:", error);
        res.status(500).json({ error: 'Erro interno ao calcular paradas próximas.' });
    }
};

/**
 * Endpoint 2: Retorna todas as paradas de uma linha específica para desenhar a rota. (Lógica já estava correta)
 */
exports.getLineRoute = async (req, res) => {
    const { lineNumber } = req.params;
    try {
        const line = await prisma.line.findUnique({
            where: { number: lineNumber },
            include: {
                stops: {
                    orderBy: { sequence: 'asc' },
                    include: { stop: true },
                },
            },
        });
        if (!line) return res.status(404).json({ error: `Linha ${lineNumber} não encontrada.` });
        
        const formattedStops = line.stops.map(stopOnRoute => ({
            id: stopOnRoute.stop.id,
            name: stopOnRoute.stop.name,
            latitude: stopOnRoute.stop.latitude,
            longitude: stopOnRoute.stop.longitude,
            sequence: stopOnRoute.sequence,
        }));
        
        res.json({
            lineNumber: line.number,
            origin: line.origin,
            destination: line.destination,
            polyline: line.polyline,
            stops: formattedStops,
        });
    } catch (error) {
        console.error("Erro ao buscar rota da linha:", error);
        res.status(500).json({ error: 'Erro interno ao processar sua solicitação.' });
    }
};

/**
 * Endpoint 3: Planejador de Viagem (VERSÃO FINAL COM TODAS AS INTEGRAÇÕES)
 */
exports.planTrip = async (req, res) => {
    const { fromLat, fromLng, toAddress } = req.query;
    if (!fromLat || !fromLng || !toAddress) {
        return res.status(400).json({ error: "Parâmetros 'fromLat', 'fromLng' e 'toAddress' são obrigatórios." });
    }

    try {
        const userCoords = { latitude: parseFloat(fromLat), longitude: parseFloat(fromLng) };
        const destCoordsFromGoogle = await getCoordinates(toAddress);
        if (!destCoordsFromGoogle) {
            return res.status(404).json({ error: `Endereço de destino não encontrado.` });
        }
        const destCoords = { latitude: destCoordsFromGoogle.lat, longitude: destCoordsFromGoogle.lng };
        
        const allStops = await prisma.stop.findMany({ include: { lines: { select: { line: { select: { id: true } } } } } });
        const searchRadiusKM = 1.5;
        const originNearbyStops = allStops.filter(s => getHaversineDistance(userCoords, s) < searchRadiusKM);
        const destinationNearbyStops = allStops.filter(s => getHaversineDistance(destCoords, s) < searchRadiusKM);

        if (originNearbyStops.length === 0 || destinationNearbyStops.length === 0) {
            return res.status(404).json({ message: "Nenhuma parada encontrada perto da origem ou do destino." });
        }

        const connectingLines = await prisma.line.findMany({
            where: { AND: [ { stops: { some: { stopId: { in: originNearbyStops.map(s => s.id) } } } }, { stops: { some: { stopId: { in: destinationNearbyStops.map(s => s.id) } } } } ] },
        });
        
        if (connectingLines.length === 0) {
            return res.status(404).json({ message: "Nenhuma linha direta encontrada para este trajeto." });
        }
        
        let bestTripOption = null;

        for (const line of connectingLines) {
            const lineRoute = await prisma.stopOnRoute.findMany({ where: { lineId: line.id }, include: { stop: true }, orderBy: { sequence: 'asc' } });
            const allStopsOnRoute = lineRoute.map(sor => sor.stop);
            const boardingStop = allStopsOnRoute.sort((a, b) => getHaversineDistance(userCoords, a) - getHaversineDistance(userCoords, b))[0];
            const disembarkingStop = allStopsOnRoute.sort((a, b) => getHaversineDistance(destCoords, a) - getHaversineDistance(destCoords, b))[0];
            
            const boardingStopSequence = lineRoute.find(sor => sor.stopId === boardingStop.id)?.sequence;
            const alightingStopSequence = lineRoute.find(sor => sor.stopId === disembarkingStop.id)?.sequence;
            
            if (!boardingStopSequence || !alightingStopSequence || alightingStopSequence < boardingStopSequence) {
                continue; 
            }
            
            const tripCost = getHaversineDistance(userCoords, boardingStop) + getHaversineDistance(disembarkingStop, destCoords);

            if (!bestTripOption || tripCost < bestTripOption.cost) {
                const lineDetails = await prisma.line.findUnique({ where: { id: line.id }, include: { schedules: true } });
                const busRouteSegment = lineRoute.filter(sor => sor.sequence >= boardingStopSequence && sor.sequence <= alightingStopSequence).map(sor => sor.stop);
                
                let segmentPolyline = line.polyline;
                if (line.polyline && busRouteSegment.length > 1) {
                    const decodedPath = polylineCodec.decode(line.polyline);
                    const boardingPointIndex = decodedPath.map(p => getHaversineDistance({latitude: p[0], longitude: p[1]}, boardingStop)).reduce((prev, curr, i, arr) => curr < arr[prev] ? i : prev, 0);
                    const alightingPointIndex = decodedPath.map(p => getHaversineDistance({latitude: p[0], longitude: p[1]}, disembarkingStop)).reduce((prev, curr, i, arr) => curr < arr[prev] ? i : prev, 0);
                    
                    if (alightingPointIndex > boardingPointIndex) {
                        const segmentPath = decodedPath.slice(boardingPointIndex, alightingPointIndex + 1);
                        segmentPolyline = polylineCodec.encode(segmentPath);
                    }
                }

                bestTripOption = {
                    cost: tripCost,
                    plan: {
                        line: { ...lineDetails, polyline: segmentPolyline },
                        boardingStop: { id: boardingStop.id, name: boardingStop.name, latitude: boardingStop.latitude, longitude: boardingStop.longitude },
                        disembarkingStop: { id: disembarkingStop.id, name: disembarkingStop.name, latitude: disembarkingStop.latitude, longitude: disembarkingStop.longitude },
                        busRouteSegment,
                    }
                };
            }
        }
        
        // --- BLOCO DE INTEGRAÇÃO COM GEMINI ADICIONADO ---
        if (bestTripOption) {
            try {
                const busCurrentPosition = { latitude: bestTripOption.plan.busRouteSegment[0].latitude, longitude: bestTripOption.plan.busRouteSegment[0].longitude };
                const currentTime = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

                // --- Estimativa para o Ponto de Embarque ---
                const toBoardingStopMatrix = await getDistanceMatrix(busCurrentPosition, bestTripOption.plan.boardingStop);
                if (toBoardingStopMatrix && toBoardingStopMatrix.duration_in_traffic) {
                    const predictionText = await getArrivalPrediction({
                        line: bestTripOption.plan.line,
                        distanceText: toBoardingStopMatrix.distance.text,
                        durationText: toBoardingStopMatrix.duration_in_traffic.text,
                        stopName: bestTripOption.plan.boardingStop.name,
                        departureTime: "N/A",
                        currentTime
                    });
                    bestTripOption.plan.boardingStop.estimatedArrivalTime = predictionText.match(/\d{2}:\d{2}/)?.[0] || "N/A";
                }

                // --- Estimativa para o Ponto de Desembarque ---
                const toDisembarkingStopMatrix = await getDistanceMatrix(busCurrentPosition, bestTripOption.plan.disembarkingStop);
                if (toDisembarkingStopMatrix && toDisembarkingStopMatrix.duration_in_traffic) {
                     const predictionText = await getArrivalPrediction({
                        line: bestTripOption.plan.line,
                        distanceText: toDisembarkingStopMatrix.distance.text,
                        durationText: toDisembarkingStopMatrix.duration_in_traffic.text,
                        stopName: bestTripOption.plan.disembarkingStop.name,
                        departureTime: "N/A",
                        currentTime
                    });
                    bestTripOption.plan.disembarkingStop.estimatedArrivalTime = predictionText.match(/\d{2}:\d{2}/)?.[0] || "N/A";
                }
                
            } catch (e) {
                console.error("Erro ao obter previsão de horário do Gemini:", e);
                // Continua sem os horários em caso de erro, não quebra a requisição
            }
            
            res.json(bestTripOption);
        } else {
            res.status(404).json({ message: "Nenhuma linha encontrada na direção correta para o seu trajeto." });
        }
        // --- FIM DO BLOCO DE INTEGRAÇÃO ---

    } catch (error) {
        console.error("Erro ao planejar viagem:", error);
        res.status(500).json({ error: 'Erro interno ao processar sua solicitação.' });
    }
};

/**
 * Endpoint 4: Encontra linhas de ônibus em comum entre uma origem e um destino.
 */
exports.findCommonLines = async (req, res) => {
    const { fromLat, fromLng, toAddress } = req.query;

    if (!fromLat || !fromLng || !toAddress) {
        return res.status(400).json({ error: "Os parâmetros 'fromLat', 'fromLng' e 'toAddress' são obrigatórios." });
    }

    try {
        // 1. Obter coordenadas de origem e destino
        const userCoords = { latitude: parseFloat(fromLat), longitude: parseFloat(fromLng) };
        const destCoordsFromGoogle = await getCoordinates(toAddress);
        if (!destCoordsFromGoogle) {
            return res.status(404).json({ error: `Endereço de destino não encontrado: ${toAddress}` });
        }
        const destCoords = { latitude: destCoordsFromGoogle.lat, longitude: destCoordsFromGoogle.lng };

        // 2. Encontrar paradas próximas da origem e do destino
        const allStops = await prisma.stop.findMany();
        const searchRadiusKM = 0.7; // Raio de busca de 700m (cerca de 10 min de caminhada)

        const originNearbyStops = allStops.filter(
            stop => getHaversineDistance(userCoords, stop) < searchRadiusKM
        );

        const destinationNearbyStops = allStops.filter(
            stop => getHaversineDistance(destCoords, stop) < searchRadiusKM
        );

        if (originNearbyStops.length === 0) {
            return res.status(404).json({ message: "Nenhuma parada de ônibus encontrada perto da sua localização de partida.", commonLines: [] });
        }
        if (destinationNearbyStops.length === 0) {
            return res.status(404).json({ message: "Nenhuma parada de ônibus encontrada perto do seu destino.", commonLines: [] });
        }

        // 3. Obter as linhas que servem cada conjunto de paradas
        const originStopIds = originNearbyStops.map(s => s.id);
        const destinationStopIds = destinationNearbyStops.map(s => s.id);

        const originLinesResult = await prisma.stopOnRoute.findMany({
            where: { stopId: { in: originStopIds } },
            include: { line: true }
        });
        const destinationLinesResult = await prisma.stopOnRoute.findMany({
            where: { stopId: { in: destinationStopIds } },
            include: { line: true }
        });

        // 4. Encontrar a intersecção (linhas em comum)
        const originLineIds = new Set(originLinesResult.map(sor => sor.line.id));
        const commonLinesMap = new Map();

        destinationLinesResult.forEach(sor => {
            if (originLineIds.has(sor.line.id)) {
                // Adiciona o objeto da linha ao Map para garantir que seja único
                commonLinesMap.set(sor.line.id, sor.line);
            }
        });

        const commonLines = Array.from(commonLinesMap.values());

        res.json({ commonLines });

    } catch (error) {
        console.error("Erro ao buscar linhas em comum:", error);
        res.status(500).json({ error: 'Erro interno ao processar sua solicitação.' });
    }
};

// As duas funções abaixo foram removidas da exportação principal em busRoutes.js,
// mas as mantemos aqui caso sejam necessárias para testes ou funcionalidades futuras.
exports.predictArrivalTime = async (req, res) => { /* ... implementação ... */ };
exports.getNextBusForUser = async (req, res) => { /* ... implementação ... */ };