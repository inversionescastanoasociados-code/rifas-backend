const abonoService = require('./abonos.service');
const logger = require('../../utils/logger');

class AbonoController {
  // async createAbono(req, res) {
  //   try {
  //     const abonoData = {
  //       ...req.body,
  //       recibido_por: req.user.id
  //     };
      
  //     const abono = await abonoService.createAbono(abonoData);
      
  //     res.status(201).json({
  //       success: true,
  //       message: 'Abono created successfully',
  //       data: abono
  //     });
  //   } catch (error) {
  //     logger.error('Error in createAbono controller:', error);
  //     res.status(500).json({
  //       success: false,
  //       message: 'Error creating abono',
  //       error: error.message
  //     });
  //   }
  // }

  async getAllAbonos(req, res) {
    try {
      const abonos = await abonoService.getAllAbonos();
      
      res.json({
        success: true,
        message: 'Abonos retrieved successfully',
        data: abonos
      });
    } catch (error) {
      logger.error('Error in getAllAbonos controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving abonos',
        error: error.message
      });
    }
  }

  async getAbonosByVenta(req, res) {
    try {
      const { venta_id } = req.params;
      const abonos = await abonoService.getAbonosByVenta(venta_id);
      
      res.json({
        success: true,
        message: 'Abonos retrieved successfully',
        data: abonos
      });
    } catch (error) {
      logger.error('Error in getAbonosByVenta controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving abonos',
        error: error.message
      });
    }
  }

  async getAbonoById(req, res) {
    try {
      const { id } = req.params;
      const abono = await abonoService.getAbonoById(id);
      
      res.json({
        success: true,
        message: 'Abono retrieved successfully',
        data: abono
      });
    } catch (error) {
      logger.error('Error in getAbonoById controller:', error);
      
      if (error.message === 'Abono not found') {
        return res.status(404).json({
          success: false,
          message: 'Abono not found'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error retrieving abono',
        error: error.message
      });
    }
  }

  async updateAbono(req, res) {
    try {
      const { id } = req.params;
      const abonoData = req.body;
      
      const abono = await abonoService.updateAbono(id, abonoData, req.user.id);
      
      res.json({
        success: true,
        message: 'Abono updated successfully',
        data: abono
      });
    } catch (error) {
      logger.error('Error in updateAbono controller:', error);
      
      if (error.message === 'Abono not found') {
        return res.status(404).json({
          success: false,
          message: 'Abono not found'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error updating abono',
        error: error.message
      });
    }
  }

  async receiveAbono(req, res) {
    try {
      const { id } = req.params;
      const abono = await abonoService.receiveAbono(id, req.user.id);
      
      res.json({
        success: true,
        message: 'Abono received successfully',
        data: abono
      });
    } catch (error) {
      logger.error('Error in receiveAbono controller:', error);
      
      if (error.message === 'Abono not found') {
        return res.status(404).json({
          success: false,
          message: 'Abono not found'
        });
      }
      
      if (error.message === 'Abono cannot be received') {
        return res.status(400).json({
          success: false,
          message: 'Abono cannot be received'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error receiving abono',
        error: error.message
      });
    }
  }

  async cancelAbono(req, res) {
    try {
      const { id } = req.params;
      const { motivo } = req.body;
      
      const abono = await abonoService.cancelAbono(id, motivo, req.user.id);
      
      res.json({
        success: true,
        message: 'Abono cancelled successfully',
        data: abono
      });
    } catch (error) {
      logger.error('Error in cancelAbono controller:', error);
      
      if (error.message === 'Abono not found') {
        return res.status(404).json({
          success: false,
          message: 'Abono not found'
        });
      }
      
      if (error.message === 'Received abono cannot be cancelled') {
        return res.status(400).json({
          success: false,
          message: 'Received abono cannot be cancelled'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error cancelling abono',
        error: error.message
      });
    }
  }

  async deleteAbono(req, res) {
    try {
      const { id } = req.params;
      const abono = await abonoService.deleteAbono(id);
      
      res.json({
        success: true,
        message: 'Abono deleted successfully',
        data: abono
      });
    } catch (error) {
      logger.error('Error in deleteAbono controller:', error);
      
      if (error.message === 'Abono not found') {
        return res.status(404).json({
          success: false,
          message: 'Abono not found'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error deleting abono',
        error: error.message
      });
    }
  }

  async getAbonosStats(req, res) {
    try {
      const stats = await abonoService.getAbonosStats();
      
      res.json({
        success: true,
        message: 'Abonos stats retrieved successfully',
        data: stats
      });
    } catch (error) {
      logger.error('Error in getAbonosStats controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving abonos stats',
        error: error.message
      });
    }
  }

  async getAbonosStatsByVenta(req, res) {
    try {
      const { venta_id } = req.params;
      const stats = await abonoService.getAbonosStatsByVenta(venta_id);
      
      res.json({
        success: true,
        message: 'Abonos stats retrieved successfully',
        data: stats
      });
    } catch (error) {
      logger.error('Error in getAbonosStatsByVenta controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving abonos stats',
        error: error.message
      });
    }
  }

  async getAbonosByDateRange(req, res) {
    try {
      const { fecha_inicio, fecha_fin } = req.query;
      const abonos = await abonoService.getAbonosByDateRange(fecha_inicio, fecha_fin);
      
      res.json({
        success: true,
        message: 'Abonos retrieved successfully',
        data: abonos
      });
    } catch (error) {
      logger.error('Error in getAbonosByDateRange controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving abonos',
        error: error.message
      });
    }
  }

  async getAbonosByMetodo(req, res) {
    try {
      const abonos = await abonoService.getAbonosByMetodo();
      
      res.json({
        success: true,
        message: 'Abonos by metodo retrieved successfully',
        data: abonos
      });
    } catch (error) {
      logger.error('Error in getAbonosByMetodo controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving abonos by metodo',
        error: error.message
      });
    }
  }

  async getAbonosPendientesByVenta(req, res) {
    try {
      const { venta_id } = req.params;
      const stats = await abonoService.getAbonosPendientesByVenta(venta_id);
      
      res.json({
        success: true,
        message: 'Abonos pendientes retrieved successfully',
        data: stats
      });
    } catch (error) {
      logger.error('Error in getAbonosPendientesByVenta controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving abonos pendientes',
        error: error.message
      });
    }
  }

async createAbono(req, res) {
  try {
    const { venta_id } = req.params;

    const abonoData = {
      ...req.body,
      venta_id,
      registrado_por: req.user.id
    };

    const abono = await abonoService.createAbono(abonoData);

    res.status(201).json({
      success: true,
      message: 'Abono creado correctamente',
      data: abono
    });
  } catch (error) {
    logger.error('Error in createAbono controller:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating abono',
      error: error.message
    });
  }
}
}

module.exports = new AbonoController();
