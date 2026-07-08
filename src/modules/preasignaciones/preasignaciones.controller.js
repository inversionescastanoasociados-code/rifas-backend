const service = require('./preasignaciones.service');
const logger = require('../../utils/logger');

function handleError(res, error, accion) {
  const status = error.statusCode || 400;
  logger.error(`[preasignaciones] Error en ${accion}: ${error.message}`);
  return res.status(status).json({ success: false, message: error.message });
}

class PreasignacionesController {
  async listar(req, res) {
    try {
      const data = await service.listar(req.query.q);
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'listar');
    }
  }

  async crear(req, res) {
    try {
      const { cliente_id, numero_boleta, notas } = req.body;
      const data = await service.crear({
        clienteId: cliente_id,
        numeroBoleta: numero_boleta,
        notas,
        creadoPor: req.user.id,
      });
      res.status(201).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'crear');
    }
  }

  async actualizar(req, res) {
    try {
      const { cliente_id, numero_boleta, notas } = req.body;
      const data = await service.actualizar(req.params.id, {
        clienteId: cliente_id,
        numeroBoleta: numero_boleta,
        notas,
      });
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'actualizar');
    }
  }

  async eliminar(req, res) {
    try {
      const data = await service.eliminar(req.params.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'eliminar');
    }
  }

  async aplicarARifa(req, res) {
    try {
      const data = await service.aplicarARifa(req.body.rifa_id, req.user.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'aplicarARifa');
    }
  }
}

module.exports = new PreasignacionesController();
