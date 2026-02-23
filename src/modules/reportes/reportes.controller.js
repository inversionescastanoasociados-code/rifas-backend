const service = require('./reportes.service');

const getReporteRifa = async (req, res) => {
  try {
    const { rifaId } = req.params;
    const data = await service.getReporteRifa(rifaId);
    res.json(data);
  } catch (error) {
    console.error('[REPORTES ERROR]', error);
    res.status(500).json({
      message: error.message || 'Error generando reporte'
    });
  }
};

module.exports = { getReporteRifa };
