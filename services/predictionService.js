const HorarioModel = require('../models/HorarioModel');
const TrajetoModel = require('../models/TrajetoModel');

function timeToMinutes(timeStr) { // "HH:MM" ou "HH:MM:SS"
    const parts = timeStr.split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

function minutesToTime(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60) % 24; // %24 para lidar com horários que passam da meia-noite
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

async function getProximosHorarios(id_linha, id_ponto, dia_semana, hora_atual_str) {
    const paradaInfo = await TrajetoModel.getTempoAtePonto(id_linha, id_ponto);
    if (!paradaInfo || typeof paradaInfo.tempo_desde_inicio_minutos === 'undefined') {
        throw new Error('Ponto não encontrado na sequência da linha ou tempo de trajeto não definido.');
    }
    const tempoEstimadoAtePonto = paradaInfo.tempo_desde_inicio_minutos;

    const horariosSaidaTerminal = await HorarioModel.getHorariosSaidaByLinha(id_linha, dia_semana);
    if (!horariosSaidaTerminal || horariosSaidaTerminal.length === 0) {
        return []; // Sem horários de saída para esta linha/dia
    }

    const horaAtualEmMinutos = timeToMinutes(hora_atual_str);
    const proximosHorariosEstimados = [];

    for (const horarioSaida of horariosSaidaTerminal) {
        const horarioSaidaEmMinutos = timeToMinutes(horarioSaida);
        const horarioChegadaEstimadoEmMinutos = horarioSaidaEmMinutos + tempoEstimadoAtePonto;

        if (horarioChegadaEstimadoEmMinutos >= horaAtualEmMinutos) {
            proximosHorariosEstimados.push(minutesToTime(horarioChegadaEstimadoEmMinutos));
        }
    }

    // Ordena (embora já devam estar ordenados pela query de horariosSaidaTerminal) e retorna
    return proximosHorariosEstimados.sort().slice(0, 3); // Retorna os próximos 3, por exemplo
}

module.exports = { getProximosHorarios };