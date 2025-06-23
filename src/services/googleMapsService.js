const { Client, TravelMode } = require("@googlemaps/google-maps-services-js");
require('dotenv').config();

const client = new Client({});

async function getCoordinates(address) {
    console.log(`Geocodificando endereço: ${address}`);
    try {
        const response = await client.geocode({
            params: { address: address, key: process.env.MAPS_API_KEY, region: 'BR' },
        });
        if (response.data.results && response.data.results.length > 0) {
            return response.data.results[0].geometry.location;
        }
        return null;
    } catch (error) {
        console.error("Erro na Geocoding API:", error.response?.data?.error_message || error.message);
        return null;
    }
}

async function getDistanceMatrix(origin, destination) {
    try {
        const response = await client.distancematrix({
            params: { origins: [origin], destinations: [destination], key: process.env.MAPS_API_KEY, mode: TravelMode.driving, units: 'metric' },
        });
        if (response.data.rows[0].elements[0].status === "OK") {
            return response.data.rows[0].elements[0];
        }
        return null;
    } catch (error) {
        console.error("Erro na Distance Matrix API:", error.message);
        return null;
    }
}

async function getTransitRoute(originAddress, destinationAddress) {
    console.log(`Buscando rota de transporte público: ${originAddress} -> ${destinationAddress}`);
    try {
        const response = await client.directions({
            params: {
                origin: originAddress,
                destination: destinationAddress,
                mode: TravelMode.transit,
                transit_options: { modes: ["BUS"] },
                key: process.env.MAPS_API_KEY,
            }
        });

        if (response.data.routes.length > 0) {
            const route = response.data.routes[0];
            const leg = route.legs[0];

            const polyline = route.overview_polyline.points;
            const stops = [];

            leg.steps.forEach(step => {
                if (step.travel_mode === "TRANSIT" && step.transit_details) {
                    stops.push({
                        name: step.transit_details.departure_stop.name,
                        latitude: step.transit_details.departure_stop.location.lat,
                        longitude: step.transit_details.departure_stop.location.lng,
                    });
                }
            });
            stops.push({
                name: leg.end_address.split(',')[0], // Pega um nome mais limpo para a parada final
                latitude: leg.end_location.lat,
                longitude: leg.end_location.lng
            });
            
            return { polyline, stops };
        }
        return null;
    } catch (error) {
        console.error(`Erro na Directions API para a rota ${originAddress}:`, error.message);
        return null;
    }
}

module.exports = { getCoordinates, getDistanceMatrix, getTransitRoute };