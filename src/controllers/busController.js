// src/controllers/busController.js
const { PrismaClient, DayType } = require('@prisma/client');
const { getDistanceMatrix, getCoordinates } = require('../services/googleMapsService');
const { getArrivalPrediction } = require('../services/geminiService');

const prisma = new PrismaClient();

// --- FUNÇÕES AUXILIARES (sem alterações) ---
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

// --- CONTROLADORES (as 4 primeiras funções não mudam) ---
exports.findNearestStops = async (req, res) => {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
        return res.status(400).json({ error: 'Os parâmetros de latitude (lat) e longitude (lng) são obrigatórios.' });
    }
    try {
        const userCoords = { latitude: parseFloat(lat), longitude: parseFloat(lng) };
        const allStops = await prisma.stop.findMany({
            include: { lines: { select: { id: true, number: true, destination: true }, distinct: ['number'] } }
        });
        const stopsWithDistance = allStops.map(stop => ({ ...stop, distance: getHaversineDistance(userCoords, stop) }));
        stopsWithDistance.sort((a, b) => a.distance - b.distance);
        res.json(stopsWithDistance.slice(0, 10));
    } catch (error) {
        console.error("Erro ao buscar paradas próximas:", error);
        res.status(500).json({ error: 'Erro interno ao calcular paradas próximas.' });
    }
};

exports.predictArrivalTime = async (req, res) => {
    const { stopId } = req.params;
    try {
        const stop = await prisma.stop.findUnique({
            where: { id: stopId },
            include: { lines: { include: { schedules: true } } }
        });
        if (!stop) return res.status(404).json({ error: "Parada não encontrada." });
        
        const dayType = getCurrentDayType();
        const now = new Date();
        const currentTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
        const predictions = [];

        for (const line of stop.lines) {
            const todaySchedules = line.schedules.filter(s => s.dayType === dayType).sort((a, b) => a.time.localeCompare(b.time));
            if (todaySchedules.length === 0) continue;
            const lastDeparture = todaySchedules.filter(s => s.time < currentTime).pop();
            const nextDeparture = todaySchedules.find(s => s.time > currentTime);
            if (!lastDeparture) {
                 predictions.push({ line: { number: line.number, destination: line.destination }, status: 'Nenhum ônibus em rota.', nextDepartureTime: nextDeparture ? nextDeparture.time : "N/A" });
                continue;
            }
            const originCoords = await getCoordinates(`${line.origin}, Saquarema, RJ`);
            if (!originCoords) continue;
            const stopCoords = { latitude: stop.latitude, longitude: stop.longitude };
            const travelInfo = await getDistanceMatrix(originCoords, stopCoords);
            if (!travelInfo || !travelInfo.duration) continue;
            const geminiPrediction = await getArrivalPrediction({ line, distanceText: travelInfo.distance.text, durationText: travelInfo.duration.text, stopName: stop.name, departureTime: lastDeparture.time, currentTime });
            predictions.push({ line: { number: line.number, destination: line.destination }, status: `Ônibus que partiu às ${lastDeparture.time} está a caminho.`, prediction: geminiPrediction, nextDepartureTime: nextDeparture ? nextDeparture.time : "N/A" });
        }
        
        if (predictions.length === 0) return res.status(404).json({ error: "Não foi possível gerar previsões para esta parada hoje." });
        res.json({ stop: { name: stop.name }, predictions });
    } catch (error) {
        console.error("Erro ao gerar previsão:", error);
        res.status(500).json({ error: 'Erro interno ao gerar previsão.' });
    }
};

