// db.js
// Configura el pool de conexiones a PostgreSQL.
//
// Soporta dos formas de configuracion (ver .env.example):
//   1) DATABASE_URL  -> cadena de conexion completa (recomendado en Render/Railway/Heroku)
//   2) DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME -> variables sueltas (uso local)

require('dotenv').config();
const { Pool } = require('pg');

const sslEnabled = process.env.DB_SSL === 'true';
const sslConfig = sslEnabled ? { rejectUnauthorized: false } : false;

let pool;

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: sslConfig,
  });
} else {
  pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'catalogos_mx',
    ssl: sslConfig,
  });
}

pool.on('error', (err) => {
  // Errores en clientes inactivos del pool (no deben tumbar el proceso)
  console.error('Error inesperado en el pool de PostgreSQL:', err.message);
});

module.exports = pool;
