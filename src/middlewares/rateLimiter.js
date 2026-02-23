const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

// Rate limiting general para toda la API
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // límite de 1000 peticiones por ventana
  message: {
    success: false,
    message: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true, // Envía headers estándar
  legacyHeaders: false, // Deshabilita headers legacy
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
    res.status(429).json({
      success: false,
      message: 'Too many requests from this IP, please try again later.',
      retryAfter: '15 minutes'
    });
  },
  keyGenerator: (req) => {
  return `ip:${ipKeyGenerator(req)}`;
}
});

// Rate limiting estricto para endpoints críticos
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // límite más estricto
  message: {
    success: false,
    message: 'Too many requests to this endpoint, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Strict rate limit exceeded for IP: ${req.ip}, Path: ${req.path}`);
    res.status(429).json({
      success: false,
      message: 'Too many requests to this endpoint, please try again later.',
      retryAfter: '15 minutes'
    });
  },
  keyGenerator: (req) => {
  return `ip:${ipKeyGenerator(req)}`;
}
});

// Rate limiting para login (muy estricto)
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20, // aumentado a 20 intentos de login por ventana para pruebas
  message: {
    success: false,
    message: 'Too many login attempts, please try again later.',
    retryAfter: '15 minutes'
  },
  skipSuccessfulRequests: true, // No cuenta peticiones exitosas
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Login rate limit exceeded for IP: ${req.ip}, Email: ${req.body.email}`);
    res.status(429).json({
      success: false,
      message: 'Too many login attempts, please try again later.',
      retryAfter: '15 minutes'
    });
  },
  keyGenerator: (req) => {
  if (req.user && req.user.id) {
    return `user:${req.user.id}`;
  }
  return `ip:${ipKeyGenerator(req)}`;
},

});

// Rate limiting para creación de recursos
const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 50, // 50 creaciones por hora
  message: {
    success: false,
    message: 'Too many creation attempts, please try again later.',
    retryAfter: '1 hour'
  },
  keyGenerator: (req) => {
    if (req.user && req.user.id) {
      return `user:${req.user.id}`;
    }
    return `ip:${ipKeyGenerator(req)}`;

    // Para usuarios autenticados, usar su ID
    // Para IPs, usar el helper function para manejar IPv6 correctamente
  },
    
  
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    logger.warn(`Create rate limit exceeded for IP: ${req.ip}, User: ${req.user?.id || 'anonymous'}, Path: ${req.path}`);
    res.status(429).json({
      success: false,
      message: 'Too many creation attempts, please try again later.',
      retryAfter: '1 hour'
    });
  }
});

module.exports = {
  generalLimiter,
  strictLimiter,
  loginLimiter,
  createLimiter
};
