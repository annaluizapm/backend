require('dotenv').config({ path: __dirname + '/../.env' });
const mysql = require('mysql2');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'micro_midia',
    connectionLimit: parseInt(process.env.DB_CONNECTION_LIMIT) || 10
};

console.log('Tentando conectar ao MySQL com:', { 
    host: dbConfig.host, 
    user: dbConfig.user, 
    database: dbConfig.database,
    password: dbConfig.password ? '***' : '(vazia)'
});

const pool = mysql.createPool(dbConfig);
const db = pool.promise();

// Testar conexão ao iniciar
pool.getConnection((err, connection) => {
    if (err) {
        console.error('Erro ao conectar ao MySQL:', err.message);
    } else {
        console.log('Conectado ao MySQL com sucesso!');
        connection.release();
    }
});

module.exports = db;
