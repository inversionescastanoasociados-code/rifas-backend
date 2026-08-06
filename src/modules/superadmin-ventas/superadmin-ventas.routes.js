const express = require('express');
const router = express.Router();
const controller = require('./superadmin-ventas.controller');
const { authenticateToken, authorize } = require('../../middlewares/auth');
const { validate, validateParams, validateQuery } = require('../../middlewares/validate');
const Joi = require('joi');

// Todas las rutas de este módulo son EXCLUSIVAS para SUPER_ADMIN.
router.use(authenticateToken);
router.use(authorize(['SUPER_ADMIN']));

// ── Schemas ──
const uuidParam = (name) => Joi.object({ [name]: Joi.string().uuid().required() });

const buscarQuerySchema = Joi.object({
  q: Joi.string().trim().min(1).max(100).required(),
});

const editarAbonoSchema = Joi.object({
  monto: Joi.number().positive().optional(),
  medio_pago_id: Joi.string().uuid().optional(),
  referencia: Joi.string().trim().max(255).optional().allow('', null),
}).min(1);

const editarComprobanteVentaSchema = Joi.object({
  referencia_pago: Joi.string().trim().max(255).allow('', null).required(),
});

const anularSchema = Joi.object({
  motivo: Joi.string().max(500).optional().allow('', null),
});

const agregarAbonoSchema = Joi.object({
  monto: Joi.number().positive().required(),
  medio_pago_id: Joi.string().uuid().optional().allow(null),
  boleta_id: Joi.string().uuid().optional().allow(null),
  notas: Joi.string().max(500).optional().allow('', null),
});

const medioPagoSchema = Joi.object({
  medio_pago_id: Joi.string().uuid().required(),
});

const estadoSchema = Joi.object({
  estado: Joi.string().valid('PENDIENTE', 'ABONADA', 'PAGADA', 'CANCELADA').required(),
});

const agregarBoletaSchema = Joi.object({
  boleta_id: Joi.string().uuid().required(),
});

const reasignarClienteSchema = Joi.object({
  cliente_id: Joi.string().uuid().required(),
});

// ── Lectura ──
router.get('/buscar', validateQuery(buscarQuerySchema), controller.buscar);
router.get('/:ventaId', validateParams(uuidParam('ventaId')), controller.getDetalle);

// ── Abonos ──
router.patch(
  '/abonos/:abonoId',
  validateParams(uuidParam('abonoId')),
  validate(editarAbonoSchema),
  controller.editarAbono
);
router.post(
  '/abonos/:abonoId/anular',
  validateParams(uuidParam('abonoId')),
  validate(anularSchema),
  controller.anularAbono
);
router.post(
  '/:ventaId/abonos',
  validateParams(uuidParam('ventaId')),
  validate(agregarAbonoSchema),
  controller.agregarAbono
);

// ── Boletas ──
router.post(
  '/boletas/:boletaId/liberar',
  validateParams(uuidParam('boletaId')),
  validate(anularSchema),
  controller.liberarBoleta
);
router.post(
  '/:ventaId/boletas',
  validateParams(uuidParam('ventaId')),
  validate(agregarBoletaSchema),
  controller.agregarBoleta
);
router.delete(
  '/boletas/:boletaId',
  validateParams(uuidParam('boletaId')),
  controller.quitarBoleta
);

// ── Venta ──
router.patch(
  '/:ventaId/medio-pago',
  validateParams(uuidParam('ventaId')),
  validate(medioPagoSchema),
  controller.cambiarMedioPago
);
router.patch(
  '/:ventaId/estado',
  validateParams(uuidParam('ventaId')),
  validate(estadoSchema),
  controller.cambiarEstado
);
router.patch(
  '/:ventaId/cliente',
  validateParams(uuidParam('ventaId')),
  validate(reasignarClienteSchema),
  controller.reasignarCliente
);
router.patch(
  '/:ventaId/comprobante',
  validateParams(uuidParam('ventaId')),
  validate(editarComprobanteVentaSchema),
  controller.editarComprobanteVenta
);
router.delete('/:ventaId', validateParams(uuidParam('ventaId')), controller.eliminarVenta);

module.exports = router;
