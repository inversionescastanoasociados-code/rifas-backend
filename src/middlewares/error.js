const config = require('../config/env');
const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error(err.stack);

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      message: err.message,
      details: err.details
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or missing authentication token'
    });
  }

  if (err.code === '23505') {
    return res.status(409).json({
      error: 'Conflict',
      message: 'Resource already exists'
    });
  }

  res.status(err.status || 500).json({
    error: config.nodeEnv === 'production' ? 'Internal Server Error' : err.message,
    ...(config.nodeEnv !== 'production' && { stack: err.stack })
  });
};

const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  errorHandler,
  asyncHandler
};
