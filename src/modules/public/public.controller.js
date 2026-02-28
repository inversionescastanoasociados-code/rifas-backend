const publicService = require('./public.service');
const logger = require('../../utils/logger');
const { errorHandler } = require('../../middlewares/error');

class PublicController {

  /**
   * GET /api/public/rifas
   * 🟢 Obtener todas las rifas activas
   */
  async getRifasActivas(req, res, next) {
    try {
      const rifas = await publicService.getRifasActivas();

      return res.json({
        success: true,
        data: rifas,
        count: rifas.length
      });

    } catch (error) {
      logger.error('Error en getRifasActivas:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Error obteniendo rifas'
      });
    }
  }


  /**
   * GET /api/public/rifas/:rifaId/boletas
   * ✅ Obtener boletas disponibles de una rifa
   */
  async getBoletasRifa(req, res, next) {
    try {
      const { rifaId } = req.params;

      if (!rifaId) {
        return res.status(400).json({
          success: false,
          message: 'rifaId es requerido'
        });
      }

      const boletas = await publicService.getBoletasRifa(rifaId);

      return res.json({
        success: true,
        data: boletas,
        count: boletas.length
      });

    } catch (error) {
      logger.error(`Error en getBoletasRifa para rifa ${req.params.rifaId}:`, error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error obteniendo boletas'
      });
    }
  }


  /**
   * POST /api/public/boletas/:id/bloquear
   * 🔒 Bloquear una boleta (reserva temporal)
   */
  async bloquearBoleta(req, res, next) {
    try {
      const { id } = req.params;
      const { tiempo_bloqueo_minutos } = req.body;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'ID de boleta es requerido'
        });
      }

      const boleta = await publicService.bloquearBoletaPublica(
        id,
        tiempo_bloqueo_minutos || 15
      );

      logger.info(`Boleta ${id} bloqueada desde web pública`);

      return res.json({
        success: true,
        message: 'Boleta bloqueada correctamente',
        data: boleta
      });

    } catch (error) {
      logger.error(`Error al bloquear boleta ${req.params.id}:`, error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error al bloquear boleta'
      });
    }
  }


  /**
   * POST /api/public/ventas
   * 💾 Crear venta desde web pública
   */
  async crearVentaPublica(req, res, next) {
    try {
      const ventaData = req.body;

      // Validaciones básicas
      if (!ventaData.rifa_id) {
        return res.status(400).json({
          success: false,
          message: 'rifa_id es requerido'
        });
      }

      if (!ventaData.cliente || !ventaData.cliente.nombre || !ventaData.cliente.telefono) {
        return res.status(400).json({
          success: false,
          message: 'Datos del cliente incompletos (nombre y teléfono requeridos)'
        });
      }

      if (!ventaData.boletas || !Array.isArray(ventaData.boletas) || ventaData.boletas.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Debe seleccionar al menos una boleta'
        });
      }

      if (ventaData.total_venta === undefined || ventaData.total_venta <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Total debe ser mayor a 0'
        });
      }

      const venta = await publicService.crearVentaPublica(ventaData);

      logger.info(`Venta pública creada: ${venta.venta_id} por cliente ${venta.cliente_id}`);

      return res.status(201).json({
        success: true,
        message: 'Venta registrada correctamente desde web pública',
        data: venta
      });

    } catch (error) {
      logger.error('Error al crear venta pública:', error);
      
      return res.status(400).json({
        success: false,
        message: error.message || 'Error al registrar la venta'
      });
    }
  }

  /**
   * GET /api/public/cliente/:identificacion/boletas
   * 🎫 Obtener boletas de un cliente por su cédula/identificación
   * Para el link de WhatsApp de descarga de boletas
   */
  async getBoletasCliente(req, res) {
    try {
      const { identificacion } = req.params;
      const { rifa_id } = req.query;

      if (!identificacion) {
        return res.status(400).json({
          success: false,
          message: 'Identificación del cliente es requerida'
        });
      }

      const resultado = await publicService.getBoletasCliente(identificacion, rifa_id);

      return res.json({
        success: true,
        data: resultado
      });

    } catch (error) {
      logger.error(`Error en getBoletasCliente para ${req.params.identificacion}:`, error);
      return res.status(400).json({
        success: false,
        message: error.message || 'Error obteniendo boletas del cliente'
      });
    }
  }

}

module.exports = new PublicController();