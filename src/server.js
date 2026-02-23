const app = require('./app');
const config = require('./config/env');
const logger = require('./utils/logger');
const { pool } = require('./db/pool');


app.set("trust proxy", 1);


const startServer = async () => {
  try {
    await pool.query('SELECT NOW()');
    logger.info('Database connection established successfully');

    const server = app.listen(config.port, () => {
      logger.info(`Server running on port ${config.port} in ${config.nodeEnv} mode`);
      logger.info(`Health check available at http://localhost:${config.port}/health`);
      logger.info(`API documentation at http://localhost:${config.port}/api`);
    });

    const gracefulShutdown = (signal) => {
      logger.info(`Received ${signal}. Starting graceful shutdown...`);
      
      server.close(async () => {
        logger.info('HTTP server closed');
        
        try {
          await pool.end();
          logger.info('Database pool closed');
          process.exit(0);
        } catch (error) {
          logger.error('Error during database pool closure:', error);
          process.exit(1);
        }
      });

      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    });

    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception:', error);
      process.exit(1);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
