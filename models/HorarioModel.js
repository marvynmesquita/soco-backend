const db = require('../config/db');

class HorarioModel {
    static async addHorarioSaida({ id_linha, dia_semana, horario_saida }) {
        const result = await db.query(
            'INSERT INTO horarios_saida_terminal (id_linha, dia_semana, horario_saida) VALUES ($1, $2, $3) RETURNING *',
            [id_linha, dia_semana, horario_saida]
        );
        return result.rows[0];
    }

    static async getHorariosSaidaByLinha(id_linha, dia_semana) {
        let queryText = 'SELECT horario_saida FROM horarios_saida_terminal WHERE id_linha = $1';
        const queryParams = [id_linha];

        if (dia_semana) {
            queryText += ' AND dia_semana = $2';
            queryParams.push(dia_semana);
        }
        queryText += ' ORDER BY horario_saida';

        const result = await db.query(queryText, queryParams);
        return result.rows.map(r => r.horario_saida); // Retorna apenas os horários como strings "HH:MM:SS"
    }
}
module.exports = HorarioModel;