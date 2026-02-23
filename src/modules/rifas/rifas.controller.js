const rifaService = require('./rifas.service');
const logger = require('../../utils/logger');

class RifaController {
  async createRifa(req, res) {
    try {
      const rifaData = {
        ...req.body,
        creado_por: req.user.id
      };
      
      const rifa = await rifaService.createRifa(rifaData);
      
      res.status(201).json({
        success: true,
        message: 'Rifa created successfully',
        data: rifa
      });
    } catch (error) {
      logger.error('Error in createRifa controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error creating rifa',
        error: error.message
      });
    }
  }

  async getAllRifas(req, res) {
    try {
      const { estado } = req.query;
      const rifas = await rifaService.getAllRifas(estado);
      
      res.json({
        success: true,
        message: 'Rifas retrieved successfully',
        data: rifas
      });
    } catch (error) {
      logger.error('Error in getAllRifas controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error retrieving rifas',
        error: error.message
      });
    }
  }

  async getRifaById(req, res) {
    try {
      const { id } = req.params;
      const rifa = await rifaService.getRifaById(id);
      
      res.json({
        success: true,
        message: 'Rifa retrieved successfully',
        data: rifa
      });
    } catch (error) {
      logger.error('Error in getRifaById controller:', error);
      
      if (error.message === 'Rifa not found') {
        return res.status(404).json({
          success: false,
          message: 'Rifa not found'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error retrieving rifa',
        error: error.message
      });
    }
  }

  async updateRifa(req, res) {
    try {
      const { id } = req.params;
      const rifaData = req.body;
      
      const rifa = await rifaService.updateRifa(id, rifaData);
      
      res.json({
        success: true,
        message: 'Rifa updated successfully',
        data: rifa
      });
    } catch (error) {
      logger.error('Error in updateRifa controller:', error);
      
      if (error.message === 'Rifa not found') {
        return res.status(404).json({
          success: false,
          message: 'Rifa not found'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error updating rifa',
        error: error.message
      });
    }
  }

  async deleteRifa(req, res) {
    try {
      const { id } = req.params;
      const rifa = await rifaService.deleteRifa(id);
      
      res.json({
        success: true,
        message: 'Rifa deleted successfully',
        data: rifa
      });
    } catch (error) {
      logger.error('Error in deleteRifa controller:', error);
      
      if (error.message === 'Rifa not found') {
        return res.status(404).json({
          success: false,
          message: 'Rifa not found'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error deleting rifa',
        error: error.message
      });
    }
  }

  async getRifaStats(req, res) {
    try {
      const { id } = req.params;
      const stats = await rifaService.getRifaStats(id);
      
      res.json({
        success: true,
        message: 'Rifa stats retrieved successfully',
        data: stats
      });
    } catch (error) {
      logger.error('Error in getRifaStats controller:', error);
      
      if (error.message === 'Rifa not found') {
        return res.status(404).json({
          success: false,
          message: 'Rifa not found'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error retrieving rifa stats',
        error: error.message
      });
    }
  }

  async generateBoletas(req, res) {
    try {
      const { id } = req.params;
      const boletaInfo = req.body;
      
      const result = await rifaService.generateBoletas(id, boletaInfo);
      
      res.status(201).json({
        success: true,
        message: 'Boletas generated successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error in generateBoletas controller:', error);
      
      if (error.message === 'Rifa not found') {
        return res.status(404).json({
          success: false,
          message: 'Rifa not found'
        });
      }
      
      if (error.message === 'Esta rifa ya tiene boletas generadas') {
        return res.status(400).json({
          success: false,
          message: 'Esta rifa ya tiene boletas generadas',
          error: 'BOLETAS_ALREADY_EXIST'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error generating boletas',
        error: error.message
      });
    }
  }
}

module.exports = new RifaController();
