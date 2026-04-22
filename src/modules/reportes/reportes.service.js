const { query } = require('../../db/pool');
const SQL = require('./reportes.sql');

/**
 * Genera el reporte completo de una rifa.
 * Si vendedorId viene definido, los KPIs se restringen a las ventas de ese usuario.
 */
const getReporteRifa = async (rifaId, fechaInicio = null, fechaFin = null, vendedorId = null) => {

  const hayFiltroFecha = !!(fechaInicio && fechaFin);
  const params4 = [rifaId, fechaInicio, fechaFin, vendedorId];

  // 1. Info de la rifa (no depende de fechas ni vendedor)
  const rifa = await query(SQL.GET_RIFA_RESUMEN, [rifaId]);
  if (!rifa.rows.length) {
    throw new Error('Rifa no encontrada');
  }

  // 2. Estado ACTUAL de boletas (snapshot, opcionalmente filtrado por vendedor via $2)
  const boletas = await query(SQL.GET_BOLETAS_RESUMEN, [rifaId, vendedorId]);

  // 3. Boletas del periodo
  const bpRes = await query(SQL.GET_BOLETAS_PERIODO, params4);
  const boletasPeriodo = bpRes.rows[0];

  // 4. Recaudo filtrado por periodo
  const recaudo = await query(SQL.GET_RECAUDO_REAL, params4);

  // 5. Recaudo total histórico (sin filtro de fecha; vendedor en $2)
  const recaudoTotal = await query(SQL.GET_RECAUDO_TOTAL, [rifaId, vendedorId]);

  // 6. Serie diaria filtrada
  const serie = await query(SQL.GET_SERIE_DIARIA, params4);

  // 7. Métodos de pago filtrados
  const metodos = await query(SQL.GET_METODOS_PAGO, params4);

  // 8. Ventas del periodo
  const ventasPeriodo = await query(SQL.GET_VENTAS_PERIODO, params4);

  // 9. Abonado y deuda de boletas ABONADAS - filtrado por periodo y opcionalmente por vendedor
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
      AND ($4::uuid IS NULL OR v.vendedor_id = $4::uuid)
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
      AND (
        $2::uuid IS NULL
        OR b.venta_id IN (SELECT id FROM ventas WHERE vendedor_id = $2::uuid)
      )
  `;
  const abonadoAbonadas = await query(abonadoAbonadasQ, params4);
  const deudaAbonadas = await query(deudaAbonadasQ, [rifaId, vendedorId]);

  const r = rifa.rows[0];
  const rec = recaudo.rows[0];
  const recTotal = recaudoTotal.rows[0];

  const porcentajeCumplimiento =
    r.proyeccion_total > 0
      ? (Number(recTotal.recaudo_total) / Number(r.proyeccion_total)) * 100
      : 0;

  const porcentajePeriodo =
    r.proyeccion_total > 0
      ? (Number(rec.recaudo_real) / Number(r.proyeccion_total)) * 100
      : 0;

  return {
    rifa: r,
    resumen_boletas: boletas.rows[0],
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
    filtro_vendedor: !!vendedorId,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin
  };
};

/**
 * Listado general de ventas con info completa.
 * Si vendedorId viene definido, solo trae ventas de ese vendedor.
 */
const getVentasGeneral = async (
  rifaId,
  fechaInicio = null,
  fechaFin = null,
  page = 1,
  limit = 50,
  vendedorId = null
) => {
  const offset = (page - 1) * limit;
  const params4 = [rifaId, fechaInicio, fechaFin, vendedorId];

  const ventasResult = await query(SQL.GET_VENTAS_GENERAL, [...params4, limit, offset]);
  const countResult = await query(SQL.GET_VENTAS_GENERAL_COUNT, params4);
  const resumenResult = await query(SQL.GET_VENTAS_GENERAL_RESUMEN, params4);
  const recaudoDiaResult = await query(SQL.GET_RECAUDO_DIA, params4);
  const abonosDetalleResult = await query(SQL.GET_ABONOS_DETALLE_PERIODO, params4);

  return {
    ventas: ventasResult.rows.map(v => ({
      ...v,
      monto_total: Number(v.monto_total),
      abono_total: Number(v.abono_total),
      saldo_pendiente: Number(v.saldo_pendiente),
      total_pagado_real: Number(v.total_pagado_real),
      precio_boleta: Number(v.precio_boleta),
      cantidad_boletas: Number(v.cantidad_boletas)
    })),
    abonos_periodo: abonosDetalleResult.rows.map(a => ({
      ...a,
      monto: Number(a.monto),
      monto_total: Number(a.monto_total),
      abono_total: Number(a.abono_total),
      saldo_pendiente: Number(a.saldo_pendiente),
      cantidad_boletas: Number(a.cantidad_boletas)
    })),
    resumen: {
      total_ventas: Number(countResult.rows[0].total),
      ...resumenResult.rows[0],
      monto_total: Number(resumenResult.rows[0].monto_total),
      total_abonado: Number(resumenResult.rows[0].total_abonado),
      saldo_pendiente_total: Number(resumenResult.rows[0].saldo_pendiente_total),
      recaudo_dia: Number(recaudoDiaResult.rows[0].recaudo_dia),
      cantidad_abonos_dia: Number(recaudoDiaResult.rows[0].cantidad_abonos)
    },
    paginacion: {
      page: Number(page),
      limit: Number(limit),
      total: Number(countResult.rows[0].total),
      total_pages: Math.ceil(Number(countResult.rows[0].total) / limit)
    }
  };
};

module.exports = { getReporteRifa, getVentasGeneral };
