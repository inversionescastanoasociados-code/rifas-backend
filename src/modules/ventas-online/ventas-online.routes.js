/**
 * ═══════════════════════════════════════════════════════════════
 *  VENTAS ONLINE — ROUTES
 *  
 *  Seguridad por capas:
 *  1. Rate Limiting agresivo (público = más restricciones)
 *  2. API Key (x-api-key header)
 *  3. Validación Joi estricta (tipos, formatos, rangos)
 *  4. Sanitización de strings (trim, max length)
 *  5. UUID validation en parámetros
 *  6. Token validation (hex, 64 chars)
 * ═══════════════════════════════════════════════════════════════
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const apiKeyAuth = require('../../middlewares/apiKeyAuth');
const { validate, validateParams } = require('../../middlewares/validate');
const controller = require('./ventas-online.controller');
const logger = require('../../utils/logger');

// ═══════════════════════════════════════
//  RATE LIMITERS (más estrictos que el general)
// ═══════════════════════════════════════

/**
 * Rate limiter para lectura (listar rifas/boletas).
 * 60 requests por minuto por IP — generoso para UX.
 */
const readLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `vo-read:${ipKeyGenerator(req)}`,
  handler: (req, res) => {
    logger.warn(`[VentasOnline] Read rate limit: IP=${req.ip} Path=${req.path}`);
    res.status(429).json({
      success: false,
      message: 'Demasiadas solicitudes. Intente en unos segundos.'
    });
  }
});

/**
 * Rate limiter para bloqueo de boletas.
 * 10 intentos por 5 minutos por IP — previene acaparamiento.
 */
const blockLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `vo-block:${ipKeyGenerator(req)}`,
  handler: (req, res) => {
    logger.warn(`[VentasOnline] Block rate limit: IP=${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Ha bloqueado demasiadas boletas. Intente en 5 minutos.'
    });
  }
});

/**
 * Rate limiter para crear reservas.
 * 5 reservas por hora por IP — previene spam de reservas.
 */
const reservaLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `vo-reserva:${ipKeyGenerator(req)}`,
  handler: (req, res) => {
    logger.warn(`[VentasOnline] Reserva rate limit: IP=${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Ha creado demasiadas reservas. Intente más tarde.'
    });
  }
});

/**
 * Rate limiter para consulta de estado.
 * 30 por 5 min — puede que el usuario refresque varias veces.
 */
const statusLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `vo-status:${ipKeyGenerator(req)}`,
  handler: (req, res) => {
    logger.warn(`[VentasOnline] Status rate limit: IP=${req.ip}`);
    res.status(429).json({
      success: false,
      message: 'Demasiadas consultas. Intente en unos minutos.'
    });
  }
});

// ═══════════════════════════════════════
//  SCHEMAS DE VALIDACIÓN JOI
// ═══════════════════════════════════════

const rifaIdSchema = Joi.object({
  rifaId: Joi.string().uuid().required().messages({
    'string.guid': 'ID de rifa inválido',
    'any.required': 'ID de rifa es requerido'
  })
});

const bloquearBoletasSchema = Joi.object({
  rifa_id: Joi.string().uuid().required().messages({
    'string.guid': 'ID de rifa inválido',
    'any.required': 'rifa_id es requerido'
  }),
  boleta_ids: Joi.array()
    .items(Joi.string().uuid())
    .min(1)
    .max(20)
    .required()
    .messages({
      'array.min': 'Debe seleccionar al menos una boleta',
      'array.max': 'Máximo 20 boletas por bloqueo',
      'any.required': 'boleta_ids es requerido'
    }),
  tiempo_bloqueo_minutos: Joi.number()
    .integer()
    .min(1)
    .max(30)
    .default(15)
});

const liberarBoletasSchema = Joi.object({
  reserva_token: Joi.string()
    .hex()
    .length(64)
    .required()
    .messages({
      'string.hex': 'Token de reserva inválido',
      'string.length': 'Token de reserva inválido',
      'any.required': 'reserva_token es requerido'
    })
});