exports.getNextBusForUser = async (req, res) => {
    const { lineNumber } = req.params;
    const { userLat, userLng } = req.query;
    if (!userLat || !userLng) return res.status(400).json({ error: 'Os parâmetros de latitude (userLat) e longitude (userLng) são obrigatórios.' });
    try {
        const userCoords = { latitude: parseFloat(userLat), longitude: parseFloat(userLng) };
        const line = await prisma.line.findUnique({
            where: { number: lineNumber },
            include: { stops: true, schedules: true }
        });
        if (!line || line.stops.length === 0) return res.status(404).json({ error: `Linha ${lineNumber} ou suas paradas não foram encontradas.` });

        const nearestStopOnRoute = line.stops.map(stop => ({ ...stop, distanceToUser: getHaversineDistance(userCoords, stop) })).sort((a, b) => a.distanceToUser - b.distanceToUser)[0];
        const dayType = getCurrentDayType();
        const now = new Date();
        const currentTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });
        const todaySchedules = line.schedules.filter(s => s.dayType === dayType).sort((a, b) => a.time.localeCompare(b.time));
        if (todaySchedules.length === 0) return res.status(404).json({ error: `Não há horários disponíveis para a linha ${lineNumber} hoje.` });
        
        const lastDeparture = todaySchedules.filter(s => s.time < currentTime).pop();
        const nextDeparture = todaySchedules.find(s => s.time > currentTime);
        if (!lastDeparture) return res.json({ lineInfo: { number: line.number, destination: line.destination }, nearestStop: { name: nearestStopOnRoute.name, distance: `${nearestStopOnRoute.distanceToUser.toFixed(2)} km` }, prediction: `Nenhum ônibus desta linha iniciou a rota ainda. O primeiro parte às ${nextDeparture.time}.` });
        
        const originCoords = await getCoordinates(`${line.origin}, Saquarema, RJ`);
        const stopCoords = { latitude: nearestStopOnRoute.latitude, longitude: nearestStopOnRoute.longitude };
        const travelInfo = await getDistanceMatrix(originCoords, stopCoords);
        if (!travelInfo || !travelInfo.duration) return res.status(500).json({ error: "Não foi possível calcular a rota via Google Maps." });
        
        const geminiPrediction = await getArrivalPrediction({ line, distanceText: travelInfo.distance.text, durationText: travelInfo.duration.text, stopName: nearestStopOnRoute.name, departureTime: lastDeparture.time, currentTime });
        res.json({ lineInfo: { number: line.number, destination: line.destination }, nearestStop: { id: nearestStopOnRoute.id, name: nearestStopOnRoute.name, distanceToUser: `${nearestStopOnRoute.distanceToUser.toFixed(2)} km de você` }, arrivalInfo: { busOnRoute: `Ônibus que partiu da origem (${line.origin}) às ${lastDeparture.time}.`, prediction: geminiPrediction, nextBusScheduled: nextDeparture ? `O próximo ônibus está programado para partir às ${nextDeparture.time}.` : "Este é o último ônibus do dia." } });
    } catch (error) {
        console.error("Erro ao calcular próximo ônibus:", error);
        res.status(500).json({ error: 'Erro interno ao processar sua solicitação.' });
    }
};

exports.getLineRoute = async (req, res) => {
    const { lineNumber } = req.params;
    try {
        const line = await prisma.line.findUnique({
            where: { number: lineNumber },
            include: { stops: { select: { id: true, name: true, latitude: true, longitude: true } } }
        });
        if (!line) return res.status(404).json({ error: `Linha ${lineNumber} não encontrada.` });
        res.json({ lineNumber: line.number, origin: line.origin, destination: line.destination, stops: line.stops });
    } catch (error) {
        console.error("Erro ao buscar rota da linha:", error);
        res.status(500).json({ error: 'Erro interno ao processar sua solicitação.' });
    }
};


/**
 * Endpoint 5: Planejador de Viagem (VERSÃO CORRIGIDA)
 */
