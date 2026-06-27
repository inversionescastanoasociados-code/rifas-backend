const service = require('./historial.service');

async function getRecientes(req, res, next) {
  try {
    const data = await service.getRecientes(req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getByBoleta(req, res, next) {
  try {
    const data = await service.getByBoletaId(req.params.boletaId, req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getByCliente(req, res, next) {
  try {
    const data = await service.getByClienteId(req.params.clienteId, req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getByVenta(req, res, next) {
  try {
    const data = await service.getByVentaId(req.params.ventaId, req.query);
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function getByNumero(req, res, next) {
  try {
    const data = await service.getByRifaNumero(
      req.params.rifaId,
      req.params.numero,
      req.query
    );
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getRecientes,
  getByBoleta,
  getByCliente,
  getByVenta,
  getByNumero,
};
