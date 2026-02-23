const pagoService = require('./pagos.service');
const logger = require('../../utils/logger');

class PagoController {
  async createPago(req, res) {
    try {
      const pagoData = {
        ...req.body,
        procesado_por: req.user.id
      };
      
      const pago = await pagoService.createPago(pagoData);
      
      res.status(201).json({
        success: true,
        message: 'Pago created successfully',
        data: pago
      });
    } catch (error) {
      logger.error('Error in createPago controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating pago',
        error: error.message
      });
    }
  }

  async getAllPagos(req, res) {
    try {
      const pagos = await pagoService.getAllPagos();
      
      res.json({
        success: true,
        message: 'Pagos retrieved successfully',
        data: pagos
      });
    } catch (error) {
      logger.error('Error in getAllPagos controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving pagos',
        error: error.message
      });
    }
  }

  async getPagosByVenta(req, res) {
    try {
      const { venta_id } = req.params;
      const pagos = await pagoService.getPagosByVenta(venta_id);
      
      res.json({
        success: true,
        message: 'Pagos retrieved successfully',
        data: pagos
      });
    } catch (error) {
      logger.error('Error in getPagosByVenta controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving pagos',
        error: error.message
      });
    }
  }

  async getPagoById(req, res) {
    try {
      const { id } = req.params;
      const pago = await pagoService.getPagoById(id);
      
      res.json({
        success: true,
        message: 'Pago retrieved successfully',
        data: pago
      });
    } catch (error) {
      logger.error('Error in getPagoById controller:', error);
      
      if (error.message === 'Pago not found') {
        return res.status(404).json({
          success: false,
          message: 'Pago not found'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error retrieving pago',
        error: error.message
      });
    }
  }

  async updatePago(req, res) {
    try {
      const { id } = req.params;
      const pagoData = req.body;
      
      const pago = await pagoService.updatePago(id, pagoData, req.user.id);
      
      res.json({
        success: true,
        message: 'Pago updated successfully',
        data: pago
      });
    } catch (error) {
      logger.error('Error in updatePago controller:', error);
      
      if (error.message === 'Pago not found') {
        return res.status(404).json({
          success: false,
          message: 'Pago not found'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error updating pago',
        error: error.message
      });
    }
  }

  async processPago(req, res) {
    try {
      const { id } = req.params;
      const pago = await pagoService.processPago(id, req.user.id);
      
      res.json({
        success: true,
        message: 'Pago processed successfully',
        data: pago
      });
    } catch (error) {
      logger.error('Error in processPago controller:', error);
      
      if (error.message === 'Pago not found') {
        return res.status(404).json({
          success: false,
          message: 'Pago not found'
        });
      }
      
      if (error.message === 'Pago cannot be processed') {
        return res.status(400).json({
          success: false,
          message: 'Pago cannot be processed'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error processing pago',
        error: error.message
      });
    }
  }

  async failPago(req, res) {
    try {
      const { id } = req.params;
      const { motivo } = req.body;
      
      const pago = await pagoService.failPago(id, motivo, req.user.id);
      
      res.json({
        success: true,
        message: 'Pago failed successfully',
        data: pago
      });
    } catch (error) {
      logger.error('Error in failPago controller:', error);
      
      if (error.message === 'Pago not found') {
        return res.status(404).json({
          success: false,
          message: 'Pago not found'
        });
      }
      
      if (error.message === 'Completed pago cannot be failed') {
        return res.status(400).json({
          success: false,
          message: 'Completed pago cannot be failed'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error failing pago',
        error: error.message
      });
    }
  }

  async deletePago(req, res) {
    try {
      const { id } = req.params;
      const pago = await pagoService.deletePago(id);
      
      res.json({
        success: true,
        message: 'Pago deleted successfully',
        data: pago
      });
    } catch (error) {
      logger.error('Error in deletePago controller:', error);
      
      if (error.message === 'Pago not found') {
        return res.status(404).json({
          success: false,
          message: 'Pago not found'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error deleting pago',
        error: error.message
      });
    }
  }

  async getPagosStats(req, res) {
    try {
      const stats = await pagoService.getPagosStats();
      
      res.json({
        success: true,
        message: 'Pagos stats retrieved successfully',
        data: stats
      });
    } catch (error) {
      logger.error('Error in getPagosStats controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving pagos stats',
        error: error.message
      });
    }
  }

  async getPagosStatsByVenta(req, res) {
    try {
      const { venta_id } = req.params;
      const stats = await pagoService.getPagosStatsByVenta(venta_id);
      
      res.json({
        success: true,
        message: 'Pagos stats retrieved successfully',
        data: stats
      });
    } catch (error) {
      logger.error('Error in getPagosStatsByVenta controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving pagos stats',
        error: error.message
      });
    }
  }

  async getPagosByDateRange(req, res) {
    try {
      const { fecha_inicio, fecha_fin } = req.query;
      const pagos = await pagoService.getPagosByDateRange(fecha_inicio, fecha_fin);
      
      res.json({
        success: true,
        message: 'Pagos retrieved successfully',
        data: pagos
      });
    } catch (error) {
      logger.error('Error in getPagosByDateRange controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving pagos',
        error: error.message
      });
    }
  }

  async getPagosByMetodo(req, res) {
    try {
      const pagos = await pagoService.getPagosByMetodo();
      
      res.json({
        success: true,
        message: 'Pagos by metodo retrieved successfully',
        data: pagos
      });
    } catch (error) {
      logger.error('Error in getPagosByMetodo controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving pagos by metodo',
        error: error.message
      });
    }
  }
}

module.exports = new PagoController();
