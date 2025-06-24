const { PrismaClient } = require('@prisma/client');
const { bacaxaMombacaRoute } = require('./manual-data.js');

const prisma = new PrismaClient();

// Defina aqui o NÚMERO da linha que você está atualizando
const LINE_NUMBER_TO_UPDATE = '21'; 
const LINE_ORIGIN = 'BACAXÁ';
const LINE_DESTINATION = 'MOMBAÇA';

async function main() {
    console.log(`--- Iniciando Seeding Manual para a Linha ${LINE_NUMBER_TO_UPDATE} ---`);

    // 1. Encontra e remove os dados da rota antiga para limpar o caminho
    const oldLine = await prisma.line.findUnique({
        where: { number: LINE_NUMBER_TO_UPDATE }
    });

    if (oldLine) {
        console.log(`-> Linha ${LINE_NUMBER_TO_UPDATE} encontrada. Removendo associações de paradas antigas...`);
        await prisma.stopOnRoute.deleteMany({
            where: { lineId: oldLine.id }
        });
        console.log(`   Associações antigas removidas.`);
    }

    // 2. Garante que a linha principal exista
    const line = await prisma.line.upsert({
        where: { number: LINE_NUMBER_TO_UPDATE },
        update: {}, // Não atualiza nada se já existir
        create: {
            number: LINE_NUMBER_TO_UPDATE,
            origin: LINE_ORIGIN,
            destination: LINE_DESTINATION,
        }
    });
    console.log(`-> Linha ${line.number} garantida no banco.`);


    // 3. Insere as paradas da sua lista manual e cria a nova rota
    console.log(`-> Inserindo/Atualizando ${bacaxaMombacaRoute.length} paradas e conectando à linha...`);
    for (const stopData of bacaxaMombacaRoute) {
        const stopId = `${stopData.lat}_${stopData.lng}`;
        
        const stop = await prisma.stop.upsert({
            where: { id: stopId },
            update: { name: stopData.name },
            create: {
                id: stopId,
                name: stopData.name,
                latitude: stopData.lat,
                longitude: stopData.lng
            }
        });

        // Cria a relação ordenada na tabela StopOnRoute
        await prisma.stopOnRoute.create({
            data: {
                lineId: line.id,
                stopId: stop.id,
                sequence: stopData.sequence
            }
        });
    }

    console.log(`   ${bacaxaMombacaRoute.length} paradas processadas com sucesso!`);
    console.log("--- Seeding Manual Concluído ---");
}

main()
    .catch((e) => {
        console.error("Ocorreu um erro durante o seeding manual:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });