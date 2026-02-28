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
   * POST /api/admin/dashboard/ventas-publicas/:ventaId/marcar-revisada
   * ✅ Marcar venta como revisada (SIN_REVISAR → PENDIENTE)
   */
  async marcarRevisada(req, res) {
    try {
      const { ventaId } = req.params;

      if (!ventaId) {
        return res.status(400).json({
          success: false,
          message: 'ventaId es requerido'
        });
      }

      const resultado = await dashboardService.marcarRevisada(ventaId);

      return res.json({
        success: true,
        message: 'Venta marcada como revisada',
        data: resultado
      });
    } catch (error) {
      logger.error(`Error marcando venta ${req.params.ventaId} como revisada:`, error);
      
      return res.status(400).json({
        success: false,
        message: error.message || 'Error al marcar venta como revisada'
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

  /**
   * GET /api/admin/dashboard/ventas-publicas/sin-revisar
   * 🔔 Obtener SOLO ventas en estado SIN_REVISAR (para banner de notificación)
   */
  async getVentasSinRevisar(req, res) {
    try {
      const ventas = await dashboardService.getVentasSinRevisar();
      return res.json({
        success: true,
        data: ventas,
        count: ventas.length
      });
    } catch (error) {
      logger.error('Error en getVentasSinRevisar:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error obteniendo ventas sin revisar'
      });
    }
  }

  /**
   * GET /api/admin/dashboard/boletas-reservadas
   * 🎟️ Obtener todas las boletas reservadas (online + punto físico)
   */
  async getBoletasReservadas(req, res) {
    try {
      const boletas = await dashboardService.getBoletasReservadas();
      return res.json({
        success: true,
        data: boletas,
        count: boletas.length
      });
    } catch (error) {
      logger.error('Error en getBoletasReservadas:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error obteniendo boletas reservadas'
      });
    }
  }

  /**
   * POST /api/admin/dashboard/boletas-reservadas/:boletaId/liberar
   * 🔓 Liberar manualmente una boleta reservada
   */
  async liberarBoleta(req, res) {
    try {
      const { boletaId } = req.params;
      const resultado = await dashboardService.liberarBoletaManual(boletaId);
      return res.json({
        success: true,
        message: `Boleta #${resultado.numero} liberada exitosamente`,
        data: resultado
      });
    } catch (error) {
      logger.error(`Error liberando boleta ${req.params.boletaId}:`, error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error liberando boleta'
      });
    }
  }

  /**
   * POST /api/admin/dashboard/boletas-reservadas/venta/:ventaId/liberar
   * 🔓 Liberar TODAS las boletas de una venta
   */
  async liberarBoletasDeVenta(req, res) {
    try {
      const { ventaId } = req.params;
      const resultado = await dashboardService.liberarBoletasDeVenta(ventaId);
      return res.json({
        success: true,
        message: `${resultado.boletas_liberadas} boletas liberadas exitosamente`,
        data: resultado
      });
    } catch (error) {
      logger.error(`Error liberando boletas de venta ${req.params.ventaId}:`, error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error liberando boletas'
      });
    }
  }
}

module.exports = new PublicDashboardController();
