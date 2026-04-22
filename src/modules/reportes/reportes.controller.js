const service = require('./reportes.service');

const getReporteRifa = async (req, res) => {
  try {
    const { rifaId } = req.params;
    const { fechaInicio, fechaFin } = req.query;
    const data = await service.getReporteRifa(
      rifaId,
      fechaInicio || null,
      fechaFin || null,
      null
    );
    res.json(data);
  } catch (error) {
    console.error('[REPORTES ERROR]', error);
    res.status(500).json({
      message: error.message || 'Error generando reporte'
    });
  }
};

const getVentasGeneral = async (req, res) => {
  try {
    const { rifaId } = req.params;
    const { fechaInicio, fechaFin, page = 1, limit = 50 } = req.query;
    const data = await service.getVentasGeneral(
      rifaId,
      fechaInicio || null,
      fechaFin || null,
      Number(page),
      Number(limit),
      null
    );
    res.json({
      success: true,
      ...data
    });
  } catch (error) {
    console.error('[VENTAS GENERAL ERROR]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error obteniendo ventas'
    });
  }
};

/**
 * Reporte limitado a las ventas del usuario autenticado (ADMIN / VENDEDOR / SUPER_ADMIN).
 * Se toma el vendedor desde el JWT, no desde el query param, para evitar manipulación.
 */
const getMisReportesRifa = async (req, res) => {
  try {
    const { rifaId } = req.params;
    const { fechaInicio, fechaFin } = req.query;
    const vendedorId = req.user && req.user.id;
    if (!vendedorId) {
      return res.status(401).json({ message: 'Usuario no identificado' });
    }
    const data = await service.getReporteRifa(
      rifaId,
      fechaInicio || null,
      fechaFin || null,
      vendedorId
    );
    res.json(data);
  } catch (error) {
    console.error('[MIS REPORTES ERROR]', error);
    res.status(500).json({
      message: error.message || 'Error generando reporte personal'
    });
  }
};

const getMisVentasGeneral = async (req, res) => {
  try {
    const { rifaId } = req.params;
    const { fechaInicio, fechaFin, page = 1, limit = 50 } = req.query;
    const vendedorId = req.user && req.user.id;
    if (!vendedorId) {
      return res.status(401).json({ success: false, message: 'Usuario no identificado' });
    }
    const data = await service.getVentasGeneral(
      rifaId,
      fechaInicio || null,
      fechaFin || null,
      Number(page),
      Number(limit),
      vendedorId
    );
    res.json({
      success: true,
      ...data
    });
  } catch (error) {
    console.error('[MIS VENTAS GENERAL ERROR]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error obteniendo ventas personales'
    });
  }
};

module.exports = {
  getReporteRifa,
  getVentasGeneral,
  getMisReportesRifa,
  getMisVentasGeneral
};
