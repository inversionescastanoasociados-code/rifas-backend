const express = require('express');
const router = express.Router();
const controller = require('./historial.controller');
const { authenticateToken, authorize } = require('../../middlewares/auth');

router.get(
  '/recientes',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'ADMIN']),
  controller.getRecientes
);

router.get(
  '/boleta/:boletaId',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'ADMIN']),
  controller.getByBoleta
);

router.get(
  '/cliente/:clienteId',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'ADMIN']),
  controller.getByCliente
);

router.get(
  '/venta/:ventaId',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'ADMIN']),
  controller.getByVenta
);

router.get(
  '/rifa/:rifaId/numero/:numero',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'ADMIN']),
  controller.getByNumero
);

module.exports = router;
