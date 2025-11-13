require('dotenv').config({ path: __dirname + '/../.env' });
const mysql = require('mysql2');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'micro_midia',
    waitForConnections: true,
    connectionLimit: 1, // Limite reduzido para serverless
    maxIdle: 1,
    idleTimeout: 60000,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
};

console.log('Configuração MySQL Serverless:', { 
    host: dbConfig.host, 
    user: dbConfig.user, 
    database: dbConfig.database,
    password: dbConfig.password ? '***' : '(vazia)',
    connectionLimit: dbConfig.connectionLimit
});

// Função para criar conexão sob demanda
async function getConnection() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('Nova conexão MySQL criada');
        return connection;
    } catch (error) {
        console.error('Erro ao criar conexão MySQL:', error.message);
        throw error;
    }
}

// Wrapper para executar queries com conexão gerenciada
async function execute(sql, params = []) {
    let connection;
    try {
        connection = await getConnection();
        const result = await connection.execute(sql, params);
        return result;
    } catch (error) {
        console.error('Erro ao executar query:', error.message);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
            console.log('Conexão MySQL fechada');
        }
    }
}

// Wrapper para queries simples
async function query(sql, params = []) {
    let connection;
    try {
        connection = await getConnection();
        const result = await connection.query(sql, params);
        return result;
    } catch (error) {
        console.error('Erro ao executar query:', error.message);
        throw error;
    } finally {
        if (connection) {
            await connection.end();
            console.log('Conexão MySQL fechada');
        }
    }
}

module.exports = {
    execute,
    query,
    getConnection
};
