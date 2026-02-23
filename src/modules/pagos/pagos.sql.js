const SQL_QUERIES = {
  CREATE_PAGO: `
    INSERT INTO pagos (venta_id, monto, metodo_pago, estado, referencia, procesado_por)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `,
  
  GET_ALL_PAGOS: `
    SELECT p.*, v.cliente_nombre as cliente_nombre, r.titulo as rifa_titulo, u.nombre as procesador_nombre
    FROM pagos p
    LEFT JOIN ventas v ON p.venta_id = v.id
    LEFT JOIN rifas r ON v.rifa_id = r.id
    LEFT JOIN usuarios u ON p.procesado_por = u.id
    ORDER BY p.fecha_creacion DESC
  `,
  
  GET_PAGOS_BY_VENTA: `
    SELECT p.*, u.nombre as procesador_nombre
    FROM pagos p
    LEFT JOIN usuarios u ON p.procesado_por = u.id
    WHERE p.venta_id = $1
    ORDER BY p.fecha_creacion DESC
  `,
  
  GET_PAGO_BY_ID: `
    SELECT p.*, v.cliente_nombre as cliente_nombre, r.titulo as rifa_titulo, u.nombre as procesador_nombre
    FROM pagos p
    LEFT JOIN ventas v ON p.venta_id = v.id
    LEFT JOIN rifas r ON v.rifa_id = r.id
    LEFT JOIN usuarios u ON p.procesado_por = u.id
    WHERE p.id = $1
  `,
  
  UPDATE_PAGO: `
    UPDATE pagos 
    SET monto = $1, metodo_pago = $2, estado = $3, referencia = $4, 
        actualizado_por = $5, fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE id = $6
    RETURNING *
  `,
  
  UPDATE_PAGO_STATUS: `
    UPDATE pagos 
    SET estado = $1, actualizado_por = $2, fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE id = $3
    RETURNING *
  `,
  
  DELETE_PAGO: `
    DELETE FROM pagos WHERE id = $1 RETURNING *
  `,
  
  GET_PAGOS_STATS: `
    SELECT 
      COUNT(*) as total_pagos,
      COUNT(CASE WHEN estado = 'completado' THEN 1 END) as pagos_completados,
      COUNT(CASE WHEN estado = 'pendiente' THEN 1 END) as pagos_pendientes,
      COUNT(CASE WHEN estado = 'fallido' THEN 1 END) as pagos_fallidos,
      COALESCE(SUM(CASE WHEN estado = 'completado' THEN monto END), 0) as total_recaudado,
      COALESCE(AVG(CASE WHEN estado = 'completado' THEN monto END), 0) as promedio_pago
    FROM pagos 
    WHERE DATE(fecha_creacion) = CURRENT_DATE
  `,
  
  GET_PAGOS_STATS_BY_VENTA: `
    SELECT 
      COUNT(*) as total_pagos,
      COALESCE(SUM(CASE WHEN estado = 'completado' THEN monto END), 0) as total_pagado,
      COALESCE(SUM(monto), 0) as total_intentado,
      v.monto_total as monto_venta,
      v.monto_total - COALESCE(SUM(CASE WHEN estado = 'completado' THEN monto END), 0) as saldo_pendiente
    FROM pagos p
    LEFT JOIN ventas v ON p.venta_id = v.id
    WHERE p.venta_id = $1
    GROUP BY v.monto_total
  `,
  
  GET_PAGOS_BY_DATE_RANGE: `
    SELECT p.*, v.cliente_nombre as cliente_nombre, r.titulo as rifa_titulo, u.nombre as procesador_nombre
    FROM pagos p
    LEFT JOIN ventas v ON p.venta_id = v.id
    LEFT JOIN rifas r ON v.rifa_id = r.id
    LEFT JOIN usuarios u ON p.procesado_por = u.id
    WHERE p.fecha_creacion BETWEEN $1 AND $2
    ORDER BY p.fecha_creacion DESC
  `,
  
  GET_PAGOS_BY_METODO: `
    SELECT metodo_pago, COUNT(*) as cantidad, COALESCE(SUM(monto), 0) as total
    FROM pagos 
    WHERE estado = 'completado' AND DATE(fecha_creacion) = CURRENT_DATE
    GROUP BY metodo_pago
    ORDER BY total DESC
  `
};

module.exports = SQL_QUERIES;
