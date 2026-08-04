const recordatorioService = require('./recordatorios.service');
const logger = require('../../utils/logger');

class RecordatorioController {
  async getClientesParaRecordatorio(req, res) {
    try {
      const { page = 1, limit = 20, search, filtro = 'todos', notificado = 'todos', vendedor } = req.query;

      const result = await recordatorioService.getClientesParaRecordatorio({
        page: parseInt(page),
        limit: parseInt(limit),
        search,
        filtro,
        notificado,
        vendedor
      });

      res.json({
        success: true,
        data: result.clientes,
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: Math.ceil(result.total / result.limit)
        }
      });
    } catch (error) {
      logger.error('Error in getClientesParaRecordatorio controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo clientes para recordatorio',
        error: error.message
      });
    }
  }

  async registrarNotificacion(req, res) {
    try {
      const { clienteId } = req.params;
      const userId = req.user?.id || null;
      const { linea_contacto: lineaContacto } = req.body;

      const notificacion = await recordatorioService.registrarNotificacion(
        clienteId,
        userId,
        lineaContacto
      );

      res.status(201).json({
        success: true,
        message: 'Notificación registrada exitosamente',
        data: notificacion
      });
    } catch (error) {
      logger.error('Error in registrarNotificacion controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error registrando notificación',
        error: error.message
      });
    }
  }

  async getNotificacionesCliente(req, res) {
    try {
      const { clienteId } = req.params;
      const notificaciones = await recordatorioService.getNotificacionesCliente(clienteId);

      res.json({
        success: true,
        data: notificaciones
      });
    } catch (error) {
      logger.error('Error in getNotificacionesCliente controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo notificaciones del cliente',
        error: error.message
      });
    }
  }

  async getResumenRecordatorios(req, res) {
    try {
      const { vendedor } = req.query;
      const resumen = await recordatorioService.getResumenRecordatorios(vendedor);

      res.json({
        success: true,
        data: resumen
      });
    } catch (error) {
      logger.error('Error in getResumenRecordatorios controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo resumen de recordatorios',
        error: error.message
      });
    }
  }
  async getVendedores(req, res) {
    try {
      const vendedores = await recordatorioService.getVendedores();

      res.json({
        success: true,
        data: vendedores
      });
    } catch (error) {
      logger.error('Error in getVendedores controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error obteniendo vendedores',
        error: error.message
      });
    }
  }
}

module.exports = new RecordatorioController();
