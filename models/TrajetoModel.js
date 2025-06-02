const db = require('../config/db');

class TrajetoModel {
    static async addParadaSequencia({ id_linha, id_ponto, ordem, tempo_desde_inicio_minutos }) {
        const result = await db.query(
        'INSERT INTO sequencia_paradas_linha (id_linha, id_ponto, ordem, tempo_desde_inicio_minutos) VALUES ($1, $2, $3, $4) RETURNING *',
        [id_linha, id_ponto, ordem, tempo_desde_inicio_minutos]
        );
    return result.rows[0];
    }

    static async getSequenciaByLinha(id_linha) {
        const result = await db.query(
            `SELECT sp.*, p.nome_ponto, p.bairro
            FROM sequencia_paradas_linha sp
            JOIN pontos p ON sp.id_ponto = p.id_ponto
            WHERE sp.id_linha = $1
            ORDER BY sp.ordem`,
            [id_linha]
        );
        return result.rows;
    }

    static async getTempoAtePonto(id_linha, id_ponto) {
        const result = await db.query(
            'SELECT tempo_desde_inicio_minutos FROM sequencia_paradas_linha WHERE id_linha = $1 AND id_ponto = $2',
            [id_linha, id_ponto]
        );
        return result.rows[0]; // Retorna { tempo_desde_inicio_minutos: X } ou undefined
    }
}
module.exports = TrajetoModel;