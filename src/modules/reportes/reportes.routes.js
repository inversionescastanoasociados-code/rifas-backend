const express = require('express');
const router = express.Router();
const controller = require('./reportes.controller');
const { authenticateToken, authorize } = require('../../middlewares/auth');

// =====================================================
// REPORTES GLOBALES - todas las ventas
// (Se mantiene el set de roles original para no romper accesos existentes)
// =====================================================
router.get(
  '/rifa/:rifaId',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'VENDEDOR']),
  controller.getReporteRifa
);

router.get(
  '/rifa/:rifaId/ventas',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'VENDEDOR']),
  controller.getVentasGeneral
);

// =====================================================
// MIS REPORTES (ADMIN / VENDEDOR / SUPER_ADMIN)
// Solo ventas del usuario autenticado (filtra por req.user.id)
// =====================================================
router.get(
  '/mis-ventas/rifa/:rifaId',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'ADMIN', 'VENDEDOR']),
  controller.getMisReportesRifa
);

router.get(
  '/mis-ventas/rifa/:rifaId/ventas',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'ADMIN', 'VENDEDOR']),
  controller.getMisVentasGeneral
);

module.exports = router;
