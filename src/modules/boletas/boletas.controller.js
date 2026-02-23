const boletaService = require('./boletas.service');
const logger = require('../../utils/logger');

class BoletaController {
  async createBoleta(req, res) {
    try {
      const boletaData = {
        ...req.body,
        vendida_por: req.user.id
      };
      
      const boleta = await boletaService.createBoleta(boletaData);
      
      res.status(201).json({
        success: true,
        message: 'Boleta created successfully',
        data: boleta
      });
    } catch (error) {
      logger.error('Error in createBoleta controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating boleta',
        error: error.message
      });
    }
  }

  async batchCreateBoletas(req, res) {
    try {
      const { rifa_id, total_boletas } = req.body;
      
      const boletas = await boletaService.batchCreateBoletas(rifa_id, total_boletas);
      
      res.status(201).json({
        success: true,
        message: `${boletas.length} boletas created successfully`,
        data: boletas
      });
    } catch (error) {
      logger.error('Error in batchCreateBoletas controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating boletas',
        error: error.message
      });
    }
  }

  async getBoletasByRifa(req, res) {
    try {
      const { rifa_id } = req.params;
      const { estado } = req.query;
      
      const boletas = await boletaService.getBoletasByRifa(rifa_id, estado);
      
      res.json({
        success: true,
        message: 'Boletas retrieved successfully',
        data: boletas
      });
    } catch (error) {
      logger.error('Error in getBoletasByRifa controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving boletas',
        error: error.message
      });
    }
  }

  async getBoletaById(req, res) {
    try {
      const { id } = req.params;
      const boleta = await boletaService.getBoletaById(id);
      
      res.json({
        success: true,
        message: 'Boleta retrieved successfully',
        data: boleta
      });
    } catch (error) {
      logger.error('Error in getBoletaById controller:', error);
      
      if (error.message === 'Boleta not found') {
        return res.status(404).json({
          success: false,
          message: 'Boleta not found'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error retrieving boleta',
        error: error.message
      });
    }
  }

  async updateBoleta(req, res) {
    try {
      const { id } = req.params;
      const boletaData = req.body;
      
      const boleta = await boletaService.updateBoleta(id, boletaData, req.user.id);
      
      res.json({
        success: true,
        message: 'Boleta updated successfully',
        data: boleta
      });
    } catch (error) {
      logger.error('Error in updateBoleta controller:', error);
      
      if (error.message === 'Boleta not found') {
        return res.status(404).json({
          success: false,
          message: 'Boleta not found'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error updating boleta',
        error: error.message
      });
    }
  }

  async sellBoleta(req, res) {
    try {
      const { id } = req.params;
      const { nombre_comprador, telefono } = req.body;
      
      const boleta = await boletaService.sellBoleta(id, nombre_comprador, telefono, req.user.id);
      
      res.json({
        success: true,
        message: 'Boleta sold successfully',
        data: boleta
      });
    } catch (error) {
      logger.error('Error in sellBoleta controller:', error);
      
      if (error.message === 'Boleta not found') {
        return res.status(404).json({
          success: false,
          message: 'Boleta not found'
        });
      }
      
      if (error.message === 'Boleta is not available for sale') {
        return res.status(400).json({
          success: false,
          message: 'Boleta is not available for sale'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error selling boleta',
        error: error.message
      });
    }
  }

  async deleteBoleta(req, res) {
    try {
      const { id } = req.params;
      const boleta = await boletaService.deleteBoleta(id);
      
      res.json({
        success: true,
        message: 'Boleta deleted successfully',
        data: boleta
      });
    } catch (error) {
      logger.error('Error in deleteBoleta controller:', error);
      
      if (error.message === 'Boleta not found') {
        return res.status(404).json({
          success: false,
          message: 'Boleta not found'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error deleting boleta',
        error: error.message
      });
    }
  }

  async bloquearBoleta(req, res) {
    try {
      const { id } = req.params;
      const { tiempo_bloqueo = 15 } = req.body; // minutos
      const userId = req.user.id;
      
      const result = await boletaService.bloquearBoleta(id, userId, tiempo_bloqueo);
      
      res.status(201).json({
        success: true,
        message: 'Boleta blocked successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error in bloquearBoleta controller:', error);
      
      if (error.message === 'Boleta not found') {
        return res.status(404).json({
          success: false,
          message: 'Boleta not found'
        });
      }
      
      if (error.message === 'Boleta already sold') {
        return res.status(400).json({
          success: false,
          message: 'Esta boleta ya está vendida',
          error: 'BOLETA_ALREADY_SOLD'
        });
      }
      
      if (error.message === 'Boleta already blocked') {
        return res.status(400).json({
          success: false,
          message: 'Esta boleta ya está bloqueada por otro usuario',
          error: 'BOLETA_ALREADY_BLOCKED'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error blocking boleta',
        error: error.message
      });
    }
  }

  async desbloquearBoleta(req, res) {
    try {
      const { id } = req.params;
      const { reserva_token } = req.body;
      
      const result = await boletaService.desbloquearBoleta(id, reserva_token);
      
      res.json({
        success: true,
        message: 'Boleta unblocked successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error in desbloquearBoleta controller:', error);
      
      if (error.message === 'Boleta not found') {
        return res.status(404).json({
          success: false,
          message: 'Boleta not found'
        });
      }
      
      if (error.message === 'Invalid reservation token') {
        return res.status(400).json({
          success: false,
          message: 'Token de reserva inválido',
          error: 'INVALID_RESERVATION_TOKEN'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error unblocking boleta',
        error: error.message
      });
    }
  }

  async verificarBloqueo(req, res) {
    try {
      const { id } = req.params;
      const { reserva_token } = req.query;
      
      const result = await boletaService.verificarBloqueo(id, reserva_token);
      
      if (!result.found) {
        return res.status(404).json({
          success: false,
          message: result.message
        });
      }
      
      if (!result.valid) {
        return res.status(400).json({
          success: false,
          message: result.message,
          expired: result.expired || false
        });
      }
      
      res.json({
        success: true,
        message: 'Reservation is valid',
        data: result
      });
    } catch (error) {
      logger.error('Error in verificarBloqueo controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error checking reservation',
        error: error.message
      });
    }
  }

  async updateBoletaImage(req, res) {
    try {
      const { id } = req.params;
      const { imagen_url } = req.body;
      
      const result = await boletaService.updateBoletaImage(id, imagen_url);
      
      res.json({
        success: true,
        message: 'Boleta image updated successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error in updateBoletaImage controller:', error);
      
      if (error.message === 'Boleta not found') {
        return res.status(404).json({
          success: false,
          message: 'Boleta not found'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error updating boleta image',
        error: error.message
      });
    }
  }

  async getAvailableBoletas(req, res) {
    try {
      const { rifa_id } = req.params;
      const boletas = await boletaService.getAvailableBoletas(rifa_id);
      
      res.json({
        success: true,
        message: 'Available boletas retrieved successfully',
        data: boletas
      });
    } catch (error) {
      logger.error('Error in getAvailableBoletas controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving available boletas',
        error: error.message
      });
    }
  }

  async getBoletasStats(req, res) {
    try {
      const { rifa_id } = req.params;
      const stats = await boletaService.getBoletasStats(rifa_id);
      
      res.json({
        success: true,
        message: 'Boletas stats retrieved successfully',
        data: stats
      });
    } catch (error) {
      logger.error('Error in getBoletasStats controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving boletas stats',
        error: error.message
      });
    }
  }

  async getBoletasFullStatus(req, res) {
    try {
      const { rifa_id } = req.params;
      const fullStatus = await boletaService.getBoletasFullStatus(rifa_id);
      
      res.json({
        success: true,
        message: 'Boletas full status retrieved successfully',
        data: fullStatus
      });
    } catch (error) {
      logger.error('Error in getBoletasFullStatus controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving boletas full status',
        error: error.message
      });
    }
  }
}

module.exports = new BoletaController();
