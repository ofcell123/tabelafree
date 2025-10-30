// Carregar variáveis de ambiente
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const Fuse = require('fuse.js');
const multer = require('multer');
const session = require('express-session');
const bcrypt = require('bcrypt');
const { sequelize, testConnection } = require('./config/database');
const { QueryTypes } = require('sequelize');
const Pelicula = require('./models/Pelicula');
const User = require('./models/User');
const CSVParser = require('./utils/csvParser');


const app = express();
const PORT = process.env.PORT || 3005;

// Middleware
app.use(cors({
    origin: [
        'https://ofcell123-tabelafree.katrocloud.com',
        'https://ofcell123.com.br',
        'https://tabelafree.onrender.com'
    ],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Configurar sessões
app.use(session({
    secret: process.env.SESSION_SECRET || 'ofcell123-secret-key-2024',
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // Para desenvolvimento, em produção usar true com HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 horas
    }
}));

// Configurar multer para upload de arquivos
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, 'peliculas-' + uniqueSuffix + '.csv');
    }
});

const upload = multer({ 
    storage: storage,
    fileFilter: function (req, file, cb) {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
            cb(null, true);
        } else {
            cb(new Error('Apenas arquivos CSV são permitidos'), false);
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB
    }
});

// Remover configuração do Handlebars - não será mais usado

// Função para criar usuário padrão
async function createDefaultUser() {
    try {
        const existingUser = await User.findOne({ where: { username: 'juliocesaradm' } });
        
        if (!existingUser) {
            const hashedPassword = await bcrypt.hash('#_PeliculasAtt', 10);
            
            await User.create({
                username: 'juliocesaradm',
                password: hashedPassword,
                isActive: true
            });
            
            console.log('✅ Usuário padrão criado: juliocesaradm');
        } else {
            console.log('ℹ️  Usuário padrão já existe');
        }
    } catch (error) {
        console.error('❌ Erro ao criar usuário padrão:', error);
    }
}

// Inicializar banco de dados
async function initializeDatabase() {
    try {
        await testConnection();
        await sequelize.sync({ force: false }); // Não recriar tabela para preservar dados
        await createDefaultUser();
        console.log('✅ Banco de dados inicializado com sucesso');
    } catch (error) {
        console.error('❌ Erro ao inicializar banco de dados:', error);
    }
}

// Carregar dados das películas do banco
async function loadPeliculasData() {
    try {
        const peliculas = await Pelicula.findAll({
            order: [['created_at', 'DESC']]
        });
        return { peliculas: peliculas };
    } catch (error) {
        console.error('Erro ao carregar dados das películas:', error);
        return { peliculas: [] };
    }
}

// Configurar Fuse.js para busca fuzzy
function setupFuseSearch(peliculas) {
    const options = {
        keys: [
            {
                name: 'modelo',
                weight: 1.0
            }
        ],
        threshold: 0.2, // 0.0 = busca exata, 1.0 = aceita qualquer coisa (reduzido para maior precisão)
        includeScore: true,
        includeMatches: true,
        minMatchCharLength: 3, // Aumentado para exigir pelo menos 3 caracteres
        ignoreLocation: false, // Mudado para false para considerar a posição das palavras
        findAllMatches: true,
        shouldSort: true, // Ordenar resultados por relevância
        getFn: (obj, path) => {
            // Função personalizada para busca case-insensitive
            const value = obj[path];
            return typeof value === 'string' ? value.toLowerCase() : value;
        }
    };
    
    return new Fuse(peliculas, options);
}

// Função de busca com Fuse.js
function searchPeliculas(peliculas, searchTerm, limit = 5) {
    if (!searchTerm || searchTerm.trim() === '') {
        return peliculas.slice(0, limit);
    }

    // Normalizar o termo de busca (remover espaços extras e converter para minúsculas)
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();
    
    // Se o termo de busca for muito curto, não fazer busca
    if (normalizedSearchTerm.length < 3) {
        return [];
    }

    // Configurar Fuse.js
    const fuse = setupFuseSearch(peliculas);
    
    // Realizar busca fuzzy apenas no campo modelo
    const results = fuse.search(normalizedSearchTerm);
    
    // Extrair apenas os dados originais e aplicar limite
    const filteredResults = results.map(result => result.item).slice(0, limit);
    
    return filteredResults;
}

// Função para embaralhar array (Fisher-Yates shuffle)
function shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

// Rota para preview de CSV (protegida)
app.post('/api/preview-csv', requireAuth, upload.single('csvFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Nenhum arquivo CSV foi enviado'
            });
        }

        const csvPath = req.file.path;
        const csvParser = new CSVParser();
        const previewData = await csvParser.parseFile(csvPath);
        
        // Limpar arquivo temporário
        fs.unlinkSync(csvPath);
        
        res.json({
            success: true,
            data: previewData.slice(0, 20), // Limitar preview a 20 registros
            total: previewData.length
        });
        
    } catch (error) {
        console.error('Erro ao processar preview CSV:', error);
        res.status(500).json({
            success: false,
            message: 'Erro ao processar arquivo CSV',
            error: error.message
        });
    }
});

