require('dotenv').config();

const config = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    name: process.env.DB_NAME || 'rifas',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'stiven2808'
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'fallback-secret-key',
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  },
  
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS) || 12
  }
};

module.exports = config;
