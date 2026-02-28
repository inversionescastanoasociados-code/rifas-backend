const express = require('express');
const router = express.Router();
const ventaController = require('./ventas.controller');
const { authenticateToken, authorize } = require('../../middlewares/auth');
const { validate, validateParams, validateQuery } = require('../../middlewares/validate');
const Joi = require('joi');

const createVentaSchema = Joi.object({
  rifa_id: Joi.string().uuid().required(),
  cliente: Joi.object({
    nombre: Joi.string().required().max(200),
    telefono: Joi.string().required().max(20),
    email: Joi.string().email().optional().allow('', null).max(100),
    direccion: Joi.string().optional().allow('', null).max(300),
    identificacion: Joi.string().optional().allow('', null).max(20)
  }).required(),
  boletas: Joi.array().items(
    Joi.object({
      id: Joi.string().uuid().required(),
      reserva_token: Joi.string().required()
    })
  ).min(1).required(),
  medio_pago_id: Joi.string().uuid().required(),
  total_venta: Joi.number().positive().required(),
  total_pagado: Joi.number().positive().required(),
  notas: Joi.string().optional().max(500),
  abonos_por_boleta: Joi.array().items(
    Joi.object({
      boleta_id: Joi.string().uuid().required(),
      monto: Joi.number().min(0).required()
    })
  ).optional()
});

const crearReservaSchema = Joi.object({
  rifa_id: Joi.string().uuid().required(),
  cliente: Joi.object({
    nombre: Joi.string().required().max(200),
    telefono: Joi.string().required().max(20),
    email: Joi.string().email().optional().allow('', null).max(100),
    direccion: Joi.string().optional().allow('', null).max(300),
    identificacion: Joi.string().optional().allow('', null).max(20)
  }).required(),
  boletas: Joi.array()
    .items(Joi.string().uuid())
    .min(1)
    .required(),
  dias_bloqueo: Joi.number().integer().positive().default(3).max(365),
  notas: Joi.string().optional().allow('', null).max(500)
});

const convertirReservaSchema = Joi.object({
  monto_total: Joi.number().positive().required(),
  total_pagado: Joi.number().positive().required(),
  medio_pago_id: Joi.string().uuid().required()
});

const cancelarReservaSchema = Joi.object({
  motivo: Joi.string().optional().max(500)
});

const updateVentaSchema = Joi.object({
  cliente_nombre: Joi.string().max(200),
  cliente_telefono: Joi.string().max(20),
  total_boletas: Joi.number().integer().positive(),
  monto_total: Joi.number().positive(),
  estado: Joi.string().valid('pendiente', 'completada', 'cancelada')
}).min(1);

const cancelVentaSchema = Joi.object({
  motivo: Joi.string().required().max(500)
});

const idSchema = Joi.object({
  id: Joi.number().integer().positive().required()
});

const uuidIdSchema = Joi.object({
  id: Joi.string().uuid().required()
});

const rifaIdSchema = Joi.object({
  rifa_id: Joi.number().integer().positive().required()
});

const dateRangeQuerySchema = Joi.object({
  fecha_inicio: Joi.date().iso().required(),
  fecha_fin: Joi.date().iso().min(Joi.ref('fecha_inicio')).required()
});

router.post('/', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  validate(createVentaSchema), 
  ventaController.createVenta
);

// 🔹 CREAR RESERVA FORMAL (Bloqueo largo, vinculado a cliente)
// IMPORTANTE: Esta ruta debe estar ANTES de la ruta genérica POST /:id
router.post(
  '/reservar',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']),
  validate(crearReservaSchema),
  ventaController.crearReserva
);

// 🔹 CONVERTIR RESERVA EN VENTA
// IMPORTANTE: Antes de rutas genéricas con /:id
router.post(
  '/:id/convertir-reserva',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']),
  validateParams(uuidIdSchema),
  validate(convertirReservaSchema),
  ventaController.convertirReserva
);

// 🔹 CANCELAR RESERVA
router.post(
  '/:id/cancelar-reserva',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']),
  validateParams(uuidIdSchema),
  validate(cancelarReservaSchema),
  ventaController.cancelarReserva
);




// 🔹 BUSCAR BOLETA PARA ABONAR (por número)
router.get(
  '/buscar-boleta-abono',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']),
  ventaController.buscarBoletaParaAbono
);

router.get('/', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin']), 
  ventaController.getAllVentas
);

router.get('/my', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  ventaController.getMyVentas
);

router.get('/my/stats', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  ventaController.getMyStats
);

router.get('/date-range', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin']), 
  validateQuery(dateRangeQuerySchema), 
  ventaController.getVentasByDateRange
);

router.get('/rifa/:rifa_id', 
  authenticateToken, 
  validateParams(rifaIdSchema), 
  ventaController.getVentasByRifa
);

router.get('/rifa/:rifa_id/stats', 
  authenticateToken, 
  validateParams(rifaIdSchema), 
  ventaController.getVentasStats
);

router.get('/:id', 
  authenticateToken, 
  validateParams(idSchema), 
  ventaController.getVentaById
);

router.put('/:id', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  validateParams(idSchema),
  validate(updateVentaSchema), 
  ventaController.updateVenta
);

router.post('/:id/complete', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  validateParams(idSchema), 
  ventaController.completeVenta
);

router.post('/:id/cancel', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  validateParams(idSchema),
  validate(cancelVentaSchema), 
  ventaController.cancelVenta
);


// Schema de validación para registrar abono
const registrarAbonoSchema = Joi.object({
  monto: Joi.number().positive().required(),
  metodo_pago: Joi.string().optional(),
  notas: Joi.string().optional().max(500),
  boleta_id: Joi.string().uuid().optional(),
  boletas_abono: Joi.array().items(
    Joi.object({
      boleta_id: Joi.string().uuid().required(),
      monto: Joi.number().positive().required()
    })
  ).optional()
});

// IMPORTANTE: Esta ruta debe estar ANTES de la ruta genérica `/:id` (importante el orden)
router.post(
  '/:id/abonos',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']),
  validateParams(uuidIdSchema),  // ✅ Usar uuidIdSchema en lugar de idSchema
  validate(registrarAbonoSchema),
  ventaController.registrarAbono
);

router.delete('/:id', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin']), 
  validateParams(idSchema), 
  ventaController.deleteVenta
);


router.get(
  '/cliente/:clienteId',
  authenticateToken,
  ventaController.getVentasPorCliente
);

router.get(
  '/:id/detalle-financiero',
  authenticateToken,
  ventaController.getVentaDetalleFinanciero
);





module.exports = router;
