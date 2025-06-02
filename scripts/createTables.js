const db = require('../config/db');

const createTables = async () => {
const queryText = `
    CREATE TABLE IF NOT EXISTS linhas (
        id_linha SERIAL PRIMARY KEY,
        nome_linha TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS pontos (
        id_ponto SERIAL PRIMARY KEY,
        nome_ponto TEXT NOT NULL,
        bairro TEXT,
        latitude DECIMAL(10, 8),
        longitude DECIMAL(11, 8)
    );

    CREATE TABLE IF NOT EXISTS horarios_saida_terminal (
        id_horario_saida SERIAL PRIMARY KEY,
        id_linha INTEGER REFERENCES linhas(id_linha) ON DELETE CASCADE,
        dia_semana VARCHAR(10) NOT NULL CHECK (dia_semana IN ('seg-sex', 'sab', 'dom-fer')),
        horario_saida TIME NOT NULL,
        UNIQUE (id_linha, dia_semana, horario_saida) -- Evita horários duplicados para mesma linha e dia
    );

    CREATE TABLE IF NOT EXISTS sequencia_paradas_linha (
        id_sequencia SERIAL PRIMARY KEY,
        id_linha INTEGER REFERENCES linhas(id_linha) ON DELETE CASCADE,
        id_ponto INTEGER REFERENCES pontos(id_ponto) ON DELETE CASCADE,
        ordem INTEGER NOT NULL, -- Ordem da parada na rota da linha
        tempo_desde_inicio_minutos INTEGER NOT NULL, -- Tempo estimado em minutos desde o terminal de origem até esta parada
        UNIQUE (id_linha, id_ponto, ordem), -- Garante que um ponto não se repita na mesma ordem para uma linha
        UNIQUE (id_linha, ordem) -- Garante que a ordem é única para a linha
    );
`;

try {
    console.log('Iniciando criação das tabelas...');
    await db.query(queryText);
    console.log('Tabelas criadas com sucesso ou já existentes!');
    } catch (err) {
        console.error('Erro ao criar tabelas:', err.stack);
    } finally {
        // Encerra a conexão com o banco de dados se o pool foi exportado e usado diretamente
        // Se apenas db.query é usado, o pool gerencia conexões automaticamente.
        // Para um script simples como este, pode ser bom encerrar explicitamente.
        if (db.pool) {
            await db.pool.end();
            console.log('Conexão com o banco de dados encerrada.');
        }
    }
};

createTables();