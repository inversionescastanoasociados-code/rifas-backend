const { query } = require('../../db/pool');
const SQL = require('./reportes.sql');

const getReporteRifa = async (rifaId, fechaInicio = null, fechaFin = null) => {

  const hayFiltroFecha = !!(fechaInicio && fechaFin);
  const params3 = [rifaId, fechaInicio, fechaFin];

  // 1. Info de la rifa (no depende de fechas)
  const rifa = await query(SQL.GET_RIFA_RESUMEN, [rifaId]);
  if (!rifa.rows.length) {
    throw new Error('Rifa no encontrada');
  }

  // 2. Estado ACTUAL de boletas (siempre sin filtro de fecha - snapshot actual)
  const boletas = await query(SQL.GET_BOLETAS_RESUMEN, [rifaId]);

  // 3. Boletas del periodo (siempre se ejecuta; sin filtro = todo)
  const bpRes = await query(SQL.GET_BOLETAS_PERIODO, params3);
  const boletasPeriodo = bpRes.rows[0];

  // 4. Recaudo filtrado por periodo
  const recaudo = await query(SQL.GET_RECAUDO_REAL, params3);

  // 5. Recaudo total histórico (sin filtro)
  const recaudoTotal = await query(SQL.GET_RECAUDO_TOTAL, [rifaId]);

  // 6. Serie diaria filtrada
  const serie = await query(SQL.GET_SERIE_DIARIA, params3);

  // 7. Métodos de pago filtrados
  const metodos = await query(SQL.GET_METODOS_PAGO, params3);

  // 8. Ventas del periodo
  const ventasPeriodo = await query(SQL.GET_VENTAS_PERIODO, params3);

  // 9. Abonado y deuda de boletas ABONADAS - filtrado por periodo
  const abonadoAbonadasQ = `
    SELECT COALESCE(SUM(a.monto), 0) AS abonado_abonadas
    FROM abonos a
    INNER JOIN boletas b ON b.id = a.boleta_id
    INNER JOIN ventas v ON v.id = a.venta_id
    WHERE v.rifa_id = $1
      AND b.estado = 'ABONADA'
      AND a.estado = 'CONFIRMADO'
      AND ($2::timestamptz IS NULL OR a.created_at >= $2::timestamptz)
      AND ($3::timestamptz IS NULL OR a.created_at < ($3::timestamptz + interval '1 day'))
  `;
  const deudaAbonadasQ = `
    SELECT COALESCE(SUM(r.precio_boleta - COALESCE(ab.total_abonado, 0)), 0) AS deuda_abonadas
    FROM boletas b
    INNER JOIN rifas r ON r.id = b.rifa_id
    LEFT JOIN (
      SELECT boleta_id, SUM(monto) AS total_abonado
      FROM abonos
      WHERE estado = 'CONFIRMADO'
      GROUP BY boleta_id
    ) ab ON ab.boleta_id = b.id
    WHERE b.rifa_id = $1
      AND b.estado = 'ABONADA'
  `;
  const abonadoAbonadas = await query(abonadoAbonadasQ, params3);
  const deudaAbonadas = await query(deudaAbonadasQ, [rifaId]);

  const r = rifa.rows[0];
  const rec = recaudo.rows[0];
  const recTotal = recaudoTotal.rows[0];

  const porcentajeCumplimiento =
    r.proyeccion_total > 0
      ? (Number(recTotal.recaudo_total) / Number(r.proyeccion_total)) * 100
      : 0;

  // Porcentaje de cumplimiento del periodo (recaudo periodo vs proyección)
  const porcentajePeriodo =
    r.proyeccion_total > 0
      ? (Number(rec.recaudo_real) / Number(r.proyeccion_total)) * 100
      : 0;

  return {
    rifa: r,
    resumen_boletas: boletas.rows[0],
    // Boletas del periodo
    boletas_periodo: {
      vendidas: Number(boletasPeriodo.vendidas_periodo || 0),
      pagadas: Number(boletasPeriodo.pagadas_periodo || 0),
      reservadas: Number(boletasPeriodo.reservadas_periodo || 0),
      abonadas: Number(boletasPeriodo.abonadas_periodo || 0),
      anuladas: Number(boletasPeriodo.anuladas_periodo || 0),
    },
    finanzas: {
      recaudo_real: Number(rec.recaudo_real),
      recaudo_total: Number(recTotal.recaudo_total),
      proyeccion_total: Number(r.proyeccion_total),
      porcentaje_cumplimiento: Number(porcentajeCumplimiento.toFixed(2)),
      porcentaje_periodo: Number(porcentajePeriodo.toFixed(2)),
      abonado_abonadas: Number(abonadoAbonadas.rows[0].abonado_abonadas),
      deuda_abonadas: Number(deudaAbonadas.rows[0].deuda_abonadas)
    },
    ventas_periodo: ventasPeriodo.rows[0],
    serie_diaria: serie.rows,
    metodos_pago: metodos.rows,
    filtro_aplicado: hayFiltroFecha,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin
  };
};

module.exports = { getReporteRifa };
