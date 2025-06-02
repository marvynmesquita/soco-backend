const axios = require('axios');
const cheerio = require('cheerio');
const LinhaModel = require('../models/LinhaModel');
const HorarioModel = require('../models/HorarioModel');

const urls = {
    'seg-sex': 'https://www.riolagostransportes.com.br/segunda-%C3%A0-sexta',
    'sab': 'https://www.riolagostransportes.com.br/sabados',
    'dom-fer': 'https://www.riolagostransportes.com.br/domingos'
  };

// Função para normalizar e validar horário (HH:MM)
function formatTime(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.match(/(\d{1,2}):(\d{2})/);
    if (parts) {
        const h = parseInt(parts[1], 10);
        const m = parseInt(parts[2], 10);
        if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        }
    }
    return null; // Retorna null se o formato for inválido
}


async function scrapeAndPopulate() {
    console.log('Iniciando scraping...');
    let linhasAdicionadasCount = 0;
    let horariosAdicionadosCount = 0;

    for (const [dia_semana, url] of Object.entries(urls)) {
        try {
            console.log(`Processando ${dia_semana} da URL: ${url}`);
            const { data } = await axios.get(url);
            const $ = cheerio.load(data);

            // Seletor para os blocos que contêm nome da linha e horários.
            // Este seletor é ALTAMENTE DEPENDENTE da estrutura do site Wix e pode quebrar.
            // Ele busca por parágrafos que parecem ser títulos de linha (negrito)
            // e os parágrafos subsequentes que contêm os horários.
            // A estrutura exata pode variar, inspecione o HTML do site para ajustar.
      
            // Tentativa de um seletor mais genérico para os contêineres de cada linha/horário
            // Isso é uma suposição, pode precisar de ajuste fino.
            // Geralmente, informações de linha e seus horários estão visualmente agrupadas.
            // Vamos procurar por elementos que contêm o nome da linha em negrito.
            $('p.font_8:has(span[style*="font-weight:bold"])').each(async (i, elLinha) => {
                const nomeLinhaElement = $(elLinha).find('span[style*="font-weight:bold"]').last();
                let nomeLinha = nomeLinhaElement.text().trim().toUpperCase();
        
                if (!nomeLinha) {
                    // Tenta um seletor alternativo se o primeiro falhar
                    nomeLinha = $(elLinha).find('span[data-testid="stylable-text-wrapper"]').first().text().trim().toUpperCase();
                }

                // Remove múltiplos espaços e normaliza
                nomeLinha = nomeLinha.replace(/\s\s+/g, ' ');


                if (nomeLinha) {
                        console.log(`  Linha encontrada: ${nomeLinha}`);
                        let linha = await LinhaModel.findByName(nomeLinha);
                        if (!linha) {
                            try {
                                    linha = await LinhaModel.create({ nome_linha: nomeLinha });
                                    console.log(`    Linha "${nomeLinha}" adicionada ao banco com ID ${linha.id_linha}.`);
                                    linhasAdicionadasCount++;
                                } catch (err) {
                                    if (err.code === '23505') { // Unique violation
                                    console.warn(`    Linha "${nomeLinha}" já existe (concorrência ou nome similar). Buscando novamente.`);
                                    linha = await LinhaModel.findByName(nomeLinha);
                                } else {
                                    console.error(`    Erro ao criar linha "${nomeLinha}":`, err.message);
                                    return; // Pula para a próxima linha
                                }   
                            }
                        } else {
                             console.log(`    Linha "${nomeLinha}" já existe no banco com ID ${linha.id_linha}.`);
                        }   

                    if (!linha || !linha.id_linha) {
                        console.error(`    Não foi possível obter ID para a linha "${nomeLinha}". Pulando horários.`);
                        return;
                    }

                    // O próximo elemento <p> geralmente contém os horários
                    const horariosElement = $(elLinha).next('p.font_8');
                    let horariosText = horariosElement.text().trim();
          
                    // Se o próximo não for, tenta o próximo do próximo (às vezes tem <p> vazios)
                    if (!horariosText && horariosElement.next('p.font_8').length) {
                        horariosText = horariosElement.next('p.font_8').text().trim();
                    }


                    if (horariosText) {
                        // Os horários são separados por " – " ou podem ter outros separadores.
                        // Também podem ter observações como "(ATÉ ÀS ...)" que precisam ser tratadas.
                        // Esta regex tenta capturar HH:MM e ignora o resto.
                        const horariosArray = horariosText.match(/\d{1,2}:\d{2}/g);

                        if (horariosArray) {
                            for (const horarioStr of horariosArray) {
                                const horarioFormatado = formatTime(horarioStr);
                                if (horarioFormatado) {
                                    try {
                                        await HorarioModel.addHorarioSaida({
                                            id_linha: linha.id_linha,
                                            dia_semana: dia_semana,
                                            horario_saida: horarioFormatado
                                        });
                                        // console.log(`      Horário ${horarioFormatado} para ${dia_semana} adicionado para linha ID ${linha.id_linha}.`);
                                        horariosAdicionadosCount++;
                                        } catch (err) {
                                            if (err.code === '23505') { // Unique violation
                                                    console.warn(`      Horário ${horarioFormatado} para ${dia_semana} da linha ID ${linha.id_linha} já existe.`);
                                            } else {
                                                    console.error(`      Erro ao adicionar horário ${horarioFormatado} para linha ID ${linha.id_linha}:`, err.message);
                                            }
                                    }
                                } else {
                                    console.warn(`      Formato de horário inválido encontrado e ignorado: "${horarioStr}"`);
                                }
                            }
                        } else {
                            console.warn(`    Nenhum horário numérico (HH:MM) encontrado para a linha "${nomeLinha}" no texto: "${horariosText.substring(0, 100)}..."`);
                        }
                    } else {
                        console.warn(`    Texto de horários não encontrado ou vazio para a linha "${nomeLinha}". Elemento seguinte: ${horariosElement.html()}`);
                    }
                } else {
                    console.warn("  Elemento de linha não produziu nome:", $(elLinha).html().substring(0,100) + "...");
                }
            }
            );

        } catch (error) {
            console.error(`Erro ao fazer scraping da URL ${url}:`, error.message);
        }
    }
    console.log('Scraping finalizado.');
    console.log(`Total de novas linhas adicionadas: ${linhasAdicionadasCount}`);
    console.log(`Total de novos horários adicionados: ${horariosAdicionadosCount}`);
    console.log('Lembre-se de cadastrar os PONTOS e a SEQUÊNCIA DE PARADAS manualmente!');
}

module.exports = { scrapeAndPopulate };