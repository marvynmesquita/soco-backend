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
}

module.exports = LinhaModel;