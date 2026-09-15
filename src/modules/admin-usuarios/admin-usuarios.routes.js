const express = require('express');
const router = express.Router();
const controller = require('./admin-usuarios.controller');
const { authenticateToken, authorize } = require('../../middlewares/auth');
const { validate, validateParams } = require('../../middlewares/validate');
const Joi = require('joi');

router.use(authenticateToken, authorize(['SUPER_ADMIN']));

const idParamSchema = Joi.object({
  id: Joi.string().uuid().required(),
});

const crearSchema = Joi.object({
  email: Joi.string().email().max(255).required(),
  password: Joi.string().min(6).max(128).required(),
  nombre: Joi.string().min(2).max(255).required(),
});

const actualizarSchema = Joi.object({
  email: Joi.string().email().max(255).optional(),
  password: Joi.string().min(6).max(128).optional().allow(''),
  nombre: Joi.string().min(2).max(255).optional(),
  activo: Joi.boolean().optional(),
}).min(1);

router.get('/', controller.listar);
router.post('/', validate(crearSchema), controller.crear);
router.put(
  '/:id',
  validateParams(idParamSchema),
  validate(actualizarSchema),
  controller.actualizar
);

module.exports = router;
