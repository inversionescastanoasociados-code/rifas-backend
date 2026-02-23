const logger = require('../utils/logger');

/**
 * Middleware para loguear todas las peticiones HTTP entrantes
 * Muestra: método, URL, headers, body, query params, y response
 */
const requestLogger = (req, res, next) => {
  const start = Date.now();
  
  // Capturar el body original antes de que sea procesado
  const originalBody = { ...req.body };
  
  // Log de la petición entrante
  logger.info('🔥 INCOMING REQUEST', {
    method: req.method,
    url: req.originalUrl,
    headers: {
      'content-type': req.headers['content-type'],
      'authorization': req.headers.authorization ? 'Bearer [TOKEN]' : undefined,
      'user-agent': req.headers['user-agent'],
      'content-length': req.headers['content-length']
    },
    query: req.query,
    body: originalBody,
    ip: req.ip || req.connection.remoteAddress,
    timestamp: new Date().toISOString()
  });
  
  // Capturar la respuesta
  const originalSend = res.send;
  res.send = function(data) {
    res.send = originalSend;
    
    const duration = Date.now() - start;
    
    // Log de la respuesta
    logger.info('📤 OUTGOING RESPONSE', {
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      responseSize: data ? data.length : 0,
      timestamp: new Date().toISOString()
    });
    
    return res.send(data);
  };
  
  next();
};

module.exports = requestLogger;
