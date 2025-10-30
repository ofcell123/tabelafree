const { Sequelize } = require('sequelize');

// Configuração do banco de dados
let sequelize;

// Verificar se MySQL está disponível, senão usar SQLite
try {
    sequelize = new Sequelize({
        dialect: 'mysql',
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 3306,
        database: process.env.DB_NAME || 'ofcell_peliculas',
        username: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        logging: process.env.NODE_ENV === 'development' ? console.log : false,
        pool: {
            max: 5,
            min: 0,
            acquire: 30000,
            idle: 10000
        }
    });
} catch (error) {
    console.log('⚠️  MySQL não disponível, usando SQLite para desenvolvimento');
    sequelize = new Sequelize({
        dialect: 'sqlite',
        storage: './database.sqlite',
        logging: process.env.NODE_ENV === 'development' ? console.log : false
    });
}

// Testar conexão
async function testConnection() {
    try {
        await sequelize.authenticate();
        console.log('✅ Conexão com MySQL estabelecida com sucesso');
    } catch (error) {
        console.error('❌ Erro ao conectar com MySQL:', error);
    }
}

module.exports = { sequelize, testConnection };
