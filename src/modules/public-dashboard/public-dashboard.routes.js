const express = require('express');
const router = express.Router();

const { authenticateToken, authorize } = require('../../middlewares/auth');
const dashboardController = require('./public-dashboard.controller');

/**
 * 🔐 Middleware de autenticación JWT
 * Solo ADMIN y SUPER_ADMIN pueden acceder
 */
router.use(authenticateToken);

/**
 * 📋 GET /api/admin/dashboard/ventas-publicas
 * Listar todas las ventas públicas con filtros opcionales
 * Query params: ?estado=PENDIENTE&rifa_id=xxx&cliente_nombre=xxx
 */
router.get('/ventas-publicas', dashboardController.getVentasPublicas);

/**
 * ⏳ GET /api/admin/dashboard/ventas-publicas/pendientes
 * Listar SOLO ventas públicas pendientes de confirmación de pago
 */
router.get('/ventas-publicas/pendientes', dashboardController.getVentasPublicasPendientes);

/**
 * 🔍 GET /api/admin/dashboard/ventas-publicas/:ventaId
 * Obtener detalles COMPLETOS de una venta pública específica
 * Incluye: cliente, boletas, abonos pendientes
 */
router.get('/ventas-publicas/:ventaId', dashboardController.getVentaPublicaDetails);

/**
 * ✅ POST /api/admin/dashboard/abonos/:abonoId/confirmar
 * Confirmar MANUALMENTE un pago de abono
 * Cuando se confirma:
 *   - El abono pasa a estado CONFIRMADO
 *   - Si es pago completo, la boleta pasa a PAGADA
 *   - Si todas las boletas están pagadas, la venta pasa a PAGADA
 */
router.post('/abonos/:abonoId/confirmar', dashboardController.confirmarPago);

/**
 * ✅ POST /api/admin/dashboard/ventas-publicas/:ventaId/marcar-revisada
 * Marcar una venta como revisada (SIN_REVISAR → PENDIENTE)
 * Se usa cuando el admin envía el WhatsApp de recordatorio al cliente
 */
router.post('/ventas-publicas/:ventaId/marcar-revisada', dashboardController.marcarRevisada);

/**
 * ❌ POST /api/admin/dashboard/ventas-publicas/:ventaId/cancelar
 * Cancelar una venta pública completa
 * Cuando se cancela:
 *   - La venta pasa a estado CANCELADA
 *   - Todas sus boletas vuelven a DISPONIBLE
 *   - Se liberan todas sus reservas
 * Body: { motivo?: string }
 */
router.post('/ventas-publicas/:ventaId/cancelar', dashboardController.cancelarVenta);

/**
 * 📊 GET /api/admin/dashboard/estadisticas
 * Obtener estadísticas GENERALES de ventas públicas
 * Retorna: total, pagadas, abonadas, pendientes, etc.
 */
router.get('/estadisticas', dashboardController.getEstadisticas);

/**
 * 📈 GET /api/admin/dashboard/estadisticas/por-rifa
 * Obtener estadísticas de ventas públicas AGRUPADAS POR RIFA
 * Útil para ver performance de cada rifa
 */
router.get('/estadisticas/por-rifa', dashboardController.getEstadisticasPorRifa);

module.exports = router;
