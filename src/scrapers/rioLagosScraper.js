// src/scrapers/rioLagosScraper.js
const cheerio = require('cheerio');

const urls = {
    SEMANA: "https://www.riolagostransportes.com.br/segunda-%C3%A0-sexta",
    SABADO: "https://www.riolagostransportes.com.br/sabados",
    DOMINGO: "https://www.riolagostransportes.com.br/domingos",
};

async function scrapePage(browser, url, dayType) {
    const page = await browser.newPage();
    try {
        console.log(`  Navegando para: ${url}`);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        const contentSelector = 'div[data-testid="richTextElement"]';
        console.log(`  Aguardando pelo conteúdo final (seletor: ${contentSelector})...`);
        await page.waitForSelector(contentSelector, { timeout: 30000 });
        console.log(`  Conteúdo final detectado na página principal.`);
        
        const content = await page.content();
        const $ = cheerio.load(content);

        const allLinesOnPage = [];
        let currentLine = null;
        let currentDirection = '';

        const infoBlocks = $('div[data-testid="richTextElement"]');

        infoBlocks.each((index, block) => {
            const h1Text = $(block).find('h1').text().trim();
            const pElements = $(block).find('p');

            if (h1Text && h1Text.includes(' X ')) {
                if (currentLine && currentLine.schedules.length > 0) {
                    allLinesOnPage.push(currentLine);
                }
                
                const [rawOrigin, rawDestination] = h1Text.split(' X ');
                const origin = rawOrigin.replace(/^\d+\s*-\s*/, '').trim().toUpperCase();
                const destination = rawDestination.replace(/^\d+\s*-\s*/, '').trim().toUpperCase();

                currentLine = { origin, destination, dayType, schedules: [] };
                console.log(`    Iniciando nova linha: ${origin} X ${destination}`);
            }
            else if (h1Text && h1Text.includes(' P/ ')) {
                currentDirection = h1Text;
                console.log(`      Definindo sentido: ${currentDirection}`);
            }
            else if (pElements.length > 0 && currentLine) {
                pElements.each((i, p) => {
                    const fullText = $(p).text().trim().replace(/\u00A0/g, ' ');
                    const timeMatch = fullText.match(/(\d{1,2}:\d{2})/);
                    
                    if (timeMatch) {
                        let formattedTime = timeMatch[0];
                        if (formattedTime.length === 4) formattedTime = '0' + formattedTime;
                        
                        const notes = fullText.includes('VIA') ? fullText.substring(fullText.indexOf('VIA')) : null;
                        
                        currentLine.schedules.push({
                            time: formattedTime,
                            direction: currentDirection,
                            notes: notes,
                        });
                    }
                });
            }
        });
        
        if (currentLine && currentLine.schedules.length > 0) {
            allLinesOnPage.push(currentLine);
        }

        return allLinesOnPage;

    } finally {
        await page.close();
    }
}

async function scrapeRioLagos(browser) {
    console.log('Iniciando scraper da Rio Lagos...');
    let allLines = [];
    for (const [dayType, url] of Object.entries(urls)) {
        try {
            console.log(`- Fazendo scraping dos horários de: ${dayType}`);
            const linesFromPage = await scrapePage(browser, url, dayType);
            allLines = allLines.concat(linesFromPage);
        } catch (error) {
            console.error(`  Erro ao fazer scraping da URL de ${dayType}: ${error.message}`);
        }
    }
    
    console.log(`Scraper da Rio Lagos finalizado. ${allLines.length} registros de linhas/dias encontrados.`);
    return allLines;
}

module.exports = { scrapeRioLagos };