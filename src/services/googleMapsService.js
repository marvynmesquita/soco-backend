// src/services/googleMapsService.js
const { Client, TravelMode } = require("@googlemaps/google-maps-services-js");
require('dotenv').config();
const client = new Client({});

async function getCoordinates(address) {
    try {
        const response = await client.geocode({ params: { address, key: process.env.MAPS_API_KEY, region: 'BR' } });
        return response.data.results?.[0]?.geometry?.location || null;
    } catch (error) {
        console.error("Erro na Geocoding API:", error.message);
        return null;
    }
}

async function getDistanceMatrix(origin, destination) {
    try {
        const response = await client.distancematrix({
            params: {
                origins: [origin],
                destinations: [destination],
                key: process.env.MAPS_API_KEY,
                mode: TravelMode.driving,
                units: 'metric',
                // ADICIONADO CONFORME SEU PEDIDO:
                // Isso instrui o Google a fornecer a 'duration_in_traffic'.
                departure_time: 'now',
            },
        });
        
        if (response.data.rows[0].elements[0].status === "OK") {
            // A resposta agora incluirá 'duration_in_traffic' se houver dados de trânsito.
            return response.data.rows[0].elements[0];
        }
        return null;
    } catch (error) {
        console.error("Erro na Distance Matrix API:", error.message);
        return null;
    }
}

async function getRouteWithWaypoints(stopNames) {
    if (stopNames.length < 2) return null;

    const CHUNK_SIZE = 25; 
    const stopChunks = [];
    for (let i = 0; i < stopNames.length; i += (CHUNK_SIZE - 1)) {
        stopChunks.push(stopNames.slice(i, i + CHUNK_SIZE));
    }
    console.log(`   A rota com ${stopNames.length} paradas foi dividida em ${stopChunks.length} trechos.`);

    let fullPolyline = '';
    const allStopsMap = new Map();

    for (const chunk of stopChunks) {
        if (chunk.length < 2) continue;
        
        const origin = `${chunk[0]}, Saquarema, RJ`;
        const destination = `${chunk[chunk.length - 1]}, Saquarema, RJ`;
        const waypoints = chunk.slice(1, -1).map(name => `${name}, Saquarema, RJ`);

        console.log(`   Buscando trecho da rota com ${chunk.length} paradas...`);
        try {
            const response = await client.directions({
                params: {
                    origin, destination, waypoints,
                    mode: TravelMode.driving,
                    key: process.env.MAPS_API_KEY,
                }
            });
            if (response.data.routes.length > 0) {
                const route = response.data.routes[0];
                const legs = route.legs;
                if (!fullPolyline) { fullPolyline = route.overview_polyline.points; }
                
                allStopsMap.set(chunk[0], { name: chunk[0], latitude: legs[0].start_location.lat, longitude: legs[0].start_location.lng });
                legs.forEach((leg, index) => {
                    const endStopName = chunk[index + 1];
                    if (endStopName) {
                       allStopsMap.set(endStopName, { name: endStopName, latitude: leg.end_location.lat, longitude: leg.end_location.lng });
                    }
                });
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        } catch (error) {
            console.error(`Erro na Directions API para o trecho:`, error.response?.data?.error_message || error.message);
        }
    }
    if (allStopsMap.size === 0) return null;
    const orderedStops = stopNames.map(name => allStopsMap.get(name)).filter(Boolean);
    return { polyline: fullPolyline, stops: orderedStops };
}

module.exports = { getCoordinates, getDistanceMatrix, getRouteWithWaypoints };