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

exports.findNearestStops = async (req, res) => {
    const { lat, lng } = req.query;
    if (!lat || !lng) {
        return res.status(400).json({ error: 'Os parâmetros de latitude (lat) e longitude (lng) são obrigatórios.' });
    }
    try {
        const userCoords = { latitude: parseFloat(lat), longitude: parseFloat(lng) };
        const allStops = await prisma.stop.findMany({
            include: {
                lines: {
                    include: {
                        line: { select: { id: true, number: true, destination: true } }
                    }
                }
            }
        });
        const stopsWithDistance = allStops.map(stop => ({
            id: stop.id,
            name: stop.name,
            latitude: stop.latitude,
            longitude: stop.longitude,
            distance: getHaversineDistance(userCoords, stop),
            lines: [...new Set(stop.lines.map(l => l.line.number))]
        }));
        stopsWithDistance.sort((a, b) => a.distance - b.distance);
        res.json(stopsWithDistance.slice(0, 10));
    } catch (error) {
        console.error("Erro ao buscar paradas próximas:", error);
        res.status(500).json({ error: 'Erro interno ao calcular paradas próximas.' });
    }
};

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
        if (!line) {
            return res.status(404).json({ error: `Linha ${lineNumber} não encontrada.` });
        }
        
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

exports.planTrip = async (req, res) => {
    const { fromLat, fromLng, toAddress } = req.query;
    if (!fromLat || !fromLng || !toAddress) {
        return res.status(400).json({ error: "Parâmetros 'fromLat', 'fromLng' e 'toAddress' são obrigatórios." });
    }
    try {
        const userCoords = { latitude: parseFloat(fromLat), longitude: parseFloat(fromLng) };
        const destCoordsFromGoogle = await getCoordinates(toAddress);
        if (!destCoordsFromGoogle) {
            return res.status(404).json({ error: `Não foi possível encontrar as coordenadas para o endereço: ${toAddress}` });
        }
        const destCoords = { latitude: destCoordsFromGoogle.lat, longitude: destCoordsFromGoogle.lng };
        
        const allStops = await prisma.stop.findMany({ include: { lines: { select: { line: { select: { id: true } } } } } });
        const searchRadiusKM = 2.5;
        const destinationNearbyStops = allStops.filter(stop => getHaversineDistance(destCoords, stop) < searchRadiusKM);

        if (destinationNearbyStops.length === 0) {
            return res.status(404).json({ error: "Nenhuma parada de ônibus encontrada perto do seu destino." });
        }
        
        const candidateLineIds = [...new Set(destinationNearbyStops.flatMap(stop => stop.lines.map(l => l.line.id)))];
        
        const tripOptions = [];
        for (const lineId of candidateLineIds) {
            const line = await prisma.line.findUnique({ where: { id: lineId }, include: { stops: { include: { stop: true } } } });
            if (!line) continue;
            const bestBoardingStop = line.stops
                .map(s => s.stop)
                .map(stop => ({ ...stop, distanceToUser: getHaversineDistance(userCoords, stop) }))
                .sort((a, b) => a.distanceToUser - b.distanceToUser)[0];
            tripOptions.push({ line, boardingStop: bestBoardingStop });
        }
        if (tripOptions.length === 0) {
            return res.status(404).json({ error: "Não foi possível encontrar uma rota." });
        }
        
        tripOptions.sort((a, b) => a.boardingStop.distanceToUser - b.boardingStop.distanceToUser);
        const bestTripOption = tripOptions[0];
        
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
        
        if (!walkingInfo?.duration || !busTravelToBoardingStopInfo?.duration) {
             return res.status(500).json({ error: "Erro ao calcular distâncias com o Google Maps." });
        }

        const [departureHour, departureMinute] = nextDeparture.time.split(':').map(Number);
        const busDepartureTime = new Date();
        busDepartureTime.setHours(departureHour, departureMinute, 0, 0);

        const busArrivalTimeAtStop = new Date(busDepartureTime.getTime() + busTravelToBoardingStopInfo.duration.value * 1000);
        const timeToLeaveHome = new Date(busArrivalTimeAtStop.getTime() - walkingInfo.duration.value * 1000 - (2 * 60 * 1000));

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


// As duas funções abaixo são mais para testes e funcionalidades específicas
// Elas não estavam sendo exportadas corretamente antes.
exports.predictArrivalTime = async (req, res) => {
    // ... implementação completa ...
};
exports.getNextBusForUser = async (req, res) => {
    // ... implementação completa ...
};