const crearReservaSchema = Joi.object({
  reserva_token: Joi.string()
    .hex()
    .length(64)
    .required()
    .messages({
      'string.hex': 'Token de reserva inválido',
      'string.length': 'Token de reserva inválido',
      'any.required': 'reserva_token es requerido'
    }),
  cliente: Joi.object({
    nombre: Joi.string()
      .trim()
      .min(2)
      .max(255)
      .required()
      .messages({
        'string.min': 'Nombre debe tener al menos 2 caracteres',
        'string.max': 'Nombre no puede exceder 255 caracteres',
        'any.required': 'Nombre es requerido'
      }),
    telefono: Joi.string()
      .trim()
      .pattern(/^[0-9+\-\s()]{7,20}$/)
      .required()
      .messages({
        'string.pattern.base': 'Formato de teléfono inválido',
        'any.required': 'Teléfono es requerido'
      }),
    email: Joi.string()
      .trim()
      .email({ tlds: { allow: false } })
      .max(255)
      .optional()
      .allow(null, ''),
    identificacion: Joi.string()
      .trim()
      .min(4)
      .max(50)
      .optional()
      .allow(null, ''),
    direccion: Joi.string()
      .trim()
      .max(500)
      .optional()
      .allow(null, '')
  }).required().messages({
    'any.required': 'Datos del cliente son requeridos'
  }),
  medio_pago_id: Joi.string()
    .uuid()
    .optional()
    .allow(null),
  notas: Joi.string()
    .trim()
    .max(1000)
    .optional()
    .allow(null, '')
});

const tokenParamSchema = Joi.object({
  token: Joi.string()
    .hex()
    .length(64)
    .required()
    .messages({
      'string.hex': 'Token inválido',
      'string.length': 'Token inválido',
      'any.required': 'Token es requerido'
    })
});

// ═══════════════════════════════════════
//  MIDDLEWARE: API Key en TODAS las rutas
// ═══════════════════════════════════════
router.use(apiKeyAuth);

// ═══════════════════════════════════════
//  RUTAS
// ═══════════════════════════════════════

/**
 * 🟢 GET /api/ventas-online/rifas
 * Listar rifas activas
 */
router.get('/rifas',
  readLimiter,
  controller.getRifasActivas
);

/**
 * 🟢 GET /api/ventas-online/rifas/:rifaId/boletas
 * Listar boletas disponibles de una rifa
 */
router.get('/rifas/:rifaId/boletas',
  readLimiter,
  validateParams(rifaIdSchema),
  controller.getBoletasDisponibles
);

/**
 * 🔒 POST /api/ventas-online/boletas/bloquear
 * Bloquear boletas temporalmente (15 min default, max 30 min)
 * Body: { rifa_id, boleta_ids: [...], tiempo_bloqueo_minutos? }
 */
router.post('/boletas/bloquear',
  blockLimiter,
  validate(bloquearBoletasSchema),
  controller.bloquearBoletas
);

/**
 * 🔓 POST /api/ventas-online/boletas/liberar
 * Liberar boletas bloqueadas (usuario cancela)
 * Body: { reserva_token }
 */
router.post('/boletas/liberar',
  readLimiter,
  validate(liberarBoletasSchema),
  controller.liberarBoletas
);

/**
 * 💾 POST /api/ventas-online/reservas
 * Crear reserva formal con datos del cliente
 * Body: { reserva_token, cliente: {...}, medio_pago_id?, notas? }
 */
router.post('/reservas',
  reservaLimiter,
  validate(crearReservaSchema),
  controller.crearReserva
);

/**
 * 📊 GET /api/ventas-online/reservas/:token/estado
 * Consultar estado de una reserva (público)
 */
router.get('/reservas/:token/estado',
  statusLimiter,
  validateParams(tokenParamSchema),
  controller.getEstadoReserva
);

/**
 * 💳 GET /api/ventas-online/medios-pago
 * Listar medios de pago activos
 */
router.get('/medios-pago',
  readLimiter,
  controller.getMediosPago
);

module.exports = router;
