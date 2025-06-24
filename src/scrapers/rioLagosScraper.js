const cheerio = require('cheerio');

const urls = {
    SEMANA: "https://www.riolagostransportes.com.br/segunda-%C3%A0-sexta",
    SABADO: "https://www.riolagostransportes.com.br/sabados",
    DOMINGO: "https://www.riolagostransportes.com.br/domingos",
};

async function scrapePage(browser, url, dayType) {
    const page = await browser.newPage();
    try {
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });
        const contentSelector = 'div[data-testid="richTextElement"]';
        await page.waitForSelector(contentSelector, { timeout: 30000 });
        const content = await page.content();
        const $ = cheerio.load(content);
        const pageLines = [];
        let currentLineData = null;

        $('div[data-testid="richTextElement"]').each((index, block) => {
            const h1Text = $(block).find('h1').text().trim();
            const pElements = $(block).find('p');

            if (h1Text && h1Text.includes(' X ')) {
                if (currentLineData) pageLines.push(currentLineData);
                
                const [rawOrigin, rawDestination] = h1Text.split(' X ');
                currentLineData = {
                    origin: rawOrigin.trim().toUpperCase(),
                    destination: rawDestination.trim().toUpperCase(),
                    dayType,
                    schedules: []
                };
            } 
            else if (pElements.length > 0 && currentLineData) {
                let currentDirection = '';
                pElements.each((i, p) => {
                    const lineText = $(p).text().trim();
                    if (!lineText) return;

                    if (lineText.toLowerCase().startsWith('saídas de')) {
                        currentDirection = lineText;
                    } else {
                        const lineNumberMatch = lineText.match(/LINHA\s*(\w+):/i);
                        const lineNumber = lineNumberMatch ? lineNumberMatch[1] : null;
                        
                        const times = lineText.split(/ – | - | /).map(t => t.trim());
                        times.forEach(timeSegment => {
                            const cleanTime = timeSegment.match(/(\d{1,2}:\d{2})/);
                            if (cleanTime) {
                                let formattedTime = cleanTime[0];
                                if (formattedTime.length === 4) formattedTime = '0' + formattedTime;
                                const notes = timeSegment.includes('VIA') ? timeSegment.substring(timeSegment.indexOf('VIA')) : null;
                                currentLineData.schedules.push({ time: formattedTime, direction: currentDirection, notes, lineNumber });
                            }
                        });
                    }
                });
            }
        });
        
        if (currentLineData) pageLines.push(currentLineData);
        return pageLines;
    } finally {
        await page.close();
    }
}

async function scrapeRioLagos(browser) {
    console.log('Iniciando scraper da Rio Lagos...');
    let allLines = [];
    for (const [dayType, url] of Object.entries(urls)) {
        console.log(`- Fazendo scraping dos horários de: ${dayType}`);
        const linesFromPage = await scrapePage(browser, url, dayType);
        allLines.push(...linesFromPage);
    }
    console.log(`Scraper da Rio Lagos finalizado. ${allLines.length} registros de linhas/dias encontrados.`);
    return allLines;
}

module.exports = { scrapeRioLagos };