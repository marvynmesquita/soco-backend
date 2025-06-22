// prisma/seed.js
const { PrismaClient } = require('@prisma/client');
const puppeteer = require('puppeteer');
const { scrapeRioLagos } = require('../src/scrapers/rioLagosScraper');
const { scrapeAllMoovitLineLinks, scrapeMoovitLineDetails } = require('../src/scrapers/moovitScraper');

const prisma = new PrismaClient();

function findMatchingMoovitLine(rioLagosLine, moovitLines) {
    const cleanOrigin = rioLagosLine.origin.replace(/^\d+\s*-\s*/, '').trim();
    const normalizedOrigin = cleanOrigin.toLowerCase();
    const normalizedDestination = rioLagosLine.destination.toLowerCase();
    const bestMatch = moovitLines.find(moovitLine => {
        const moovitTitle = moovitLine.title.toLowerCase();
        return moovitTitle.includes(normalizedOrigin) && moovitTitle.includes(normalizedDestination);
    });
    return bestMatch;
}

async function main() {
    console.log('--- Iniciando o processo de Seeding (Schema Corrigido) ---');
    const browser = await puppeteer.launch({ headless: true });
    
    try {
        // Não precisamos mais resetar aqui, o `migrate reset` já fez isso.
        console.log('1. Coletando dados da Rio Lagos...');
        const rioLagosData = await scrapeRioLagos(browser);
        
        console.log('2. Coletando todos os links de linhas do Moovit...');
        const moovitLineLinks = await scrapeAllMoovitLineLinks(browser);

        console.log('3. Cruzando dados e populando o banco...');
        for (const lineInfo of rioLagosData) {
            const matchingMoovitLine = findMatchingMoovitLine(lineInfo, moovitLineLinks);

            if (matchingMoovitLine) {
                console.log(`-> Match encontrado: [RioLagos] ${lineInfo.origin} X ${lineInfo.destination} -> [Moovit] ${matchingMoovitLine.title}`);
                const moovitDetails = await scrapeMoovitLineDetails(matchingMoovitLine.url, browser);

                if (moovitDetails && moovitDetails.stops.length > 0 && moovitDetails.lineNumber !== 'N/A') {
                    const validStops = moovitDetails.stops.filter(s => s.latitude && s.longitude);
                    
                    if (validStops.length > 0) {
                        await prisma.$transaction(async (tx) => {
                            // --- LÓGICA CORRIGIDA ---
                            // Garante que a linha exista (cria se for a 1ª vez, ignora se já existir)
                            const line = await tx.line.upsert({
                                where: { number: moovitDetails.lineNumber },
                                update: {}, // Não faz nada se a linha já existe
                                create: {
                                    number: moovitDetails.lineNumber,
                                    origin: lineInfo.origin,
                                    destination: lineInfo.destination,
                                }
                            });
                            console.log(`   Linha ${line.number} garantida no banco.`);

                            // Adiciona os horários COM O TIPO DE DIA para a linha encontrada/criada
                            await tx.schedule.createMany({
                                data: lineInfo.schedules.map(s => ({
                                    ...s,
                                    dayType: lineInfo.dayType, // Adiciona o dayType ao horário
                                    lineId: line.id
                                })),
                                skipDuplicates: true,
                            });
                            console.log(`     ${lineInfo.schedules.length} horários de ${lineInfo.dayType} adicionados.`);

                            // Conecta as paradas à linha
                            for (const stop of validStops) {
                                const stopId = `${stop.latitude}_${stop.longitude}`;
                                await tx.stop.upsert({
                                    where: { id: stopId },
                                    update: { lines: { connect: { id: line.id } } },
                                    create: {
                                        id: stopId,
                                        name: stop.name,
                                        latitude: stop.latitude,
                                        longitude: stop.longitude,
                                        lines: { connect: { id: line.id } }
                                    }
                                });
                            }
                             console.log(`     ${validStops.length} paradas conectadas.`);
                        }, { timeout: 60000 });
                    }
                }
            } else {
                console.log(`-- Sem match no Moovit para: ${lineInfo.origin} X ${lineInfo.destination} (${lineInfo.dayType})`);
            }
        }
    } catch (error) {
        console.error("Ocorreu um erro durante o processo de seeding:", error);
    } finally {
        await browser.close();
        await prisma.$disconnect();
        console.log('--- Processo de Seeding Finalizado com Sucesso! ---');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});