exports.planTrip = async (req, res) => {
    const { fromLat, fromLng, toAddress } = req.query;

    if (!fromLat || !fromLng || !toAddress) {
        return res.status(400).json({ error: "Parâmetros 'fromLat', 'fromLng' e 'toAddress' são obrigatórios." });
    }

    try {
        const userCoords = { latitude: parseFloat(fromLat), longitude: parseFloat(fromLng) };
        
        // 1. Geocodificar o endereço de destino
        const destCoordsFromGoogle = await getCoordinates(toAddress);
        if (!destCoordsFromGoogle) {
            return res.status(404).json({ error: `Não foi possível encontrar as coordenadas para o endereço: ${toAddress}` });
        }
        
        // --- A CORREÇÃO ESTÁ AQUI ---
        // "Traduz" o resultado do Google {lat, lng} para o nosso formato {latitude, longitude}
        const destCoords = {
            latitude: destCoordsFromGoogle.lat,
            longitude: destCoordsFromGoogle.lng
        };
        // --- FIM DA CORREÇÃO ---
        
        // 2. Encontrar paradas próximas ao destino
        const allStops = await prisma.stop.findMany({ include: { lines: { select: { id: true } } } });
        const searchRadiusKM = 2.5;

        const destinationNearbyStops = allStops
            .filter(stop => getHaversineDistance(destCoords, stop) < searchRadiusKM);

        if (destinationNearbyStops.length === 0) {
            return res.status(404).json({ error: "Nenhuma parada de ônibus encontrada perto do seu destino." });
        }

        // 3. Encontrar a melhor rota
        const candidateLineIds = [...new Set(destinationNearbyStops.flatMap(stop => stop.lines.map(line => line.id)))];
        const tripOptions = [];

        for (const lineId of candidateLineIds) {
            const line = await prisma.line.findUnique({
                where: { id: lineId },
                include: { stops: true }
            });
            if (!line) continue;
            const bestBoardingStop = line.stops
                .map(stop => ({ ...stop, distanceToUser: getHaversineDistance(userCoords, stop) }))
                .sort((a, b) => a.distanceToUser - b.distanceToUser)[0];
            tripOptions.push({ line, boardingStop: bestBoardingStop });
        }

        if (tripOptions.length === 0) {
            return res.status(404).json({ error: "Não foi possível encontrar uma rota." });
        }
        
        tripOptions.sort((a, b) => a.boardingStop.distanceToUser - b.boardingStop.distanceToUser);
        const bestTripOption = tripOptions[0];

        // 4. Calcular o timing para a melhor opção
        const lineDetails = await prisma.line.findUnique({ where: { id: bestTripOption.line.id }, include: { schedules: true } });
        
        const dayType = getCurrentDayType();
        const now = new Date();
        const currentTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

        const todaySchedules = lineDetails.schedules.filter(s => s.dayType === dayType).sort((a, b) => a.time.localeCompare(b.time));
        const lastDeparture = todaySchedules.filter(s => s.time < currentTime).pop();
        const nextDeparture = todaySchedules.find(s => s.time > currentTime);

        if (!nextDeparture) {
            let message = `Não há mais ônibus programados para a linha ${lineDetails.number} hoje.`;
            if(lastDeparture) { message += ` O último partiu às ${lastDeparture.time}.` }
            return res.json({ message });
        }
        
        const originCoordsForBus = await getCoordinates(`${lineDetails.origin}, Saquarema, RJ`);
        const boardingStopCoords = { latitude: bestTripOption.boardingStop.latitude, longitude: bestTripOption.boardingStop.longitude };
        
        const walkingInfo = await getDistanceMatrix(userCoords, boardingStopCoords);
        const busTravelToBoardingStopInfo = await getDistanceMatrix(originCoordsForBus, boardingStopCoords);
        
        if (!walkingInfo || !walkingInfo.duration || !busTravelToBoardingStopInfo || !busTravelToBoardingStopInfo.duration) {
             return res.status(500).json({ error: "Erro ao calcular distâncias com o Google Maps." });
        }

        const [departureHour, departureMinute] = nextDeparture.time.split(':').map(Number);
        const busDepartureTime = new Date();
        busDepartureTime.setHours(departureHour, departureMinute, 0, 0);

        const busArrivalTimeAtStop = new Date(busDepartureTime.getTime() + busTravelToBoardingStopInfo.duration.value * 1000);
        const timeToLeaveHome = new Date(busArrivalTimeAtStop.getTime() - walkingInfo.duration.value * 1000 - (2 * 60 * 1000));

        // 5. Montar a resposta final
        res.json({
            plan: {
                line: { number: lineDetails.number, origin: lineDetails.origin, destination: lineDetails.destination },
                boardingStop: { name: bestTripOption.boardingStop.name },
                instructions: {
                    leaveAt: `Para pegar o ônibus das ${nextDeparture.time}, saia por volta das ${timeToLeaveHome.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}.`,
                    walkToStop: `Caminhe por aproximadamente ${walkingInfo.duration.text} até a parada "${bestTripOption.boardingStop.name}".`,
                    beAtStopBy: `É recomendado estar na parada até às ${new Date(busArrivalTimeAtStop.getTime() - (2 * 60000)).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}.`,
                    estimatedBusArrival: `O ônibus que parte às ${nextDeparture.time} deve chegar na sua parada aproximadamente às ${busArrivalTimeAtStop.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}.`
                }
            }
        });

    } catch (error) {
        console.error("Erro ao planejar viagem:", error);
        res.status(500).json({ error: 'Erro interno ao processar sua solicitação.' });
    }
};