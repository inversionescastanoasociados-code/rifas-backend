const clienteService = require('./clientes.service');
const logger = require('../../utils/logger');

class ClienteController {
  async createCliente(req, res) {
    try {
      const clienteData = req.body;
      const cliente = await clienteService.createCliente(clienteData);
      
      res.status(201).json({
        success: true,
        message: 'Cliente created successfully',
        data: cliente
      });
    } catch (error) {
      logger.error('Error in createCliente controller:', error);
      
      // Manejar específicamente el error de cédula duplicada
      if (error.message === 'Identification already exists') {
        return res.status(400).json({
          success: false,
          message: 'Ya hay un cliente creado con esta cédula',
          error: 'DUPLICATE_IDENTIFICATION'
        });
      }
      
      // Manejar otros errores de unicidad
      if (error.message === 'Email already exists') {
        return res.status(400).json({
          success: false,
          message: 'El email ya está registrado',
          error: 'DUPLICATE_EMAIL'
        });
      }
      
      if (error.message === 'Phone number already exists') {
        return res.status(400).json({
          success: false,
          message: 'El número de teléfono ya está registrado',
          error: 'DUPLICATE_PHONE'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error creating cliente',
        error: error.message
      });
    }
  }

  async updateCliente(req, res) {
    try {
      const { id } = req.params;
      const clienteData = req.body;
      
      const cliente = await clienteService.updateCliente(id, clienteData);
      
      if (!cliente) {
        return res.status(404).json({
          success: false,
          message: 'Cliente not found'
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Cliente updated successfully',
        data: cliente
      });
    } catch (error) {
      logger.error('Error in updateCliente controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error updating cliente',
        error: error.message
      });
    }
  }

  async getClienteById(req, res) {
    try {
      const { id } = req.params;
      
      const cliente = await clienteService.getClienteById(id);
      
      if (!cliente) {
        return res.status(404).json({
          success: false,
          message: 'Cliente not found'
        });
      }
      
      res.status(200).json({
        success: true,
        data: cliente
      });
    } catch (error) {
      logger.error('Error in getClienteById controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting cliente',
        error: error.message
      });
    }
  }

  async getAllClientes(req, res) {
    try {
      const { page = 1, limit = 10, search } = req.query;
      
      const result = await clienteService.getAllClientes({
        page: parseInt(page),
        limit: parseInt(limit),
        search
      });
      
      res.status(200).json({
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
      logger.error('Error in getAllClientes controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting clientes',
        error: error.message
      });
    }
  }

  async getClienteByIdentificacion(req, res) {
    try {
      const { identificacion } = req.params;
      
      const cliente = await clienteService.getClienteByIdentificacion(identificacion);
      
      if (!cliente) {
        return res.status(404).json({
          success: false,
          message: 'Cliente not found'
        });
      }
      
      res.status(200).json({
        success: true,
        data: cliente
      });
    } catch (error) {
      logger.error('Error in getClienteByIdentificacion controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting cliente',
        error: error.message
      });
    }
  }

  async getClienteByCedula(req, res) {
    try {
      const { cedula } = req.params;
      
      const cliente = await clienteService.getClienteByCedula(cedula);
      
      if (!cliente) {
        return res.status(404).json({
          success: false,
          message: 'Cliente not found'
        });
      }
      
      res.status(200).json({
        success: true,
        data: cliente
      });
    } catch (error) {
      logger.error('Error in getClienteByCedula controller:', error);
      res.status(500).json({
        success: false,
        message: 'Error getting cliente',
        error: error.message
      });
    }
  }

  async deleteCliente(req, res) {
    try {
      const { id } = req.params;
      
      const deleted = await clienteService.deleteCliente(id);
      
      if (!deleted) {
        return res.status(404).json({
          success: false,
          message: 'Cliente not found'
        });
      }
      
      res.status(200).json({
        success: true,
        message: 'Cliente deleted successfully'
      });
    } catch (error) {
      logger.error('Error in deleteCliente controller:', error);
      
      // Manejar específicamente el error de restricción
      if (error.message === 'Cannot delete client with associated sales or tickets') {
        return res.status(400).json({
          success: false,
          message: 'No se puede eliminar el cliente porque tiene ventas o boletas asociadas',
          error: 'CLIENT_HAS_ASSOCIATIONS'
        });
      }
      
      res.status(500).json({
        success: false,
        message: 'Error deleting cliente',
        error: error.message
      });
    }
  }
}

module.exports = new ClienteController();
