// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const { scrapeRioLagos } = require('../src/scrapers/rioLagosScraper');
const { getTransitRoute } = require('../src/services/googleMapsService');
const puppeteer = require('puppeteer');


const prisma = new PrismaClient();

async function main() {
    console.log('--- Iniciando o processo de Seeding v2 (com Google Maps) ---');
    const browser = await puppeteer.launch({ headless: true });

    try {
        console.log('1. Coletando dados da Rio Lagos...');
        const rioLagosData = await scrapeRioLagos(browser);
        if (rioLagosData.length === 0) {
            console.error('Nenhuma linha encontrada na Rio Lagos. Abortando.');
            return;
        }

        const uniqueLines = rioLagosData.filter((line, index, self) =>
            index === self.findIndex((l) => (
                l.origin === line.origin && l.destination === line.destination
            ))
        );

        console.log(`2. Encontradas ${uniqueLines.length} linhas únicas. Buscando rotas no Google Maps...`);

        for (const lineInfo of uniqueLines) {
            // Pequena pausa para não sobrecarregar a API do Google
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const routeData = await getTransitRoute(`${lineInfo.origin}, Saquarema, RJ`, `${lineInfo.destination}, Saquarema, RJ`);

            if (routeData && routeData.stops.length > 0) {
                console.log(` -> Rota encontrada para ${lineInfo.origin} X ${lineInfo.destination}. Salvando no banco...`);
                
                const lineNumberMatch = lineInfo.origin.match(/^\d+/);
                const lineNumber = lineNumberMatch ? lineNumberMatch[0] : `${lineInfo.origin.slice(0, 3)}-${lineInfo.destination.slice(0, 3)}`;

                await prisma.$transaction(async (tx) => {
                    const line = await tx.line.upsert({
                        where: { number: lineNumber },
                        update: { polyline: routeData.polyline },
                        create: {
                            number: lineNumber,
                            origin: lineInfo.origin,
                            destination: lineInfo.destination,
                            polyline: routeData.polyline,
                        }
                    });

                    for (const [index, stopData] of routeData.stops.entries()) {
                        const stopId = `${stopData.latitude}_${stopData.longitude}`;
                        const stop = await tx.stop.upsert({
                            where: { id: stopId },
                            update: {},
                            create: {
                                id: stopId,
                                name: stopData.name,
                                latitude: stopData.latitude,
                                longitude: stopData.longitude,
                            }
                        });

                        await tx.stopOnRoute.upsert({
                            where: { lineId_stopId: { lineId: line.id, stopId: stop.id } },
                            update: { sequence: index + 1 },
                            create: {
                                lineId: line.id,
                                stopId: stop.id,
                                sequence: index + 1,
                            }
                        });
                    }

                    const allSchedulesForThisLine = rioLagosData.filter(l => l.origin === lineInfo.origin && l.destination === lineInfo.destination);
                    for (const scheduleInfo of allSchedulesForThisLine) {
                         await tx.schedule.createMany({
                            data: scheduleInfo.schedules.map(s => ({
                                ...s,
                                dayType: scheduleInfo.dayType,
                                lineId: line.id
                            })),
                            skipDuplicates: true,
                        });
                    }
                    console.log(`    Linha ${line.number} e suas ${routeData.stops.length} paradas foram salvas/atualizadas.`);
                }, { timeout: 60000 });
            }
        }
    } catch (error) {
        console.error("Ocorreu um erro durante o processo de seeding:", error);
    } finally {
        await browser.close();
        await prisma.$disconnect();
        console.log('--- Processo de Seeding Finalizado! ---');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});