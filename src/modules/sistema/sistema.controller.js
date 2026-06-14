const { isSistemaPausado } = require('../../utils/pausaSistema');

const getEstadoSistema = async (req, res) => {
  try {
    const pausado = await isSistemaPausado();
    res.json({ success: true, pausado });
  } catch (error) {
    // Fail-open: si algo falla, reportar como no pausado
    res.json({ success: true, pausado: false });
  }
};

module.exports = { getEstadoSistema };
