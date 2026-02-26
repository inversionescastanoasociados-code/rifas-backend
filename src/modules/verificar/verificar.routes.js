const express = require('express');
const router = express.Router();
const verificarController = require('./verificar.controller');
const { rateLimit } = require('express-rate-limit');

/**
 * Rate limiting estricto para endpoint público de verificación.
 * 30 requests por IP cada 5 minutos — evita scraping de hashes.
 */
const verificarLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  message: {
    success: false,
    message: 'Demasiadas solicitudes de verificación. Intente de nuevo en unos minutos.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * 🔓 GET /api/verificar/:hash
 * Endpoint PÚBLICO — No requiere autenticación ni API key.
 * Protegido por rate limiting y hash HMAC.
 */
router.get('/:hash', verificarLimiter, verificarController.verificarBoleta);

module.exports = router;
