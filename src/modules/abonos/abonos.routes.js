const express = require('express');
const router = express.Router();
const abonoController = require('./abonos.controller');
const { authenticateToken, authorize } = require('../../middlewares/auth');
const { validate, validateParams, validateQuery } = require('../../middlewares/validate');
const Joi = require('joi');

const createAbonoSchema = Joi.object({
  venta_id: Joi.number().integer().positive().required(),
  monto: Joi.number().positive().required(),
  metodo_abono: Joi.string().valid('efectivo', 'tarjeta', 'transferencia', 'movil', 'otro').required(),
  estado: Joi.string().valid('pendiente', 'recibido', 'cancelado').default('pendiente'),
  referencia: Joi.string().optional().max(100)
});

const updateAbonoSchema = Joi.object({
  monto: Joi.number().positive(),
  metodo_abono: Joi.string().valid('efectivo', 'tarjeta', 'transferencia', 'movil', 'otro'),
  estado: Joi.string().valid('pendiente', 'recibido', 'cancelado'),
  referencia: Joi.string().max(100)
}).min(1);

const cancelAbonoSchema = Joi.object({
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
  validate(createAbonoSchema), 
  abonoController.createAbono
);

router.get('/', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin']), 
  abonoController.getAllAbonos
);

router.get('/stats', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  abonoController.getAbonosStats
);

router.get('/metodos', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  abonoController.getAbonosByMetodo
);

router.get('/date-range', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin']), 
  validateQuery(dateRangeQuerySchema), 
  abonoController.getAbonosByDateRange
);

router.get('/venta/:venta_id', 
  authenticateToken, 
  validateParams(ventaIdSchema), 
  abonoController.getAbonosByVenta
);

router.get('/venta/:venta_id/stats', 
  authenticateToken, 
  validateParams(ventaIdSchema), 
  abonoController.getAbonosStatsByVenta
);

router.get('/venta/:venta_id/pendientes', 
  authenticateToken, 
  validateParams(ventaIdSchema), 
  abonoController.getAbonosPendientesByVenta
);

router.get('/:id', 
  authenticateToken, 
  validateParams(idSchema), 
  abonoController.getAbonoById
);

router.put('/:id', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  validateParams(idSchema),
  validate(updateAbonoSchema), 
  abonoController.updateAbono
);

router.post('/:id/receive', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  validateParams(idSchema), 
  abonoController.receiveAbono
);

router.post('/:id/cancel', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  validateParams(idSchema),
  validate(cancelAbonoSchema), 
  abonoController.cancelAbono
);

router.delete('/:id', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin']), 
  validateParams(idSchema), 
  abonoController.deleteAbono
);


// routes/abonos.routes.js
router.post(
  '/ventas/:venta_id/abonos',
  authenticateToken,
  abonoController.createAbono
);

module.exports = router;
