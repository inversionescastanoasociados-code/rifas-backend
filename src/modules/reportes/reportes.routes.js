const express = require('express');
const router = express.Router();
const controller = require('./reportes.controller');
const { authenticateToken } = require('../../middlewares/auth');

router.get(
  '/rifa/:rifaId',
  authenticateToken,
  controller.getReporteRifa
);

// Listado general de ventas por rifa con filtros de fecha y paginación
router.get(
  '/rifa/:rifaId/ventas',
  authenticateToken,
  controller.getVentasGeneral
);

module.exports = router;
