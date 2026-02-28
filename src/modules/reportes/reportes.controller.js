const service = require('./reportes.service');

const getReporteRifa = async (req, res) => {
  try {
    const { rifaId } = req.params;
    const { fechaInicio, fechaFin } = req.query;
    const data = await service.getReporteRifa(rifaId, fechaInicio || null, fechaFin || null);
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
      Number(limit)
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

module.exports = { getReporteRifa, getVentasGeneral };
