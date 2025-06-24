const { PrismaClient } = require('@prisma/client');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { scrapeRioLagos } = require('../src/scrapers/rioLagosScraper');

const prisma = new PrismaClient();
const dataFolderPath = path.join(__dirname, 'data');

/**
 * Processa um único arquivo JSON do Moovit (Lógica Simplificada)
 */
function parseMoovitApiFile(fileName, data) {
    try {
        const allParsedRoutes = new Map();
        const stopMetadata = new Map(data.results.flatMap(r => r.supplementalData?.mVStopSyncedMetaDataList || []).map(stop => [stop.stopId, stop]));
        const lineMetadataList = data.results.flatMap(r => r.supplementalData?.lineGroupSummaryList || []);
        const itineraries = data.results.map(r => r.result.itinerary).filter(Boolean);

        for (const itinerary of itineraries) {
            const transitLeg = itinerary.legs.find(leg => leg.lineWithAlternativesLeg);
            if (!transitLeg) continue;

            for (const line of transitLeg.lineWithAlternativesLeg.alternativeLines) {
                const lineSummary = lineMetadataList.find(l => l.lineSummaries.some(ls => ls.lineId === line.lineId));
                if (!lineSummary) continue; // Apenas checa se existe

                const stopIds = line.stopSequenceIds;
                if (!stopIds || stopIds.length < 2) continue;

                const stops = stopIds.map(id => {
                    const metadata = stopMetadata.get(id);
                    if (!metadata) return null;
                    return {
                        name: metadata.stopName,
                        latitude: metadata.stopLocation.latitude / 1000000.0,
                        longitude: metadata.stopLocation.longitude / 1000000.0,
                    };
                }).filter(Boolean);

                if (stops.length > 1) {
                    const [origin, destination] = (lineSummary.caption1 || "").split(' - ').map(s => s.trim().toUpperCase());
                    if (!origin || !destination) continue;
                    
                    allParsedRoutes.set(lineSummary.lineNumber, {
                        number: lineSummary.lineNumber,
                        origin,
                        destination,
                        polyline: line.shape.polyline,
                        stops
                    });
                }
            }
        }
        return Array.from(allParsedRoutes.values());
    } catch (error) {
        console.error(`--> Erro ao processar o arquivo JSON [${fileName}]:`, error);
        return [];
    }
}


async function main() {
    console.log('--- Iniciando Seeding Definitivo (v14) ---');
    try {
        await prisma.stopOnRoute.deleteMany({});
        await prisma.schedule.deleteMany({});
        await prisma.stop.deleteMany({});
        await prisma.line.deleteMany({});
        console.log("1. Banco de dados limpo.");
        
        // Passo 1: Ler todos os arquivos JSON e criar um mapa de rotas
        const jsonDataFiles = fs.readdirSync(dataFolderPath).filter(file => file.endsWith('.json'));
        const moovitRoutesMap = new Map();
        for (const fileName of jsonDataFiles) {
            const fileContent = fs.readFileSync(path.join(dataFolderPath, fileName), 'utf-8');
            const parsedRoutes = parseMoovitApiFile(fileName, JSON.parse(fileContent));
            for (const route of parsedRoutes) {
                if (!moovitRoutesMap.has(route.number)) {
                    moovitRoutesMap.set(route.number, route);
                }
            }
        }
        console.log(`2. Encontradas ${moovitRoutesMap.size} rotas únicas nos arquivos JSON.`);
        if (moovitRoutesMap.size === 0) {
            console.error("Nenhuma rota foi processada. Verifique os arquivos JSON e o parser.");
            return;
        }

        // Passo 2: Coletar os horários
        console.log("3. Coletando horários da Rio Lagos...");
        const browser = await puppeteer.launch({ headless: true });
        const rioLagosData = await scrapeRioLagos(browser);
        await browser.close();

        // Passo 3: Iterar sobre as rotas encontradas e salvar
        console.log("4. Unindo dados e populando o banco...");
        for (const route of moovitRoutesMap.values()) {
            await prisma.$transaction(async (tx) => {
                // Encontra os horários da Rio Lagos que correspondem ao número da linha do Moovit
                const matchingSchedules = rioLagosData.filter(rl => 
                    rl.schedules.some(s => s.lineNumber === route.number)
                );
                
                const line = await tx.line.create({
                    data: {
                        number: route.number,
                        origin: route.origin,
                        destination: route.destination,
                        polyline: route.polyline
                    }
                });
                
                for (const [index, stopData] of route.stops.entries()) {
                    const stopId = `${stopData.latitude}_${stopData.longitude}`;
                    const stop = await tx.stop.upsert({ where: { id: stopId }, update: { name: stopData.name }, create: { id: stopId, ...stopData } });
                    await tx.stopOnRoute.create({ data: { lineId: line.id, stopId: stop.id, sequence: index + 1 } });
                }
                
                if (matchingSchedules.length > 0) {
                    const allSchedulesToSave = matchingSchedules.flatMap(rl => 
                        rl.schedules
                          .filter(s => s.lineNumber === route.number)
                          .map(({ lineNumber, ...rest }) => ({ ...rest, dayType: rl.dayType, lineId: line.id }))
                    );
                    await tx.schedule.createMany({ data: allSchedulesToSave, skipDuplicates: true });
                    console.log(`   -> SUCESSO: Linha ${route.number} com ${route.stops.length} paradas e ${allSchedulesToSave.length} horários foi salva.`);
                } else {
                    console.log(`   -> AVISO: Nenhum horário encontrado para a Linha ${route.number}. Rota salva sem horários.`);
                }
            }, { timeout: 60000 });
        }

    } catch (error) {
        console.error("Ocorreu um erro durante o processo de seeding:", error);
    } finally {
        await prisma.$disconnect();
        console.log('--- Processo de Seeding Finalizado! ---');
    }
}

main().catch(e => {
    console.error(e);
    process.exit(1);
});