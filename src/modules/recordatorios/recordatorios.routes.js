const express = require('express');
const router = express.Router();
const recordatorioController = require('./recordatorios.controller');
const { authenticateToken, authorize } = require('../../middlewares/auth');
const { validate, validateParams } = require('../../middlewares/validate');
const Joi = require('joi');

const querySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  search: Joi.string().optional().max(100).trim(),
  filtro: Joi.string().valid('todos', 'reservadas', 'abonadas').default('todos'),
  notificado: Joi.string().valid('todos', 'si', 'no').default('todos')
});

const clienteIdSchema = Joi.object({
  clienteId: Joi.string().uuid().required()
});

// GET /api/recordatorios - Listar clientes con boletas pendientes para recordatorio
router.get('/',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'ADMIN', 'VENDEDOR']),
  validate(querySchema, 'query'),
  recordatorioController.getClientesParaRecordatorio
);

// GET /api/recordatorios/resumen - Obtener conteos para filtros
router.get('/resumen',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'ADMIN', 'VENDEDOR']),
  recordatorioController.getResumenRecordatorios
);

// POST /api/recordatorios/:clienteId/notificar - Registrar que se notificó al cliente
router.post('/:clienteId/notificar',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'ADMIN', 'VENDEDOR']),
  validateParams(clienteIdSchema),
  recordatorioController.registrarNotificacion
);

// GET /api/recordatorios/:clienteId/notificaciones - Historial de notificaciones del cliente
router.get('/:clienteId/notificaciones',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'ADMIN', 'VENDEDOR']),
  validateParams(clienteIdSchema),
  recordatorioController.getNotificacionesCliente
);

module.exports = router;
