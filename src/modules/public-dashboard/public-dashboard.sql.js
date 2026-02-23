const SQL_QUERIES = {
  // LISTAR VENTAS PÚBLICAS
  GET_VENTAS_PUBLICAS: `
    SELECT 
      v.id,
      v.rifa_id,
      v.cliente_id,
      v.monto_total,
      v.abono_total,
      (v.monto_total - v.abono_total) as saldo_pendiente,
      v.estado_venta,
      v.medio_pago_id,
      v.created_at,
      c.nombre as cliente_nombre,
      c.telefono as cliente_telefono,
      c.email as cliente_email,
      c.identificacion as cliente_identificacion,
      r.nombre as rifa_nombre,
      ARRAY_LENGTH(ARRAY_AGG(b.id), 1) as cantidad_boletas
    FROM ventas v
    JOIN clientes c ON v.cliente_id = c.id
    JOIN rifas r ON v.rifa_id = r.id
    LEFT JOIN boletas b ON v.id = b.venta_id
    WHERE v.es_venta_online = true
    GROUP BY v.id, c.id, r.id
    ORDER BY v.created_at DESC
  `,

  GET_VENTAS_PUBLICAS_PENDIENTES: `
    SELECT 
      v.id,
      v.rifa_id,
      v.cliente_id,
      v.monto_total,
      v.abono_total,
      (v.monto_total - v.abono_total) as saldo_pendiente,
      v.estado_venta,
      v.medio_pago_id,
      v.created_at,
      c.nombre as cliente_nombre,
      c.telefono as cliente_telefono,
      c.email as cliente_email,
      c.identificacion as cliente_identificacion,
      r.nombre as rifa_nombre,
      ARRAY_LENGTH(ARRAY_AGG(b.id), 1) as cantidad_boletas
    FROM ventas v
    JOIN clientes c ON v.cliente_id = c.id
    JOIN rifas r ON v.rifa_id = r.id
    LEFT JOIN boletas b ON v.id = b.venta_id
    WHERE v.es_venta_online = true 
      AND (v.estado_venta = 'PENDIENTE' OR v.estado_venta = 'ABONADA')
    GROUP BY v.id, c.id, r.id
    ORDER BY v.created_at DESC
  `,

  GET_VENTA_PUBLICA_DETAILS: `
    SELECT 
      v.id,
      v.rifa_id,
      v.cliente_id,
      v.monto_total,
      v.abono_total,
      (v.monto_total - v.abono_total) as saldo_pendiente,
      v.estado_venta,
      v.medio_pago_id,
      v.created_at,
      v.updated_at,
      c.id as cliente_id,
      c.nombre as cliente_nombre,
      c.telefono as cliente_telefono,
      c.email as cliente_email,
      c.identificacion as cliente_identificacion,
      c.direccion as cliente_direccion,
      r.id as rifa_id,
      r.nombre as rifa_nombre,
      r.precio_boleta,
      mp.nombre as medio_pago_nombre,
      json_agg(
        json_build_object(
          'boleta_id', b.id,
          'numero', b.numero,
          'estado', b.estado
        ) ORDER BY b.numero
      ) as boletas
    FROM ventas v
    JOIN clientes c ON v.cliente_id = c.id
    JOIN rifas r ON v.rifa_id = r.id
    LEFT JOIN boletas b ON v.id = b.venta_id
    LEFT JOIN medios_pago mp ON v.medio_pago_id = mp.id
    WHERE v.id = $1 AND v.es_venta_online = true
    GROUP BY v.id, c.id, r.id, mp.id
  `,

  // OBTENER ABONOS PENDIENTES
  GET_ABONOS_PENDIENTES_BY_VENTA: `
    SELECT 
      a.id,
      a.venta_id,
      a.boleta_id,
      a.monto,
      a.moneda,
      a.estado,
      a.notas,
      a.created_at,
      b.numero as boleta_numero,
      mp.nombre as medio_pago_nombre
    FROM abonos a
    JOIN boletas b ON a.boleta_id = b.id
    LEFT JOIN medios_pago mp ON a.medio_pago_id = mp.id
    WHERE a.venta_id = $1 AND a.estado = 'REGISTRADO'
    ORDER BY a.created_at ASC
  `,

  // CONFIRMAR PAGO (cambiar estado de abono a CONFIRMADO)
  CONFIRM_ABONO: `
    UPDATE abonos
    SET estado = 'CONFIRMADO'
    WHERE id = $1
    RETURNING *
  `,

  // CAMBIAR ESTADO DE VENTA
  UPDATE_VENTA_STATUS: `
    UPDATE ventas
    SET estado_venta = $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
    RETURNING *
  `,

  // CAMBIAR ESTADO DE BOLETA A PAGADA
  UPDATE_BOLETA_TO_PAGADA: `
    UPDATE boletas
    SET estado = 'PAGADA',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `,

  // OBTENER ESTADÍSTICAS DE VENTAS PÚBLICAS
  GET_ESTADISTICAS_VENTAS_PUBLICAS: `
    SELECT 
      COUNT(*) as total_ventas,
      COUNT(CASE WHEN estado_venta = 'PAGADA' THEN 1 END) as ventas_pagadas,
      COUNT(CASE WHEN estado_venta = 'ABONADA' THEN 1 END) as ventas_abonadas,
      COUNT(CASE WHEN estado_venta = 'PENDIENTE' THEN 1 END) as ventas_pendientes,
      COALESCE(SUM(abono_total), 0) as total_abonado,
      COALESCE(SUM(monto_total), 0) as total_venta,
      COALESCE(SUM(monto_total - abono_total), 0) as saldo_pendiente_total
    FROM ventas
    WHERE es_venta_online = true
  `,

  // OBTENER ESTADÍSTICAS POR RIFA PÚBLICA
  GET_ESTADISTICAS_POR_RIFA: `
    SELECT 
      r.id,
      r.nombre as rifa_nombre,
      COUNT(v.id) as total_ventas_publicas,
      COALESCE(SUM(v.abono_total), 0) as total_abonado,
      COALESCE(SUM(v.monto_total), 0) as total_venta,
      COUNT(DISTINCT v.cliente_id) as clientes_unicos
    FROM rifas r
    LEFT JOIN ventas v ON r.id = v.rifa_id AND v.es_venta_online = true
    WHERE r.estado = 'ACTIVA'
    GROUP BY r.id, r.nombre
    ORDER BY total_ventas_publicas DESC
  `,

  // RECHAZAR VENTA (cambiar a CANCELADA y liberar boletas)
  CANCEL_VENTA: `
    UPDATE ventas
    SET estado_venta = 'CANCELADA',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING *
  `
};

module.exports = SQL_QUERIES;
