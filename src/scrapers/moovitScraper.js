const puppeteer = require('puppeteer');
const MOOVIT_LINES_PAGE_URL = 'https://moovitapp.com/index/pt-br/transporte_público-lines-Rio_de_Janeiro-322-1186896';

async function scrapeAllMoovitLineLinks(browser) {
    console.log('Coletando todos os links de linhas do Moovit...');
    const page = await browser.newPage();
    try {
        await page.goto(MOOVIT_LINES_PAGE_URL, { waitUntil: 'networkidle2' });
        await page.waitForSelector('ul.lines-list');
        const lineLinks = await page.evaluate(() => {
            const links = [];
            document.querySelectorAll('ul.lines-list li.line-item a').forEach(anchor => {
                const title = anchor.querySelector('.line-title-wrapper')?.innerText.trim();
                if (title && anchor.href) {
                    links.push({ title, url: anchor.href });
                }
            });
            return links;
        });
        console.log(` -> ${lineLinks.length} links de linhas encontrados no Moovit.`);
        return lineLinks;
    } finally {
        await page.close();
    }
}

async function scrapeStopNamesFromMoovit(lineUrl, browser) {
    const page = await browser.newPage();
    try {
        console.log(`   Buscando nomes de paradas em: ${lineUrl}`);
        await page.goto(lineUrl, { waitUntil: 'networkidle2' });
        const cookieButtonSelector = '#onetrust-accept-btn-handler';
        try {
            await page.waitForSelector(cookieButtonSelector, { timeout: 5000 });
            await page.click(cookieButtonSelector);
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
        } catch (e) {}
        
        const stopsListSelector = 'ul.stops-list.bordered';
        await page.waitForSelector(stopsListSelector, { timeout: 20000 });
        
        const stopNames = await page.evaluate(() => 
            Array.from(document.querySelectorAll('ul.stops-list li.stop-container h3')).map(h3 => h3.innerText.trim())
        );
        return stopNames;
    } finally {
        await page.close();
    }
}

module.exports = { scrapeAllMoovitLineLinks, scrapeStopNamesFromMoovit };