// src/controllers/busController.js
const { PrismaClient, DayType } = require('@prisma/client');
const { getDistanceMatrix, getCoordinates } = require('../services/googleMapsService');
const { getArrivalPrediction } = require('../services/geminiService');

const prisma = new PrismaClient();

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
 * Endpoint 3: Planejador de Viagem (VERSÃO FINAL COM CÁLCULO DE TRÂNSITO)
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
        
        // ... (lógica para encontrar a melhor rota permanece a mesma) ...
        const allStops = await prisma.stop.findMany({ include: { lines: { select: { line: { select: { id: true } } } } } });
        const searchRadiusKM = 1.0; 
        const originNearbyStops = allStops.filter(s => getHaversineDistance(userCoords, s) < searchRadiusKM);
        const destinationNearbyStops = allStops.filter(s => getHaversineDistance(destCoords, s) < searchRadiusKM);

        if (originNearbyStops.length === 0 || destinationNearbyStops.length === 0) {
            return res.status(404).json({ message: "Nenhuma parada encontrada perto da origem ou do destino." });
        }

        const connectingLines = await prisma.line.findMany({
            where: {
                AND: [
                    { stops: { some: { stopId: { in: originNearbyStops.map(s => s.id) } } } },
                    { stops: { some: { stopId: { in: destinationNearbyStops.map(s => s.id) } } } },
                ],
            },
        });
        
        if (connectingLines.length === 0) {
            return res.status(404).json({ message: "Nenhuma linha direta encontrada para este trajeto." });
        }
        
        let bestTripOption = null;

        for (const line of connectingLines) {
            const lineRoute = await prisma.stopOnRoute.findMany({
                where: { lineId: line.id },
                include: { stop: true },
                orderBy: { sequence: 'asc' },
            });

            const allStopsOnRoute = lineRoute.map(sor => sor.stop);
            const boardingStop = allStopsOnRoute.sort((a, b) => getHaversineDistance(userCoords, a) - getHaversineDistance(userCoords, b))[0];
            const disembarkingStop = allStopsOnRoute.sort((a, b) => getHaversineDistance(destCoords, a) - getHaversineDistance(destCoords, b))[0];
            
            const walkingTimeToBoard = getHaversineDistance(userCoords, boardingStop);
            const walkingTimeFromAlight = getHaversineDistance(disembarkingStop, destCoords);
            const tripCost = walkingTimeToBoard + walkingTimeFromAlight;

            if (!bestTripOption || tripCost < bestTripOption.cost) {
                const lineDetails = await prisma.line.findUnique({ where: { id: line.id }, include: { schedules: true } });
                const dayType = getCurrentDayType();
                const now = new Date();
                const currentTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                const todaySchedules = lineDetails.schedules.filter(s => s.dayType === dayType).sort((a, b) => a.time.localeCompare(b.time));
                const nextDeparture = todaySchedules.find(s => s.time > currentTime);

                if (nextDeparture) {
                    const originCoordsForBus = await getCoordinates(`${lineDetails.origin}, Saquarema, RJ`);
                    const boardingStopCoords = { latitude: boardingStop.latitude, longitude: boardingStop.longitude };
                    
                    const walkingInfo = await getDistanceMatrix(userCoords, boardingStopCoords);
                    const busTravelInfo = await getDistanceMatrix(originCoordsForBus, boardingStopCoords);

                    if (walkingInfo?.duration && busTravelInfo?.duration) {
                        // --- LÓGICA ATUALIZADA AQUI ---
                        // Prioriza a duração com trânsito, se disponível. Senão, usa a duração padrão.
                        const busTravelSeconds = busTravelInfo.duration_in_traffic?.value || busTravelInfo.duration.value;
                        const walkingDurationSeconds = walkingInfo.duration.value;
                        // --- FIM DA ATUALIZAÇÃO ---

                        const [departureHour, departureMinute] = nextDeparture.time.split(':').map(Number);
                        const busDepartureTime = new Date();
                        busDepartureTime.setHours(departureHour, departureMinute, 0, 0);

                        const busArrivalTimeAtStop = new Date(busDepartureTime.getTime() + busTravelSeconds * 1000);
                        const timeToLeaveHome = new Date(busArrivalTimeAtStop.getTime() - walkingDurationSeconds * 1000 - (2 * 60 * 1000));

                        const boardingStopSequence = lineRoute.find(sor => sor.stopId === boardingStop.id)?.sequence;
                        const alightingStopSequence = lineRoute.find(sor => sor.stopId === disembarkingStop.id)?.sequence;
                        const busRouteSegment = (boardingStopSequence && alightingStopSequence && alightingStopSequence > boardingStopSequence) 
                            ? lineRoute.filter(sor => sor.sequence >= boardingStopSequence && sor.sequence <= alightingStopSequence).map(sor => sor.stop)
                            : [];

                        bestTripOption = {
                            cost: tripCost,
                            plan: {
                                line: { number: line.number, destination: line.destination },
                                boardingStop,
                                disembarkingStop,
                                busRouteSegment,
                                instructions: {
                                    leaveAt: `Para pegar o ônibus das ${nextDeparture.time}, saia por volta das ${timeToLeaveHome.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}.`,
                                    walkToStop: `Caminhe por aproximadamente ${walkingInfo.duration.text} até a parada "${boardingStop.name}".`,
                                    beAtStopBy: `É recomendado estar na parada até às ${new Date(busArrivalTimeAtStop.getTime() - (2 * 60000)).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}.`,
                                    estimatedBusArrival: `O ônibus que parte às ${nextDeparture.time} deve chegar na sua parada aproximadamente às ${busArrivalTimeAtStop.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})} (considerando o trânsito atual).`
                                }
                            }
                        };
                    }
                }
            }
        }
        
        if (bestTripOption) {
            res.json(bestTripOption);
        } else {
            res.status(404).json({ message: "Não foi possível encontrar um plano de viagem completo no momento." });
        }

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