// Endpoint para upload de CSV (protegido)
app.post('/api/upload-csv', requireAuth, upload.single('csvFile'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Nenhum arquivo CSV foi enviado'
            });
        }

        const csvParser = new CSVParser();
        const filePath = req.file.path;

        // Validar CSV
        const isValid = await csvParser.validateCSV(filePath);
        if (!isValid) {
            // Limpar arquivo temporário
            fs.unlinkSync(filePath);
            return res.status(400).json({
                success: false,
                message: 'Arquivo CSV inválido ou vazio'
            });
        }

        // Processar CSV
        const peliculasData = await csvParser.parseFile(filePath);

        if (peliculasData.length === 0) {
            throw new Error('Nenhum registro válido encontrado no CSV');
        }

        // Remover duplicidades dentro do CSV para evitar violações de unique
        const uniquePeliculasData = [];
        const modelosSet = new Set();
        for (const peliculaData of peliculasData) {
            if (!modelosSet.has(peliculaData.modelo)) {
                modelosSet.add(peliculaData.modelo);
                uniquePeliculasData.push(peliculaData);
            }
        }
        const duplicatesSkipped = peliculasData.length - uniquePeliculasData.length;

        // Limpar dados antigos e inserir os novos dentro de uma transação
        let insertedPeliculas = [];
        const transaction = await sequelize.transaction();
        try {
            await Pelicula.destroy({ where: {}, transaction });

            insertedPeliculas = await Pelicula.bulkCreate(uniquePeliculasData, {
                transaction,
                validate: true,
                returning: true
            });

            await transaction.commit();
        } catch (error) {
            await transaction.rollback();
            throw error;
        }

        // Limpar arquivo temporário
        fs.unlinkSync(filePath);

        const peliculasPreview = insertedPeliculas.slice(0, 10).map(p =>
            typeof p.get === 'function' ? p.get({ plain: true }) : p
        );

        res.json({
            success: true,
            message: 'CSV processado com sucesso',
            data: {
                totalProcessed: peliculasData.length,
                totalInserted: insertedPeliculas.length,
                duplicatesSkipped,
                peliculas: peliculasPreview
            }
        });

    } catch (error) {
        console.error('Erro no upload de CSV:', error);
        
        // Limpar arquivo temporário se existir
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }

        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor',
            error: error.message
        });
    }
});

// Middleware de autenticação
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        return next();
    } else {
        return res.status(401).json({ success: false, message: 'Acesso negado. Faça login primeiro.' });
    }
}

// Rota para servir a área administrativa
app.get('/atualizar-tabela', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/atualizar-tabela.html'));
});

// Rotas de autenticação
app.post('/api/auth/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ 
                success: false, 
                message: 'Usuário e senha são obrigatórios' 
            });
        }

        const user = await User.findOne({ where: { username } });
        
        if (!user || !user.isActive) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciais inválidas' 
            });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        
        if (!isValidPassword) {
            return res.status(401).json({ 
                success: false, 
                message: 'Credenciais inválidas' 
            });
        }

        req.session.userId = user.id;
        req.session.username = user.username;
        
        res.json({ 
            success: true, 
            message: 'Login realizado com sucesso',
            user: { id: user.id, username: user.username }
        });
        
    } catch (error) {
        console.error('Erro no login:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Erro interno do servidor' 
        });
    }
});

app.post('/api/auth/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ 
                success: false, 
                message: 'Erro ao fazer logout' 
            });
        }
        res.json({ 
            success: true, 
            message: 'Logout realizado com sucesso' 
        });
    });
});

app.get('/api/auth/check', (req, res) => {
    if (req.session && req.session.userId) {
        res.json({ 
            success: true, 
            user: { 
                id: req.session.userId, 
                username: req.session.username 
            } 
        });
    } else {
        res.status(401).json({ 
            success: false, 
            message: 'Não autenticado' 
        });
    }
});

// Rota principal - servir o HTML standalone
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public/peliculas-standalone.html'));
});

