const { scrapeAndPopulate } = require('../services/scraperService');
const db = require('../config/db');

async function run() {
    await scrapeAndPopulate();
    // Encerra a conexão com o banco de dados após o script
    if (db.pool) {
        await db.pool.end();
        console.log('Conexão com o banco de dados encerrada pelo script de população.');
    }
}

run().catch(err => {
    console.error("Erro fatal no script de população:", err);
    process.exit(1); // Sai com código de erro
});