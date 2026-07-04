const service = require('./superadmin-ventas.service');
const logger = require('../../utils/logger');

function handleError(res, error, accion) {
  const status = error.statusCode || 400;
  logger.error(`[superadmin-ventas] Error en ${accion}: ${error.message}`);
  return res.status(status).json({ success: false, message: error.message });
}

class SuperadminVentasController {
  async buscar(req, res) {
    try {
      const data = await service.buscarVentas(req.query.q);
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'buscar');
    }
  }

  async getDetalle(req, res) {
    try {
      const data = await service.getVentaDetalle(req.params.ventaId);
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'getDetalle');
    }
  }

  async editarAbono(req, res) {
    try {
      const { monto, medio_pago_id } = req.body;
      const data = await service.editarAbono(
        req.params.abonoId,
        { monto, medioPagoId: medio_pago_id },
        req.user.id
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'editarAbono');
    }
  }

  async anularAbono(req, res) {
    try {
      const data = await service.anularAbono(req.params.abonoId, req.user.id, req.body?.motivo);
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'anularAbono');
    }
  }

  async agregarAbono(req, res) {
    try {
      const { monto, medio_pago_id, boleta_id, notas } = req.body;
      const data = await service.agregarAbono(
        req.params.ventaId,
        { monto, medioPagoId: medio_pago_id, boletaId: boleta_id, notas },
        req.user.id
      );
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'agregarAbono');
    }
  }

  async liberarBoleta(req, res) {
    try {
      const data = await service.liberarBoleta(req.params.boletaId, req.user.id, req.body?.motivo);
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'liberarBoleta');
    }
  }

  async agregarBoleta(req, res) {
    try {
      const data = await service.agregarBoleta(req.params.ventaId, req.body.boleta_id, req.user.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'agregarBoleta');
    }
  }

  async quitarBoleta(req, res) {
    try {
      // Quitar una boleta de una venta = liberarla.
      const data = await service.liberarBoleta(req.params.boletaId, req.user.id, req.body?.motivo);
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'quitarBoleta');
    }
  }

  async cambiarMedioPago(req, res) {
    try {
      const data = await service.cambiarMedioPagoVenta(req.params.ventaId, req.body.medio_pago_id, req.user.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'cambiarMedioPago');
    }
  }

  async cambiarEstado(req, res) {
    try {
      const data = await service.cambiarEstadoVenta(req.params.ventaId, req.body.estado, req.user.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'cambiarEstado');
    }
  }

  async reasignarCliente(req, res) {
    try {
      const data = await service.reasignarCliente(req.params.ventaId, req.body.cliente_id, req.user.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'reasignarCliente');
    }
  }

  async eliminarVenta(req, res) {
    try {
      const data = await service.eliminarVenta(req.params.ventaId, req.user.id);
      res.status(200).json({ success: true, data });
    } catch (error) {
      handleError(res, error, 'eliminarVenta');
    }
  }
}

module.exports = new SuperadminVentasController();
