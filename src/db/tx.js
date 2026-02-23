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

const beginTransaction = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
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
