const { Pool } = require('pg');
require('dotenv').config(); // Carrega variáveis de ambiente do arquivo .env

const connectionString = process.env.DATABASE_URL;

const pool = new Pool({
    connectionString: connectionString,
    ssl: {
        rejectUnauthorized: false // Necessário para algumas conexões SSL, como Heroku ou Neon
    }
});

pool.on('connect', () => {
    console.log('Conectado ao banco de dados PostgreSQL!');
});

pool.on('error', (err) => {
    console.error('Erro inesperado no cliente do banco de dados', err);
    process.exit(-1);
});

module.exports = {
    query: (text, params) => pool.query(text, params),
    pool, // Exporta o pool para transações, se necessário
};
