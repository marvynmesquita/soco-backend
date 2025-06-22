// src/services/googleMapsService.js
const { Client } = require("@googlemaps/google-maps-services-js");
require('dotenv').config();

const client = new Client({});

async function getCoordinates(address) {
    console.log(`Geocodificando endereço: ${address}`);
    try {
        const response = await client.geocode({
            params: {
                address: address,
                key: process.env.MAPS_API_KEY,
                region: 'BR', // Prioriza resultados no Brasil
            },
        });
        if (response.data.results && response.data.results.length > 0) {
            return response.data.results[0].geometry.location;
        }
        console.warn(`Nenhum resultado de geocodificação para: ${address}`);
        return null;
    } catch (error) {
        console.error("Erro na Geocoding API:", error.response?.data?.error_message || error.message);
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
                travelMode: 'DRIVING',
                units: 'metric',
            },
        });
        if (response.data.rows[0].elements[0].status === "OK") {
            return response.data.rows[0].elements[0]; // Retorna { distance, duration }
        }
        return null;
    } catch (error) {
        console.error("Erro na Distance Matrix API:", error.message);
        return null;
    }
}

module.exports = { getCoordinates, getDistanceMatrix };