// Rota de busca
app.get('/search', async (req, res) => {
    try {
        const { q: searchTerm, limit = 5 } = req.query;
        const data = await loadPeliculasData();
        const results = searchPeliculas(data.peliculas, searchTerm, parseInt(limit));
        
        res.json({
            peliculas: results,
            total: results.length,
            hasMore: data.peliculas.length > parseInt(limit)
        });
    } catch (error) {
        console.error('Erro na busca:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    }
});

// Rota para obter todas as películas (para estatísticas)
app.get('/api/stats', async (req, res) => {
    try {
        const data = await loadPeliculasData();
        res.json({
            totalModels: data.peliculas.length,
            vipModels: data.peliculas.filter(p => p.vip).length
        });
    } catch (error) {
        console.error('Erro ao carregar estatísticas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    }
});

// API para obter todas as películas
app.get('/api/peliculas', async (req, res) => {
    try {
        // const { limit } = req.query;
        const limit = 8;
        let parsedLimit = parseInt(limit, 10);

        if (Number.isNaN(parsedLimit) || parsedLimit <= 0) {
            parsedLimit = 8;
        }

        let randomFunction = 'RAND()';
        const dialect = typeof sequelize.getDialect === 'function' ? sequelize.getDialect() : null;
        if (dialect === 'sqlite' || dialect === 'postgres') {
            randomFunction = 'RANDOM()';
        } else if (dialect === 'mssql') {
            randomFunction = 'NEWID()';
        }

        let randomQuery;
        if (dialect === 'mssql') {
            randomQuery = `SELECT TOP (${parsedLimit}) * FROM peliculas ORDER BY ${randomFunction}`;
        } else if (dialect === 'postgres') {
            randomQuery = `SELECT * FROM peliculas ORDER BY ${randomFunction} LIMIT :limit`;
        } else {
            // mysql, sqlite e outros compatíveis com LIMIT
            randomQuery = `SELECT * FROM peliculas ORDER BY ${randomFunction} LIMIT :limit`;
        }

        const [peliculas, total] = await Promise.all([
            sequelize.query(randomQuery, {
                replacements: { limit: parsedLimit },
                type: QueryTypes.SELECT
            }),
            Pelicula.count()
        ]);

        const shuffledPeliculas = shuffleArray(peliculas);

        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');

        res.json({
            success: true,
            data: shuffledPeliculas,
            total,
            returned: shuffledPeliculas.length,
            random: true
        });
    } catch (error) {
        console.error('Erro ao carregar películas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    }
});

// API para obter películas VIP
app.get('/api/peliculas/vip', async (req, res) => {
    try {
        const vipPeliculas = await Pelicula.findAll({
            where: { vip: true },
            order: [['created_at', 'DESC']]
        });
        
        res.json({
            success: true,
            data: vipPeliculas,
            total: vipPeliculas.length
        });
    } catch (error) {
        console.error('Erro ao carregar películas VIP:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    }
});

// API para obter películas não VIP
app.get('/api/peliculas/free', async (req, res) => {
    try {
        const freePeliculas = await Pelicula.findAll({
            where: { vip: false },
            order: [['created_at', 'DESC']]
        });
        
        res.json({
            success: true,
            data: freePeliculas,
            total: freePeliculas.length
        });
    } catch (error) {
        console.error('Erro ao carregar películas gratuitas:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    }
});

// API para obter películas por ID
app.get('/api/peliculas/:id', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pelicula = await Pelicula.findByPk(id);
        
        if (pelicula) {
            res.json({
                success: true,
                data: pelicula
            });
        } else {
            res.status(404).json({
                success: false,
                message: 'Película não encontrada'
            });
        }
    } catch (error) {
        console.error('Erro ao carregar película:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    }
});

// API para busca avançada
app.get('/api/search', async (req, res) => {
    try {
        const { q: searchTerm, limit = 10, vip_only = false, free_only = false } = req.query;
        const data = await loadPeliculasData();
        
        let peliculas = data.peliculas;
        
        // Filtrar por tipo se especificado
        if (vip_only === 'true') {
            peliculas = peliculas.filter(p => p.vip);
        } else if (free_only === 'true') {
            peliculas = peliculas.filter(p => !p.vip);
        }
        
        const results = searchPeliculas(peliculas, searchTerm, parseInt(limit));
        
        res.json({
            success: true,
            data: results,
            total: results.length,
            query: searchTerm,
            filters: {
                vip_only: vip_only === 'true',
                free_only: free_only === 'true'
            }
        });
    } catch (error) {
        console.error('Erro na busca avançada:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    }
});

// API para atualizar HTML de uma película
app.put('/api/peliculas/:id/html', async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { html_content } = req.body;
        
        if (!html_content) {
            return res.status(400).json({
                success: false,
                message: 'Conteúdo HTML é obrigatório'
            });
        }
        
        const pelicula = await Pelicula.findByPk(id);
        
        if (!pelicula) {
            return res.status(404).json({
                success: false,
                message: 'Película não encontrada'
            });
        }
        
        await pelicula.update({ html_content });
        
        res.json({
            success: true,
            message: 'HTML atualizado com sucesso',
            data: pelicula
        });
        
    } catch (error) {
        console.error('Erro ao atualizar HTML:', error);
        res.status(500).json({
            success: false,
            message: 'Erro interno do servidor'
        });
    }
});

// Iniciar servidor
async function startServer() {
    try {
        // Inicializar banco de dados
        await initializeDatabase();
        
        // Iniciar servidor
        app.listen(PORT, () => {
            console.log(`🚀 Servidor rodando na porta ${PORT}`);
            console.log(`📱 Acesse: http://localhost:${PORT}`);
            console.log(`📊 Upload CSV: http://localhost:${PORT}/api/upload-csv`);
        });
    } catch (error) {
        console.error('❌ Erro ao iniciar servidor:', error);
        process.exit(1);
    }
}

startServer();
