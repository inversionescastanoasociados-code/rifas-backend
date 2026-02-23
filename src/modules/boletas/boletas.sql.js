const SQL_QUERIES = {
  CREATE_BOLETA: `
    INSERT INTO boletas (rifa_id, numero, nombre_comprador, telefono, estado, vendida_por)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `,
  
  GET_BOLETAS_BY_RIFA: `
    SELECT b.*, u.nombre as vendedor_nombre
    FROM boletas b
    LEFT JOIN usuarios u ON b.vendido_por = u.id
    WHERE b.rifa_id = $1
    ORDER BY b.numero
  `,
  
  GET_BOLETAS_BY_RIFA_AND_STATUS: `
    SELECT b.*, u.nombre as vendedor_nombre
    FROM boletas b
    LEFT JOIN usuarios u ON b.vendido_por = u.id
    WHERE b.rifa_id = $1 AND b.estado = $2
    ORDER BY b.numero
  `,
  
  GET_BOLETA_BY_ID: `
    SELECT 
      b.*,
      r.nombre as rifa_nombre,
      u.nombre as vendedor_nombre,
      CASE 
        WHEN (c.id IS NOT NULL OR vc.id IS NOT NULL) THEN 
          json_build_object(
            'id', COALESCE(c.id, vc.id),
            'nombre', COALESCE(c.nombre, vc.nombre),
            'telefono', COALESCE(c.telefono, vc.telefono),
            'email', COALESCE(c.email, vc.email),
            'identificacion', COALESCE(c.identificacion, vc.identificacion)
          )
        ELSE NULL 
      END as cliente_info,
      CASE 
        WHEN b.venta_id IS NOT NULL THEN 
          json_build_object(
            'id', v.id,
            'fecha_venta', v.created_at,
            'total_pagado', v.abono_total,
            'saldo_pendiente', v.saldo_pendiente,
            'metodo_pago', COALESCE(mp.nombre, 'N/A'),
            'estado', v.estado_venta
          )
        ELSE NULL 
      END as venta_info
    FROM boletas b
    LEFT JOIN rifas r ON b.rifa_id = r.id
    LEFT JOIN usuarios u ON b.vendido_por = u.id
    LEFT JOIN clientes c ON b.cliente_id = c.id
    LEFT JOIN ventas v ON b.venta_id = v.id
    LEFT JOIN clientes vc ON v.cliente_id = vc.id
    LEFT JOIN medios_pago mp ON v.medio_pago_id = mp.id
    WHERE b.id = $1
  `,
  
  GET_BOLETA_BY_NUMBER_AND_RIFA: `
    SELECT * FROM boletas 
    WHERE rifa_id = $1 AND numero = $2
  `,
  
  UPDATE_BOLETA: `
    UPDATE boletas 
    SET nombre_comprador = $1, telefono = $2, estado = $3, actualizada_por = $4, fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE id = $5
    RETURNING *
  `,
  
  UPDATE_BOLETA_STATUS: `
    UPDATE boletas 
    SET estado = $1, actualizada_por = $2, fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE id = $3
    RETURNING *
  `,
  
  DELETE_BOLETA: `
    DELETE FROM boletas WHERE id = $1 RETURNING *
  `,
  
  GET_AVAILABLE_BOLETAS: `
    SELECT numero FROM boletas 
    WHERE rifa_id = $1 
      AND estado = 'DISPONIBLE'
      AND (bloqueo_hasta IS NULL OR bloqueo_hasta <= CURRENT_TIMESTAMP)
    ORDER BY numero
  `,
  
  GET_BOLETAS_STATS: `
    SELECT 
      COUNT(*) as total_boletas,
      COUNT(CASE WHEN estado = 'vendida' THEN 1 END) as boletas_vendidas,
      COUNT(CASE WHEN estado = 'disponible' THEN 1 END) as boletas_disponibles,
      COUNT(CASE WHEN estado = 'reservada' THEN 1 END) as boletas_reservadas
    FROM boletas 
    WHERE rifa_id = $1
  `,
  
  GET_BOLETAS_FULL_STATUS: `
    SELECT 
      b.id,
      b.numero,
      b.estado,
      b.cliente_id,
      b.vendido_por,
      b.venta_id,
      b.qr_url,
      b.barcode,
      b.reserva_token,
      b.bloqueo_hasta,
      b.created_at,
      b.updated_at,
      -- Información del cliente si existe
      CASE 
        WHEN b.cliente_id IS NOT NULL THEN 
          json_build_object(
            'id', b.cliente_id,
            'nombre', c.nombre,
            'telefono', c.telefono,
            'email', c.email,
            'identificacion', c.identificacion
          )
        ELSE NULL 
      END as cliente_info,
      -- Información del vendedor si existe
      CASE 
        WHEN b.vendido_por IS NOT NULL THEN 
          json_build_object(
            'id', b.vendido_por,
            'nombre', v.nombre
          )
        ELSE NULL 
      END as vendedor_info,
      -- Indicador de si tiene cliente asociado
      CASE 
        WHEN b.cliente_id IS NOT NULL THEN true
        ELSE false
      END as tiene_cliente,
      -- Indicador del tipo de estado
      CASE 
        WHEN b.estado IN ('PAGADA', 'ABONADA') THEN 'CON_PAGO'
        WHEN b.estado = 'RESERVADA' THEN 'RESERVADA'
        WHEN b.estado = 'DISPONIBLE' THEN 'DISPONIBLE'
        WHEN b.estado = 'TRANSFERIDA' THEN 'TRANSFERIDA'
        WHEN b.estado = 'ANULADA' THEN 'ANULADA'
        ELSE 'SIN_ESTADO'
      END as tipo_estado
    FROM boletas b
    LEFT JOIN clientes c ON b.cliente_id = c.id
    LEFT JOIN usuarios v ON b.vendido_por = v.id
    WHERE b.rifa_id = $1
    ORDER BY b.numero
  `,
  
  BATCH_CREATE_BOLETAS: `
    INSERT INTO boletas (rifa_id, numero, estado)
    SELECT $1, generate_series, 'DISPONIBLE'
    FROM generate_series(1, $2)
    RETURNING *
  `
};

module.exports = SQL_QUERIES;
