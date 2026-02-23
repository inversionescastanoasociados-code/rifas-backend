const express = require('express');
const router = express.Router();
const rifaController = require('./rifas.controller');
const { authenticateToken, authorize } = require('../../middlewares/auth');
const { validate, validateParams } = require('../../middlewares/validate');
const { createLimiter } = require('../../middlewares/rateLimiter');
const Joi = require('joi');

const createRifaSchema = Joi.object({
  titulo: Joi.string().required().min(3).max(200),
  descripcion: Joi.string().required().min(10).max(1000),
  precio_boleta: Joi.number().required().positive(),
  total_boletas: Joi.number().required().integer().min(1000).max(10000),
  fecha_sorteo: Joi.date().required().iso().greater('now'),
  estado: Joi.string().valid('BORRADOR', 'ACTIVA', 'PAUSADA', 'TERMINADA').default('BORRADOR')
});

const updateRifaSchema = Joi.object({
  titulo: Joi.string().min(3).max(200),
  descripcion: Joi.string().min(10).max(1000),
  precio_boleta: Joi.number().positive(),
  fecha_sorteo: Joi.date().iso().greater('now'),
  estado: Joi.string().valid('BORRADOR', 'ACTIVA', 'PAUSADA', 'TERMINADA')
}).min(1);

const generateBoletasSchema = Joi.object({
  qr_base_url: Joi.string().uri().default('https://rifas.com/boletas'),
  imagen_url: Joi.string().uri().optional().allow(null),
  diseño_template: Joi.string().valid('default', 'classic', 'modern', 'minimal').default('default')
}).min(0);

const idSchema = Joi.object({
  id: Joi.string().uuid().required()
});

router.post('/', 
  authenticateToken, 
  authorize(['SUPER_ADMIN']), 
  createLimiter,
  validate(createRifaSchema), 
  rifaController.createRifa
);

router.get('/', 
  authenticateToken, 
  authorize(['SUPER_ADMIN']), 
  rifaController.getAllRifas
);

router.get('/:id', 
  authenticateToken, 
  authorize(['SUPER_ADMIN']), 
  validateParams(idSchema), 
  rifaController.getRifaById
);

router.put('/:id', 
  authenticateToken, 
  authorize(['SUPER_ADMIN']), 
  validateParams(idSchema),
  validate(updateRifaSchema), 
  rifaController.updateRifa
);

router.delete('/:id', 
  authenticateToken, 
  authorize(['SUPER_ADMIN']), 
  validateParams(idSchema), 
  rifaController.deleteRifa
);

router.get('/:id/stats', 
  authenticateToken, 
  authorize(['SUPER_ADMIN']), 
  validateParams(idSchema), 
  rifaController.getRifaStats
);

router.post('/:id/generate-boletas', 
  authenticateToken, 
  authorize(['SUPER_ADMIN']), 
  createLimiter,
  validateParams(idSchema),
  validate(generateBoletasSchema), 
  rifaController.generateBoletas
);

module.exports = router;
