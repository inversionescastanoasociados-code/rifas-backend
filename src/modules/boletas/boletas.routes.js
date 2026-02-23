const express = require('express');
const router = express.Router();
const boletaController = require('./boletas.controller');
const { authenticateToken, authorize } = require('../../middlewares/auth');
const { validate, validateParams } = require('../../middlewares/validate');
const Joi = require('joi');

const createBoletaSchema = Joi.object({
  rifa_id: Joi.number().integer().positive().required(),
  numero: Joi.number().integer().positive().required(),
  nombre_comprador: Joi.string().optional().max(200),
  telefono: Joi.string().optional().max(20),
  estado: Joi.string().valid('disponible', 'reservada', 'vendida').default('disponible')
});

const batchCreateBoletasSchema = Joi.object({
  rifa_id: Joi.string().uuid().required(),
  total_boletas: Joi.number().integer().positive().required().max(10000)
});

const updateBoletaSchema = Joi.object({
  nombre_comprador: Joi.string().max(200),
  telefono: Joi.string().max(20),
  estado: Joi.string().valid('disponible', 'reservada', 'vendida')
}).min(1);

const sellBoletaSchema = Joi.object({
  nombre_comprador: Joi.string().required().max(200),
  telefono: Joi.string().required().max(20)
});

const bloquearBoletaSchema = Joi.object({
  tiempo_bloqueo: Joi.number().integer().positive().default(15).max(60)
});

const desbloquearBoletaSchema = Joi.object({
  reserva_token: Joi.string().required()
});

const updateBoletaImageSchema = Joi.object({
  imagen_url: Joi.string().uri().optional().allow(null)
});

const idSchema = Joi.object({
  id: Joi.string().uuid().required()
});

const rifaIdSchema = Joi.object({
  rifa_id: Joi.string().uuid().required()
});

router.post('/', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  validate(createBoletaSchema), 
  boletaController.createBoleta
);

router.post('/batch', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  validate(batchCreateBoletasSchema), 
  boletaController.batchCreateBoletas
);

router.get('/rifa/:rifa_id', 
  authenticateToken, 
  validateParams(rifaIdSchema), 
  boletaController.getBoletasByRifa
);

router.get('/rifa/:rifa_id/available', 
  authenticateToken, 
  validateParams(rifaIdSchema), 
  boletaController.getAvailableBoletas
);

router.get('/rifa/:rifa_id/stats', 
  authenticateToken, 
  validateParams(rifaIdSchema), 
  boletaController.getBoletasStats
);

router.get('/:id', 
  authenticateToken, 
  validateParams(idSchema), 
  boletaController.getBoletaById
);

router.put('/:id', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  validateParams(idSchema),
  validate(updateBoletaSchema), 
  boletaController.updateBoleta
);

router.post('/:id/sell', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  validateParams(idSchema),
  validate(sellBoletaSchema), 
  boletaController.sellBoleta
);

router.post('/:id/block', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  validateParams(idSchema),
  validate(bloquearBoletaSchema), 
  boletaController.bloquearBoleta
);

router.post('/:id/unblock', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  validateParams(idSchema),
  validate(desbloquearBoletaSchema), 
  boletaController.desbloquearBoleta
);

router.get('/:id/check-block', 
  authenticateToken, 
  validateParams(idSchema), 
  boletaController.verificarBloqueo
);

router.put('/:id/image', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin', 'vendedor']), 
  validateParams(idSchema),
  validate(updateBoletaImageSchema), 
  boletaController.updateBoletaImage
);

router.delete('/:id', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'admin']), 
  validateParams(idSchema), 
  boletaController.deleteBoleta
);

router.get('/rifa/:rifa_id/full-status', 
  authenticateToken, 
  validateParams(rifaIdSchema), 
  boletaController.getBoletasFullStatus
);

module.exports = router;
