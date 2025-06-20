const db = require('../config/db');

class LinhaModel {
    static async create({ nome_linha }) {
        const result = await db.query(
            'INSERT INTO linhas (nome_linha) VALUES ($1) RETURNING *',
            [nome_linha]
        );
        return result.rows[0];
    }

    static async getAll() {
        const result = await db.query('SELECT * FROM linhas ORDER BY nome_linha');
        return result.rows;
    }

    static async findById(id_linha) {
        const result = await db.query('SELECT * FROM linhas WHERE id_linha = $1', [id_linha]);
        return result.rows[0];
    }

    static async findByName(nome_linha) {
        const result = await db.query('SELECT * FROM linhas WHERE nome_linha = $1', [nome_linha]);
        return result.rows[0];
    }

    static async findByPontoIds(pontoIds) {
        if (!pontoIds || pontoIds.length === 0) {
            return [];
        }
        // Usamos SELECT DISTINCT para evitar retornar a mesma linha múltiplas vezes
        // se ela passar por mais de um ponto próximo.
        const query = `
            SELECT DISTINCT l.id_linha, l.nome_linha
            FROM linhas l
            JOIN sequencia_paradas_linha spl ON l.id_linha = spl.id_linha
            WHERE spl.id_ponto = ANY($1::int[])
            ORDER BY l.nome_linha;
        `;
        const params = [pontoIds];
        const result = await db.query(query, params);
        return result.rows;
    }
}

module.exports = LinhaModel;