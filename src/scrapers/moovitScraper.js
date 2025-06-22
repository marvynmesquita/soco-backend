// src/scrapers/moovitScraper.js
const puppeteer = require('puppeteer');
const { getCoordinates } = require('../services/googleMapsService');

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
        console.log(`${lineLinks.length} links de linhas encontrados no Moovit.`);
        return lineLinks;
    } catch (error) {
        console.error(`Erro ao coletar links do Moovit: ${error.message}`);
        return [];
    } finally {
        await page.close();
    }
}

async function scrapeMoovitLineDetails(lineUrl, browser) {
    console.log(`Coletando detalhes da linha: ${lineUrl}`);
    const page = await browser.newPage();
    try {
        await page.goto(lineUrl, { waitUntil: 'networkidle2' });
        const cookieButtonSelector = '#onetrust-accept-btn-handler';
        try {
            console.log('  Procurando por pop-up de cookies...');
            await page.waitForSelector(cookieButtonSelector, { timeout: 5000 });
            await page.click(cookieButtonSelector);
            console.log('  Pop-up de cookies aceito.');
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
        } catch (e) {
            console.log('  Nenhum pop-up de cookies encontrado, continuando...');
        }
        
        const stopsListSelector = 'ul.stops-list.bordered';
        console.log(`  Aguardando pela lista de paradas (seletor: ${stopsListSelector})...`);
        await page.waitForSelector(stopsListSelector, { timeout: 20000 });
        console.log('  Lista de paradas encontrada.');

        const lineData = await page.evaluate(() => {
            const h1Element = document.querySelector('h1.line-page-header');
            const lineNumber = h1Element ? h1Element.innerText.trim() : 'N/A';
            const stops = [];
            document.querySelectorAll('ul.stops-list li.stop-container h3').forEach(stopHeader => {
                if (stopHeader) {
                    stops.push({ name: stopHeader.innerText.trim() });
                }
            });
            return { lineNumber, stops };
        });
        
        // --- CORREÇÃO DA EXTRAÇÃO DO NÚMERO DA LINHA ---
        if (lineData.lineNumber === 'N/A') {
            const pageTitle = await page.title();
            const match = pageTitle.match(/linha (\w+):/); // Procura por "linha [NUMERO]:"
            if (match && match[1]) {
                lineData.lineNumber = match[1];
                console.log(`  Número da linha extraído do título: ${lineData.lineNumber}`);
            } else {
                lineData.lineNumber = pageTitle; // Se não achar, usa o título como fallback
                console.log(`  Não foi possível extrair um número do título, usando título completo: ${lineData.lineNumber}`);
            }
        }

        for (const stop of lineData.stops) {
            await new Promise(resolve => setTimeout(resolve, 250));
            const coords = await getCoordinates(`${stop.name}, Saquarema - RJ`);
            if (coords) {
                stop.latitude = coords.lat;
                stop.longitude = coords.lng;
            }
        }

        const geocodedCount = lineData.stops.filter(s => s.latitude).length;
        console.log(`  Linha ${lineData.lineNumber} - ${geocodedCount} de ${lineData.stops.length} paradas geocodificadas.`);
        return lineData;

    } catch (error) {
        console.error(`  Falha ao processar ${lineUrl}: ${error.message}`);
        return null;
    } finally {
        await page.close();
    }
}

module.exports = { scrapeAllMoovitLineLinks, scrapeMoovitLineDetails };