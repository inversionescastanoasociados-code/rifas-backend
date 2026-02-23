const express = require('express');
const router = express.Router();
const clienteController = require('./clientes.controller');
const { authenticateToken, authorize } = require('../../middlewares/auth');
const { validate, validateParams } = require('../../middlewares/validate');
const Joi = require('joi');

const createClienteSchema = Joi.object({
  nombre: Joi.string().required().min(2).max(255).trim(),
  telefono: Joi.string().required().min(7).max(20).trim(),
  email: Joi.string().email().required().max(255).trim(),
  identificacion: Joi.string().required().min(5).max(50).trim(),
  direccion: Joi.string().optional().max(500).trim()
});

const updateClienteSchema = Joi.object({
  nombre: Joi.string().min(2).max(255).trim(),
  telefono: Joi.string().min(7).max(20).trim(),
  email: Joi.string().email().max(255).trim(),
  identificacion: Joi.string().min(5).max(50).trim(),
  direccion: Joi.string().max(500).trim()
}).min(1);

const idSchema = Joi.object({
  id: Joi.string().uuid().required()
});

const identificacionSchema = Joi.object({
  identificacion: Joi.string().required().min(5).max(50).trim()
});

const cedulaSchema = Joi.object({
  cedula: Joi.string().required().min(5).max(50).trim()
});

const querySchema = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(10),
  search: Joi.string().optional().max(100).trim()
});

// POST /api/clientes - Crear cliente
router.post('/', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'ADMIN', 'VENDEDOR']), 
  validate(createClienteSchema), 
  clienteController.createCliente
);

// GET /api/clientes - Listar clientes con paginación y búsqueda
router.get('/', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'ADMIN', 'VENDEDOR']), 
  validate(querySchema, 'query'), 
  clienteController.getAllClientes
);

// GET /api/clientes/identificacion/:identificacion - Buscar cliente por cédula/identificación
router.get('/identificacion/:identificacion', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'ADMIN', 'VENDEDOR']), 
  validateParams(identificacionSchema), 
  clienteController.getClienteByIdentificacion
);

// GET /api/clientes/cedula/:cedula - Buscar cliente por cédula (endpoint adicional)
router.get('/cedula/:cedula', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'ADMIN', 'VENDEDOR']), 
  validateParams(cedulaSchema), 
  clienteController.getClienteByCedula
);

// GET /api/clientes/:id - Obtener cliente por ID
router.get('/:id', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'ADMIN', 'VENDEDOR']), 
  validateParams(idSchema), 
  clienteController.getClienteById
);

// PUT /api/clientes/:id - Actualizar cliente
router.put('/:id', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'ADMIN', 'VENDEDOR']), 
  validateParams(idSchema),
  validate(updateClienteSchema), 
  clienteController.updateCliente
);

// DELETE /api/clientes/:id - Eliminar cliente (solo admin)
router.delete('/:id', 
  authenticateToken, 
  authorize(['SUPER_ADMIN', 'ADMIN']), 
  validateParams(idSchema), 
  clienteController.deleteCliente
);

module.exports = router;
