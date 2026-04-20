const service = require('./vendedores.service');
const logger = require('../../utils/logger');

class VendedoresController {
  async list(req, res) {
    try {
      const { fechaInicio, fechaFin } = req.query;
      const data = await service.getVendedores({ fechaInicio, fechaFin });
      const resumen = await service.getResumenGlobal({ fechaInicio, fechaFin });
      res.json({ success: true, data, resumen });
    } catch (error) {
      logger.error('Error in vendedores.list:', error);
      res.status(500).json({ success: false, message: 'Error obteniendo vendedores', error: error.message });
    }
  }

  async detalle(req, res) {
    try {
      const { id } = req.params;
      const { fechaInicio, fechaFin } = req.query;
      const data = await service.getVendedorDetalle(id, { fechaInicio, fechaFin });
      if (!data) {
        return res.status(404).json({ success: false, message: 'Vendedor no encontrado' });
      }
      res.json({ success: true, ...data });
    } catch (error) {
      logger.error('Error in vendedores.detalle:', error);
      res.status(500).json({ success: false, message: 'Error obteniendo detalle del vendedor', error: error.message });
    }
  }
}

module.exports = new VendedoresController();
