/**
 * SQL Queries para reportes - TODAS filtradas por rango de fechas opcional
 * 
 * Parámetros:
 *   $1 = rifa_id
 *   $2 = fecha_inicio (null si no hay filtro)
 *   $3 = fecha_fin (null si no hay filtro)
 */

const SQL_QUERIES = {

  GET_RIFA_RESUMEN: `
    SELECT 
      r.id,
      r.nombre,
      r.total_boletas,
      r.precio_boleta,
      (r.total_boletas * r.precio_boleta) AS proyeccion_total
    FROM rifas r
    WHERE r.id = $1
  `,

  /* Estado ACTUAL de boletas (sin filtro de fecha) */
  GET_BOLETAS_RESUMEN: `
    SELECT
      COUNT(*) AS total_boletas,
      COUNT(CASE WHEN estado = 'DISPONIBLE' THEN 1 END) AS disponibles,
      COUNT(CASE WHEN estado = 'RESERVADA' THEN 1 END) AS reservadas,
      COUNT(CASE WHEN estado = 'ABONADA' THEN 1 END) AS abonadas,
      COUNT(CASE WHEN estado = 'PAGADA' THEN 1 END) AS pagadas,
      COUNT(CASE WHEN estado = 'ANULADA' THEN 1 END) AS anuladas
    FROM boletas
    WHERE rifa_id = $1
  `,

  /* Boletas vendidas dentro del periodo basado en ventas.created_at */
  GET_BOLETAS_PERIODO: `
    SELECT
      COUNT(*) AS vendidas_periodo,
      COUNT(*) FILTER (WHERE b.estado = 'PAGADA') AS pagadas_periodo,
      COUNT(*) FILTER (WHERE b.estado = 'RESERVADA') AS reservadas_periodo,
      COUNT(*) FILTER (WHERE b.estado = 'ABONADA') AS abonadas_periodo,
      COUNT(*) FILTER (WHERE b.estado = 'ANULADA') AS anuladas_periodo
    FROM boletas b
    INNER JOIN ventas v ON v.id = b.venta_id
    WHERE b.rifa_id = $1
      AND b.estado != 'DISPONIBLE'
      AND ($2::timestamptz IS NULL OR v.created_at >= $2::timestamptz)
      AND ($3::timestamptz IS NULL OR v.created_at < ($3::timestamptz + interval '1 day'))
  `,

  GET_RECAUDO_REAL: `
    SELECT 
      COALESCE(SUM(a.monto), 0) AS recaudo_real
    FROM abonos a
    INNER JOIN ventas v ON v.id = a.venta_id
    WHERE v.rifa_id = $1
      AND a.estado = 'CONFIRMADO'
      AND ($2::timestamptz IS NULL OR a.created_at >= $2::timestamptz)
      AND ($3::timestamptz IS NULL OR a.created_at < ($3::timestamptz + interval '1 day'))
  `,

  /* Recaudo total histórico (sin filtro de fecha) */
  GET_RECAUDO_TOTAL: `
    SELECT 
      COALESCE(SUM(a.monto), 0) AS recaudo_total
    FROM abonos a
    INNER JOIN ventas v ON v.id = a.venta_id
    WHERE v.rifa_id = $1
      AND a.estado = 'CONFIRMADO'
  `,

  GET_SERIE_DIARIA: `
    SELECT 
      DATE(a.created_at) AS fecha,
      SUM(a.monto) AS total
    FROM abonos a
    INNER JOIN ventas v ON v.id = a.venta_id
    WHERE v.rifa_id = $1
      AND a.estado = 'CONFIRMADO'
      AND ($2::timestamptz IS NULL OR a.created_at >= $2::timestamptz)
      AND ($3::timestamptz IS NULL OR a.created_at < ($3::timestamptz + interval '1 day'))
    GROUP BY DATE(a.created_at)
    ORDER BY fecha ASC
  `,

  GET_METODOS_PAGO: `
    SELECT 
      COALESCE(a.gateway_pago, 'SIN_GATEWAY') AS metodo,
      COUNT(*) AS cantidad,
      SUM(a.monto) AS total
    FROM abonos a
    INNER JOIN ventas v ON v.id = a.venta_id
    WHERE v.rifa_id = $1
      AND a.estado = 'CONFIRMADO'
      AND ($2::timestamptz IS NULL OR a.created_at >= $2::timestamptz)
      AND ($3::timestamptz IS NULL OR a.created_at < ($3::timestamptz + interval '1 day'))
    GROUP BY a.gateway_pago
    ORDER BY total DESC
  `,

  GET_VENTAS_PERIODO: `
    SELECT 
      COUNT(*) AS total_ventas,
      COUNT(*) FILTER (WHERE v.estado_venta = 'PAGADA') AS ventas_pagadas,
      COUNT(*) FILTER (WHERE v.estado_venta = 'ABONADA') AS ventas_abonadas,
      COUNT(*) FILTER (WHERE v.estado_venta = 'PENDIENTE') AS ventas_pendientes
    FROM ventas v
    WHERE v.rifa_id = $1
      AND ($2::timestamptz IS NULL OR v.created_at >= $2::timestamptz)
      AND ($3::timestamptz IS NULL OR v.created_at < ($3::timestamptz + interval '1 day'))
  `
};

module.exports = SQL_QUERIES;
