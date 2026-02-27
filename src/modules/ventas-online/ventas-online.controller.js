/**
 * ═══════════════════════════════════════════════════════════════
 *  VENTAS ONLINE — CONTROLLER
 *  
 *  Manejo de errores seguro:
 *  - Nunca expone stack traces al público
 *  - Logs detallados internos para debugging
 *  - Respuestas genéricas para errores inesperados
 * ═══════════════════════════════════════════════════════════════
 */

const ventasOnlineService = require('./ventas-online.service');
const logger = require('../../utils/logger');

class VentasOnlineController {

  /**
   * GET /api/ventas-online/rifas
   * Obtener rifas activas con boletas disponibles
   */
  async getRifasActivas(req, res) {
    try {
      const rifas = await ventasOnlineService.getRifasActivas();
      return res.json({
        success: true,
        data: rifas,
        count: rifas.length
      });
    } catch (error) {
      logger.error('[VentasOnline:Controller] getRifasActivas error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener rifas disponibles'
      });
    }
  }

  /**
   * GET /api/ventas-online/rifas/:rifaId/boletas
   * Obtener boletas disponibles de una rifa
   */
  async getBoletasDisponibles(req, res) {
    try {
      const { rifaId } = req.params;
      const data = await ventasOnlineService.getBoletasDisponibles(rifaId);
      return res.json({
        success: true,
        data
      });
    } catch (error) {
      logger.error('[VentasOnline:Controller] getBoletasDisponibles error:', error);
      const status = error.message.includes('no encontrada') ? 404 : 500;
      return res.status(status).json({
        success: false,
        message: error.message || 'Error al obtener boletas'
      });
    }
  }

  /**
   * POST /api/ventas-online/boletas/bloquear
   * Bloquear una o varias boletas temporalmente
   */
  async bloquearBoletas(req, res) {
    try {
      const { rifa_id, boleta_ids, tiempo_bloqueo_minutos } = req.body;
      const result = await ventasOnlineService.bloquearBoletas(
        rifa_id,
        boleta_ids,
        tiempo_bloqueo_minutos
      );
      return res.json({
        success: true,
        message: 'Boletas bloqueadas correctamente',
        data: result
      });
    } catch (error) {
      logger.error('[VentasOnline:Controller] bloquearBoletas error:', error);
      const status = error.message.includes('no encontrada') ? 404 
                   : error.message.includes('no está activa') ? 400
                   : error.message.includes('Máximo') ? 400
                   : error.message.includes('No se pudieron bloquear') ? 409
                   : 500;
      return res.status(status).json({
        success: false,
        message: error.message || 'Error al bloquear boletas'
      });
    }
  }

  /**
   * POST /api/ventas-online/boletas/liberar
   * Liberar boletas bloqueadas (el usuario cancela)
   */
  async liberarBoletas(req, res) {
    try {
      const { reserva_token } = req.body;
      const result = await ventasOnlineService.liberarBoletas(reserva_token);
      return res.json({
        success: true,
        message: 'Boletas liberadas correctamente',
        data: result
      });
    } catch (error) {
      logger.error('[VentasOnline:Controller] liberarBoletas error:', error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error al liberar boletas'
      });
    }
  }

  /**
   * POST /api/ventas-online/reservas
   * Crear reserva formal (bloqueo temporal → reserva con datos del cliente)
   */
  async crearReserva(req, res) {
    try {
      const result = await ventasOnlineService.crearReserva(req.body);
      return res.status(201).json({
        success: true,
        message: 'Reserva creada exitosamente',
        data: result
      });
    } catch (error) {
      logger.error('[VentasOnline:Controller] crearReserva error:', error);
      const status = error.message.includes('expirad') ? 410  // Gone
                   : error.message.includes('inválid') ? 400
                   : error.message.includes('no encontr') ? 404
                   : error.message.includes('ya tiene') ? 409  // Conflict
                   : error.message.includes('obligatori') ? 400
                   : 500;
      return res.status(status).json({
        success: false,
        message: error.message || 'Error al crear la reserva'
      });
    }
  }

  /**
   * GET /api/ventas-online/reservas/:token/estado
   * Consultar estado de una reserva (público, sin auth)
   */
  async getEstadoReserva(req, res) {
    try {
      const { token } = req.params;
      const result = await ventasOnlineService.getEstadoReserva(token);
      return res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('[VentasOnline:Controller] getEstadoReserva error:', error);
      const status = error.message.includes('inválid') ? 400
                   : error.message.includes('no encontrad') ? 404
                   : 500;
      return res.status(status).json({
        success: false,
        message: error.message || 'Error al consultar reserva'
      });
    }
  }

  /**
   * GET /api/ventas-online/medios-pago
   * Obtener medios de pago activos
   */
  async getMediosPago(req, res) {
    try {
      const medios = await ventasOnlineService.getMediosPago();
      return res.json({
        success: true,
        data: medios,
        count: medios.length
      });
    } catch (error) {
      logger.error('[VentasOnline:Controller] getMediosPago error:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al obtener medios de pago'
      });
    }
  }

  /**
   * GET /api/ventas-online/consulta/cedula/:cedula
   * Consultar estado de cuenta de un cliente por cédula
   */
  async consultarPorCedula(req, res) {
    try {
      const { cedula } = req.params;
      const result = await ventasOnlineService.consultarPorCedula(cedula);
      return res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('[VentasOnline:Controller] consultarPorCedula error:', error);
      const status = error.message.includes('inválida') ? 400 : 500;
      return res.status(status).json({
        success: false,
        message: error.message || 'Error al consultar por cédula'
      });
    }
  }
}

module.exports = new VentasOnlineController();
