const express = require('express');
const router = express.Router();
const controller = require('./reportes.controller');
const { authenticateToken, authorize } = require('../../middlewares/auth');

router.get(
  '/rifa/:rifaId',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'VENDEDOR']),
  controller.getReporteRifa
);

// Listado general de ventas por rifa con filtros de fecha y paginación
router.get(
  '/rifa/:rifaId/ventas',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'VENDEDOR']),
  controller.getVentasGeneral
);

module.exports = router;
