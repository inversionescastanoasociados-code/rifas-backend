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

/**
 * Obtener listado general de ventas con toda la información
 * Incluye: origen (online/punto_fisico), comprador, boletas, tipo transacción
 */
const getVentasGeneral = async (rifaId, fechaInicio = null, fechaFin = null, page = 1, limit = 50) => {
  const offset = (page - 1) * limit;
  const params3 = [rifaId, fechaInicio, fechaFin];

  // Obtener ventas paginadas
  const ventasResult = await query(SQL.GET_VENTAS_GENERAL, [...params3, limit, offset]);

  // Obtener total para paginación
  const countResult = await query(SQL.GET_VENTAS_GENERAL_COUNT, params3);

  // Obtener resumen general
  const resumenResult = await query(SQL.GET_VENTAS_GENERAL_RESUMEN, params3);

  // Recaudo del día: abonos confirmados en el periodo (sin importar fecha de venta)
  const recaudoDiaResult = await query(SQL.GET_RECAUDO_DIA, params3);

  // Detalle de abonos del periodo (para tabla de recaudos)
  const abonosDetalleResult = await query(SQL.GET_ABONOS_DETALLE_PERIODO, params3);

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
