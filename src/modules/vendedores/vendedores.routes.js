const express = require('express');
const router = express.Router();
const controller = require('./vendedores.controller');
const { authenticateToken, authorize } = require('../../middlewares/auth');
const { validateQuery, validateParams } = require('../../middlewares/validate');
const Joi = require('joi');

const querySchema = Joi.object({
  fechaInicio: Joi.string().isoDate().optional(),
  fechaFin: Joi.string().isoDate().optional()
});

const idSchema = Joi.object({
  id: Joi.string().uuid().required()
});

// Solo SUPER_ADMIN
router.get(
  '/',
  authenticateToken,
  authorize(['SUPER_ADMIN']),
  validateQuery(querySchema),
  controller.list
);

router.get(
  '/:id',
  authenticateToken,
  authorize(['SUPER_ADMIN']),
  validateParams(idSchema),
  validateQuery(querySchema),
  controller.detalle
);

module.exports = router;
