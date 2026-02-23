const { query } = require('../../db/pool');
const SQL = require('./reportes.sql');

const getReporteRifa = async (rifaId) => {

  const rifa = await query(SQL.GET_RIFA_RESUMEN, [rifaId]);

  if (!rifa.rows.length) {
    throw new Error('Rifa no encontrada');
  }

  const boletas = await query(SQL.GET_BOLETAS_RESUMEN, [rifaId]);
  const recaudo = await query(SQL.GET_RECAUDO_REAL, [rifaId]);
  const serie = await query(SQL.GET_SERIE_DIARIA, [rifaId]);
  const metodos = await query(SQL.GET_METODOS_PAGO, [rifaId]);

  const r = rifa.rows[0];
  const rec = recaudo.rows[0];

  const porcentajeCumplimiento =
    r.proyeccion_total > 0
      ? (rec.recaudo_real / r.proyeccion_total) * 100
      : 0;

  return {
    rifa: r,
    resumen_boletas: boletas.rows[0],
    finanzas: {
      recaudo_real: Number(rec.recaudo_real),
      proyeccion_total: Number(r.proyeccion_total),
      porcentaje_cumplimiento: Number(porcentajeCumplimiento.toFixed(2))
    },
    serie_diaria: serie.rows,
    metodos_pago: metodos.rows
  };
};

module.exports = { getReporteRifa };
