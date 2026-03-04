const { Pool } = require('pg');
const config = require('../config/env');
const logger = require('../utils/logger');

const pool = new Pool({
  host: config.database.host,
  port: config.database.port,
  database: config.database.name,
  user: config.database.user,
  password: config.database.password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('connect', (client) => {
  // Configurar zona horaria Colombia para que CURRENT_TIMESTAMP, CURRENT_DATE
  // y filtros de fecha usen hora colombiana (UTC-5) en vez de UTC
  client.query("SET timezone = 'America/Bogota'");
  logger.info('Connected to PostgreSQL database (timezone: America/Bogota)');
});

pool.on('error', (err) => {
  logger.error('Unexpected error on idle client', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool
};
