const service = require('./admin-usuarios.service');
const logger = require('../../utils/logger');

function handleError(res, error, accion) {
  const status = error.statusCode || 500;
  logger.error(`[admin-usuarios] ${accion}: ${error.message}`);
  return res.status(status).json({ success: false, message: error.message });
}

class AdminUsuariosController {
  async listar(req, res) {
    try {
      const data = await service.listarAdmins();
      res.json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'listar');
    }
  }

  async crear(req, res) {
    try {
      const { email, password, nombre } = req.body;
      const data = await service.crearAdmin({ email, password, nombre });
      res.status(201).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'crear');
    }
  }

  async actualizar(req, res) {
    try {
      const { email, password, nombre, activo } = req.body;
      const data = await service.actualizarAdmin(req.params.id, {
        email,
        password,
        nombre,
        activo,
      });
      res.json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'actualizar');
    }
  }
}

module.exports = new AdminUsuariosController();
