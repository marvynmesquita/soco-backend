const db = require('../config/db');

class PontoModel {
    static async create({ nome_ponto, bairro, latitude, longitude }) {
    const result = await db.query(
        'INSERT INTO pontos (nome_ponto, bairro, latitude, longitude) VALUES ($1, $2, $3, $4) RETURNING *',
        [nome_ponto, bairro, latitude, longitude]
    );
    return result.rows[0];
    }

    static async getAll(bairro) {
        let query = 'SELECT * FROM pontos';
        const queryParams = [];
        if (bairro) {
            queryParams.push(bairro);
            query += ' WHERE bairro ILIKE $1'; // ILIKE para case-insensitive
        }
        query += ' ORDER BY bairro, nome_ponto';
        const result = await db.query(query, queryParams);
        return result.rows;
    }

    static async findById(id_ponto) {
        const result = await db.query('SELECT * FROM pontos WHERE id_ponto = $1', [id_ponto]);
        return result.rows[0];
    }
}

module.exports = PontoModel;