// src/services/geminiService.js
const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

async function getArrivalPrediction({ line, distanceText, durationText, stopName, departureTime, currentTime }) {
    // --- A CORREÇÃO FINAL ESTÁ AQUI ---
    // Trocamos o modelo "gemini-pro" (antigo) pelo "gemini-1.5-flash-latest" (novo, rápido e eficiente).
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });
    // --- FIM DA CORREÇÃO ---

    const prompt = `
    Aja como um especialista em logística de transporte público da cidade de Saquarema.
    O horário atual é ${currentTime}.
    Um ônibus da linha ${line.number} (trajeto: ${line.origin} para ${line.destination}) partiu do ponto inicial aproximadamente às ${departureTime}.
    O Google Maps estima que a viagem da posição atual do ônibus até a parada "${stopName}" leva cerca de ${durationText} e a distância é de ${distanceText}.

    Com base nestes dados, e considerando o trânsito normal de uma cidade pequena como Saquarema e as paradas no caminho, qual é o horário de chegada mais provável do ônibus na parada "${stopName}"?

    Responda APENAS com o horário estimado no formato "HH:MM" e, se quiser, um breve comentário de confiança. Exemplo: "18:45 (previsão com alta confiança)" ou simplesmente "18:45".
    `;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        
        if (response.promptFeedback?.blockReason) {
            console.error(`Erro na Gemini API: A requisição foi bloqueada. Motivo: ${response.promptFeedback.blockReason}`);
            return `A previsão foi bloqueada por políticas de segurança. Motivo: ${response.promptFeedback.blockReason}`;
        }

        return response.text();
    } catch (error) {
        console.error("--- ERRO DETALHADO DA API GEMINI ---");
        console.error("Um erro ocorreu ao tentar se comunicar com a API do Gemini.");
        console.error("Causas comuns: Chave de API inválida, faturamento não ativado no projeto Google Cloud, ou a API 'Generative Language' não está habilitada.");
        console.error("Erro original:", error.message);
        console.error("------------------------------------");
        return "Não foi possível estimar o horário de chegada no momento.";
    }
}

module.exports = { getArrivalPrediction };