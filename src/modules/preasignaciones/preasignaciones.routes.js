const express = require('express');
const router = express.Router();
const controller = require('./preasignaciones.controller');
const { authenticateToken, authorize } = require('../../middlewares/auth');
const { validate, validateParams, validateQuery } = require('../../middlewares/validate');
const Joi = require('joi');

const ROLES_GESTION = ['SUPER_ADMIN', 'ADMIN', 'VENDEDOR'];

router.use(authenticateToken);

const idParamSchema = Joi.object({ id: Joi.string().uuid().required() });

const listarQuerySchema = Joi.object({
  q: Joi.string().trim().max(100).optional().allow(''),
});

const crearSchema = Joi.object({
  cliente_id: Joi.string().uuid().required(),
  numero_boleta: Joi.number().integer().min(0).max(9999).required(),
  notas: Joi.string().max(500).optional().allow('', null),
});

const actualizarSchema = Joi.object({
  cliente_id: Joi.string().uuid().optional(),
  numero_boleta: Joi.number().integer().min(0).max(9999).optional(),
  notas: Joi.string().max(500).optional().allow('', null),
}).min(1);

const aplicarSchema = Joi.object({
  rifa_id: Joi.string().uuid().required(),
});

// ── CRUD: SUPER_ADMIN, ADMIN y VENDEDOR ──
router.get('/', authorize(ROLES_GESTION), validateQuery(listarQuerySchema), controller.listar);
router.post('/', authorize(ROLES_GESTION), validate(crearSchema), controller.crear);
router.put(
  '/:id',
  authorize(ROLES_GESTION),
  validateParams(idParamSchema),
  validate(actualizarSchema),
  controller.actualizar
);
router.delete('/:id', authorize(ROLES_GESTION), validateParams(idParamSchema), controller.eliminar);

// ── Aplicar a una rifa: EXCLUSIVO SUPER_ADMIN ──
router.post(
  '/aplicar',
  authorize(['SUPER_ADMIN']),
  validate(aplicarSchema),
  controller.aplicarARifa
);

module.exports = router;
