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
  `,

  /**
   * LISTADO GENERAL DE VENTAS con toda la información
   * Params: $1=rifa_id, $2=fecha_inicio, $3=fecha_fin, $4=limit, $5=offset
   */
  GET_VENTAS_GENERAL: `
    SELECT 
      v.id,
      v.rifa_id,
      v.cliente_id,
      v.monto_total,
      v.abono_total,
      (v.monto_total - v.abono_total) as saldo_pendiente,
      v.estado_venta,
      v.es_venta_online,
      v.es_venta_admin,
      v.notas_admin,
      v.created_at,
      v.updated_at,
      c.nombre as cliente_nombre,
      c.telefono as cliente_telefono,
      c.email as cliente_email,
      c.identificacion as cliente_identificacion,
      c.direccion as cliente_direccion,
      r.nombre as rifa_nombre,
      r.precio_boleta,
      COALESCE(u.nombre, 'Online') as vendedor_nombre,
      CASE 
        WHEN v.es_venta_online = true THEN 'ONLINE'
        ELSE 'PUNTO_FISICO'
      END as origen_venta,
      ARRAY_AGG(b.numero ORDER BY b.numero) as numeros_boletas,
      COUNT(b.id) as cantidad_boletas,
      COALESCE(
        (SELECT SUM(a.monto) FROM abonos a WHERE a.venta_id = v.id AND a.estado = 'CONFIRMADO'), 0
      ) as total_pagado_real,
      CASE
        WHEN v.monto_total > 0 AND v.abono_total >= v.monto_total THEN 'PAGO_TOTAL'
        WHEN v.monto_total > 0 AND v.abono_total > 0 AND v.abono_total < v.monto_total THEN 'ABONO'
        WHEN v.estado_venta = 'PENDIENTE' OR v.estado_venta = 'SIN_REVISAR' THEN 'RESERVA'
        ELSE 'SIN_PAGO'
      END as tipo_transaccion,
      (
        SELECT mp.nombre FROM abonos ab
        LEFT JOIN medios_pago mp ON ab.medio_pago_id = mp.id
        WHERE ab.venta_id = v.id AND ab.estado = 'CONFIRMADO'
        ORDER BY ab.created_at DESC LIMIT 1
      ) as metodo_pago
    FROM ventas v
    JOIN clientes c ON v.cliente_id = c.id
    JOIN rifas r ON v.rifa_id = r.id
    LEFT JOIN boletas b ON v.id = b.venta_id
    LEFT JOIN usuarios u ON v.vendedor_id = u.id
    WHERE v.rifa_id = $1
      AND ($2::timestamptz IS NULL OR v.created_at >= $2::timestamptz)
      AND ($3::timestamptz IS NULL OR v.created_at < ($3::timestamptz + interval '1 day'))
    GROUP BY v.id, c.id, r.id, u.id
    ORDER BY v.created_at DESC
    LIMIT $4 OFFSET $5
  `,

  GET_VENTAS_GENERAL_COUNT: `
    SELECT COUNT(*) as total
    FROM ventas v
    WHERE v.rifa_id = $1
      AND ($2::timestamptz IS NULL OR v.created_at >= $2::timestamptz)
      AND ($3::timestamptz IS NULL OR v.created_at < ($3::timestamptz + interval '1 day'))
  `,

  GET_VENTAS_GENERAL_RESUMEN: `
    SELECT 
      COUNT(*) as total_ventas,
      COUNT(*) FILTER (WHERE v.estado_venta = 'PAGADA') as ventas_pagadas,
      COUNT(*) FILTER (WHERE v.estado_venta = 'ABONADA') as ventas_abonadas,
      COUNT(*) FILTER (WHERE v.estado_venta = 'PENDIENTE') as ventas_pendientes,
      COUNT(*) FILTER (WHERE v.estado_venta = 'SIN_REVISAR') as ventas_sin_revisar,
      COUNT(*) FILTER (WHERE v.estado_venta = 'CANCELADA') as ventas_canceladas,
      COUNT(*) FILTER (WHERE v.es_venta_online = true) as ventas_online,
      COUNT(*) FILTER (WHERE v.es_venta_online = false OR v.es_venta_online IS NULL) as ventas_punto_fisico,
      COALESCE(SUM(v.monto_total), 0) as monto_total,
      COALESCE(SUM(v.abono_total), 0) as total_abonado,
      COALESCE(SUM(v.monto_total - v.abono_total), 0) as saldo_pendiente_total
    FROM ventas v
    WHERE v.rifa_id = $1
      AND ($2::timestamptz IS NULL OR v.created_at >= $2::timestamptz)
      AND ($3::timestamptz IS NULL OR v.created_at < ($3::timestamptz + interval '1 day'))
  `,

  /**
   * Recaudo del día: suma de TODOS los abonos confirmados cuya fecha de abono
   * cae dentro del rango seleccionado, SIN IMPORTAR cuándo se creó la venta.
   * Esto muestra el dinero real que entró en el periodo.
   */
  GET_RECAUDO_DIA: `
    SELECT
      COALESCE(SUM(a.monto), 0) AS recaudo_dia,
      COUNT(*) AS cantidad_abonos
    FROM abonos a
    INNER JOIN ventas v ON v.id = a.venta_id
    WHERE v.rifa_id = $1
      AND a.estado = 'CONFIRMADO'
      AND ($2::timestamptz IS NULL OR a.created_at >= $2::timestamptz)
      AND ($3::timestamptz IS NULL OR a.created_at < ($3::timestamptz + interval '1 day'))
  `,

  /**
   * Listado detallado de abonos del periodo.
   * Trae cada abono con info del cliente, venta, boletas y medio de pago.
   * Params: $1=rifa_id, $2=fecha_inicio, $3=fecha_fin
   */
  GET_ABONOS_DETALLE_PERIODO: `
    SELECT
      a.id AS abono_id,
      a.monto,
      a.estado AS abono_estado,
      a.notas AS abono_notas,
      a.referencia,
      a.created_at AS fecha_abono,
      COALESCE(mp.nombre, a.gateway_pago, 'Sin registro') AS medio_pago,
      v.id AS venta_id,
      v.monto_total,
      v.abono_total,
      (v.monto_total - v.abono_total) AS saldo_pendiente,
      v.estado_venta,
      v.created_at AS fecha_venta,
      v.es_venta_online,
      c.nombre AS cliente_nombre,
      c.telefono AS cliente_telefono,
      c.identificacion AS cliente_identificacion,
      c.email AS cliente_email,
      COALESCE(u.nombre, 'Online') AS vendedor_nombre,
      ARRAY_AGG(DISTINCT b.numero ORDER BY b.numero) AS numeros_boletas,
      COUNT(DISTINCT b.id) AS cantidad_boletas
    FROM abonos a
    INNER JOIN ventas v ON v.id = a.venta_id
    INNER JOIN clientes c ON c.id = v.cliente_id
    LEFT JOIN medios_pago mp ON mp.id = a.medio_pago_id
    LEFT JOIN usuarios u ON u.id = v.vendedor_id
    LEFT JOIN boletas b ON b.venta_id = v.id
    WHERE v.rifa_id = $1
      AND a.estado = 'CONFIRMADO'
      AND ($2::timestamptz IS NULL OR a.created_at >= $2::timestamptz)
      AND ($3::timestamptz IS NULL OR a.created_at < ($3::timestamptz + interval '1 day'))
    GROUP BY a.id, a.monto, a.estado, a.notas, a.referencia, a.created_at,
             mp.nombre, a.gateway_pago,
             v.id, v.monto_total, v.abono_total, v.estado_venta, v.created_at, v.es_venta_online,
             c.nombre, c.telefono, c.identificacion, c.email,
             u.nombre
    ORDER BY a.created_at DESC
  `
};

module.exports = SQL_QUERIES;
