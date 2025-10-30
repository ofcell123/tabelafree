const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

/**
 * Parser de CSV baseado no modelo fornecido
 * Formato esperado: modelo,compatibilidade
 * Onde compatibilidade pode ser:
 * - Lista de modelos compatíveis separados por " / "
 * - "Este Modelo já está disponível na tabela VIP" (para VIP)
 */
class CSVParser {
    constructor() {
        this.results = [];
    }

    /**
     * Processa um arquivo CSV e retorna os dados estruturados
     * @param {string} filePath - Caminho para o arquivo CSV
     * @returns {Promise<Array>} Array de objetos película
     */
    async parseFile(filePath) {
        return new Promise((resolve, reject) => {
            const results = [];
            
            fs.createReadStream(filePath)
                .pipe(csv({
                    headers: false, // Não usar primeira linha como header
                    skipEmptyLines: true
                }))
                .on('data', (row) => {
                    const data = this.processRow(row);
                    if (data) {
                        results.push(data);
                    }
                })
                .on('end', () => {
                    console.log(`✅ CSV processado: ${results.length} registros encontrados`);
                    resolve(results);
                })
                .on('error', (error) => {
                    console.error('❌ Erro ao processar CSV:', error);
                    reject(error);
                });
        });
    }

    /**
     * Processa uma linha do CSV
     * @param {Object} row - Linha do CSV
     * @returns {Object|null} Objeto película ou null se inválido
     */
    processRow(row) {
        // Pega os valores da linha (csv-parser com headers: false retorna como array)
        const values = Object.values(row);
        
        if (values.length < 2) {
            return null;
        }

        const modelo = values[0].trim();
        const compatibilidade = values[1].trim();
        const htmlContent = values[2] ? values[2].trim() : null; // Terceira coluna opcional para HTML

        // Pular linhas vazias ou inválidas
        if (!modelo || !compatibilidade) {
            return null;
        }

        // Verificar se é VIP
        const isVip = compatibilidade.toLowerCase().includes('vip') || 
                     compatibilidade.toLowerCase().includes('disponível na tabela');

        let compatibilidadeArray = [];
        let compativel = true;

        if (isVip) {
            // É VIP - não tem compatibilidade
            compativel = false;
            compatibilidadeArray = [];
        } else {
            // Não é VIP - processar compatibilidade
            compatibilidadeArray = this.parseCompatibility(compatibilidade);
            compativel = compatibilidadeArray.length > 0;
        }

        const result = {
            modelo: modelo,
            compatibilidade: compatibilidadeArray,
            vip: isVip,
            compativel: compativel
        };

        // Adicionar HTML se fornecido
        if (htmlContent && htmlContent.length > 0) {
            result.html_content = htmlContent;
        }

        return result;
    }

    /**
     * Processa a string de compatibilidade
     * @param {string} compatibilidade - String de compatibilidade
     * @returns {Array} Array de modelos compatíveis
     */
    parseCompatibility(compatibilidade) {
        // Remove botões e links HTML
        const cleanText = compatibilidade
            .replace(/<button[^>]*>.*?<\/button>/gi, '')
            .replace(/<a[^>]*>.*?<\/a>/gi, '')
            .replace(/<[^>]*>/g, '')
            .trim();

        // Se contém "vip" ou "disponível", é VIP
        if (cleanText.toLowerCase().includes('vip') || 
            cleanText.toLowerCase().includes('disponível')) {
            return [];
        }

        // Dividir por separadores comuns
        const separators = [' / ', '/', ' /', '/ ', '  '];
        let parts = [cleanText];

        for (const separator of separators) {
            const newParts = [];
            parts.forEach(part => {
                newParts.push(...part.split(separator));
            });
            parts = newParts;
        }

        // Limpar e filtrar
        return parts
            .map(part => part.trim())
            .filter(part => part.length > 0 && !part.toLowerCase().includes('vip'))
            .filter(part => !part.toLowerCase().includes('disponível'));
    }

    /**
     * Valida se um arquivo CSV está no formato correto
     * @param {string} filePath - Caminho do arquivo
     * @returns {Promise<boolean>} True se válido
     */
    async validateCSV(filePath) {
        try {
            const results = await this.parseFile(filePath);
            
            // Verificar se tem pelo menos um registro válido
            if (results.length === 0) {
                return false;
            }

            // Verificar se todos os registros têm modelo
            const validRecords = results.filter(record => 
                record.modelo && record.modelo.trim().length > 0
            );

            return validRecords.length > 0;
        } catch (error) {
            console.error('Erro ao validar CSV:', error);
            return false;
        }
    }
}

module.exports = CSVParser;
