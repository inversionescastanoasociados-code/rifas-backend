const dashboardService = require('./public-dashboard.service');
const logger = require('../../utils/logger');

class PublicDashboardController {

  /**
   * GET /api/admin/dashboard/ventas-publicas
   * 📋 Listar todas las ventas públicas con filtros opcionales
   */
  async getVentasPublicas(req, res) {
    try {
      const filtros = {
        estado_venta: req.query.estado,
        rifa_id: req.query.rifa_id,
        cliente_nombre: req.query.cliente_nombre,
        cliente_identificacion: req.query.cliente_identificacion
      };

      const ventas = await dashboardService.getVentasPublicas(filtros);

      return res.json({
        success: true,
        data: ventas,
        count: ventas.length
      });
    } catch (error) {
      logger.error('Error en getVentasPublicas:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error obteniendo ventas'
      });
    }
  }

  /**
   * GET /api/admin/dashboard/ventas-publicas/pendientes
   * ⏳ Listar ventas públicas pendientes de confirmación
   */
  async getVentasPublicasPendientes(req, res) {
    try {
      const filtros = {
        cliente_nombre: req.query.cliente_nombre,
        cliente_identificacion: req.query.cliente_identificacion
      };

      const ventas = await dashboardService.getVentasPublicasPendientes(filtros);

      return res.json({
        success: true,
        data: ventas,
        count: ventas.length
      });
    } catch (error) {
      logger.error('Error en getVentasPublicasPendientes:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error obteniendo ventas pendientes'
      });
    }
  }

  /**
   * GET /api/admin/dashboard/ventas-publicas/:ventaId
   * 🔍 Obtener detalles completos de una venta pública
   */
  async getVentaPublicaDetails(req, res) {
    try {
      const { ventaId } = req.params;

      if (!ventaId) {
        return res.status(400).json({
          success: false,
          message: 'ventaId es requerido'
        });
      }

      const venta = await dashboardService.getVentaPublicaDetails(ventaId);

      return res.json({
        success: true,
        data: venta
      });
    } catch (error) {
      logger.error(`Error en getVentaPublicaDetails para ${req.params.ventaId}:`, error);
      
      if (error.message.includes('no encontrada')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      return res.status(500).json({
        success: false,
        message: error.message || 'Error obteniendo detalles de venta'
      });
    }
  }

  /**
   * POST /api/admin/dashboard/abonos/:abonoId/confirmar
   * ✅ Confirmar un pago manual de abono
   */
  async confirmarPago(req, res) {
    try {
      const { abonoId } = req.params;
      const { usuario_id } = req.user || {}; // Asumiendo que el usuario viene de JWT

      if (!abonoId) {
        return res.status(400).json({
          success: false,
          message: 'abonoId es requerido'
        });
      }

      const resultado = await dashboardService.confirmarPago(abonoId, usuario_id);

      logger.info(`Pago confirmado por usuario ${usuario_id}: ${resultado}`);

      return res.json({
        success: true,
        message: 'Pago confirmado correctamente',
        data: resultado
      });
    } catch (error) {
      logger.error(`Error confirmando pago ${req.params.abonoId}:`, error);
      
      return res.status(400).json({
        success: false,
        message: error.message || 'Error al confirmar pago'
      });
    }
  }

  /**
   * POST /api/admin/dashboard/ventas-publicas/:ventaId/cancelar
   * ❌ Cancelar una venta pública y liberar boletas
   */
  async cancelarVenta(req, res) {
    try {
      const { ventaId } = req.params;
      const { motivo } = req.body;

      if (!ventaId) {
        return res.status(400).json({
          success: false,
          message: 'ventaId es requerido'
        });
      }

      const resultado = await dashboardService.cancelarVenta(ventaId, motivo);

      return res.json({
        success: true,
        message: 'Venta cancelada exitosamente',
        data: resultado
      });
    } catch (error) {
      logger.error(`Error cancelando venta ${req.params.ventaId}:`, error);
      
      return res.status(400).json({
        success: false,
        message: error.message || 'Error al cancelar venta'
      });
    }
  }

  /**
   * GET /api/admin/dashboard/estadisticas
   * 📊 Obtener estadísticas generales de ventas públicas
   */
  async getEstadisticas(req, res) {
    try {
      const estadisticas = await dashboardService.getEstadisticas();

      return res.json({
        success: true,
        data: estadisticas
      });
    } catch (error) {
      logger.error('Error en getEstadisticas:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error obteniendo estadísticas'
      });
    }
  }

  /**
   * GET /api/admin/dashboard/estadisticas/por-rifa
   * 📈 Obtener estadísticas de ventas públicas por rifa
   */
  async getEstadisticasPorRifa(req, res) {
    try {
      const estadisticas = await dashboardService.getEstadisticasPorRifa();

      return res.json({
        success: true,
        data: estadisticas,
        count: estadisticas.length
      });
    } catch (error) {
      logger.error('Error en getEstadisticasPorRifa:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error obteniendo estadísticas'
      });
    }
  }
}

module.exports = new PublicDashboardController();
