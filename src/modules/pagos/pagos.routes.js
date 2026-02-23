const express = require('express');
const router = express.Router();
const pagoController = require('./pagos.controller');
const { authenticateToken, authorize } = require('../../middlewares/auth');
const { validate, validateParams, validateQuery } = require('../../middlewares/validate');
const Joi = require('joi');

const createPagoSchema = Joi.object({
  venta_id: Joi.number().integer().positive().required(),
  monto: Joi.number().positive().required(),
  metodo_pago: Joi.string().valid('efectivo', 'tarjeta', 'transferencia', 'movil', 'otro').required(),
  estado: Joi.string().valid('pendiente', 'completado', 'fallido').default('pendiente'),
  referencia: Joi.string().optional().max(100)
});

const updatePagoSchema = Joi.object({
  monto: Joi.number().positive(),
  metodo_pago: Joi.string().valid('efectivo', 'tarjeta', 'transferencia', 'movil', 'otro'),
  estado: Joi.string().valid('pendiente', 'completado', 'fallido'),
  referencia: Joi.string().max(100)
}).min(1);

const failPagoSchema = Joi.object({
  motivo: Joi.string().required().max(500)
});

const idSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const ventaIdSchema = Joi.object({
  venta_id: Joi.number().integer().positive().required()
});

const dateRangeQuerySchema = Joi.object({
  fecha_inicio: Joi.date().iso().required(),
  fecha_fin: Joi.date().iso().min(Joi.ref('fecha_inicio')).required()
});

router.post('/', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  validate(createPagoSchema), 
  pagoController.createPago
);

router.get('/', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin']), 
  pagoController.getAllPagos
);

router.get('/stats', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  pagoController.getPagosStats
);

router.get('/metodos', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  pagoController.getPagosByMetodo
);

router.get('/date-range', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin']), 
  validateQuery(dateRangeQuerySchema), 
  pagoController.getPagosByDateRange
);

router.get('/venta/:venta_id', 
  authenticateToken, 
  validateParams(ventaIdSchema), 
  pagoController.getPagosByVenta
);

router.get('/venta/:venta_id/stats', 
  authenticateToken, 
  validateParams(ventaIdSchema), 
  pagoController.getPagosStatsByVenta
);

router.get('/:id', 
  authenticateToken, 
  validateParams(idSchema), 
  pagoController.getPagoById
);

router.put('/:id', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  validateParams(idSchema),
  validate(updatePagoSchema), 
  pagoController.updatePago
);

router.post('/:id/process', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  validateParams(idSchema), 
  pagoController.processPago
);

router.post('/:id/fail', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  validateParams(idSchema),
  validate(failPagoSchema), 
  pagoController.failPago
);

router.delete('/:id', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin']), 
  validateParams(idSchema), 
  pagoController.deletePago
);

module.exports = router;
