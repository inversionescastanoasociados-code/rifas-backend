const verificarService = require('./verificar.service');
const logger = require('../../utils/logger');

class VerificarController {
  /**
   * GET /api/verificar/:hash
   * Endpoint público — sin autenticación.
   * Retorna datos de la boleta para vista de verificación del cliente.
   */
  async verificarBoleta(req, res) {
    try {
      const { hash } = req.params;

      const data = await verificarService.getBoletaByHash(hash);

      if (!data) {
        return res.status(404).json({
          success: false,
          message: 'Boleta no encontrada o código de verificación inválido.',
        });
      }

      return res.json({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('Error en verificarBoleta controller:', error);
      return res.status(500).json({
        success: false,
        message: 'Error al verificar la boleta.',
      });
    }
  }
}

module.exports = new VerificarController();
