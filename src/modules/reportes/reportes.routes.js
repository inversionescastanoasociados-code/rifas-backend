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

// =====================================================
// SEGUIMIENTO DE CLIENTES CON BOLETAS
// Lista todos los clientes con detalle de boletas,
// abonos, saldos y recordatorios. Solo ADMIN/SUPER_ADMIN.
// =====================================================
router.get(
  '/seguimiento-clientes',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'ADMIN']),
  controller.getSeguimientoClientes
);

// Registrar un contacto manual a un cliente (ajeno a recordatorios)
router.post(
  '/seguimiento-clientes/:clienteId/contacto',
  authenticateToken,
  authorize(['SUPER_ADMIN', 'ADMIN']),
  controller.registrarContactoSeguimiento
);

module.exports = router;
