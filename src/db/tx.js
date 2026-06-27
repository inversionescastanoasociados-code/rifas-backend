const { pool } = require('./pool');
const logger = require('../utils/logger');

class Transaction {
  constructor(client) {
    this.client = client;
  }

  async query(text, params) {
    return this.client.query(text, params);
  }

  async commit() {
    await this.client.query('COMMIT');
    this.client.release();
  }

  async rollback() {
    await this.client.query('ROLLBACK');
    this.client.release();
  }
}

const beginTransaction = async (historialOptions = null) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (historialOptions?.origen) {
      await client.query(
        `SELECT set_config('app.historial_origen', $1, true)`,
        [historialOptions.origen]
      );
    }
    if (historialOptions?.usuarioId) {
      await client.query(
        `SELECT set_config('app.historial_usuario_id', $1, true)`,
        [String(historialOptions.usuarioId)]
      );
    }
    return new Transaction(client);
  } catch (error) {
    client.release();
    logger.error('Error beginning transaction:', error);
    throw error;
  }
};

module.exports = {
  Transaction,
  beginTransaction
};
