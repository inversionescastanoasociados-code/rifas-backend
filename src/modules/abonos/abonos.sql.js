const SQL_QUERIES = {
  CREATE_ABONO: `
    INSERT INTO abonos (venta_id, monto, metodo_abono, estado, referencia, recibido_por)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `,
  
  GET_ALL_ABONOS: `
    SELECT a.*, v.cliente_nombre as cliente_nombre, r.titulo as rifa_titulo, u.nombre as receptor_nombre
    FROM abonos a
    LEFT JOIN ventas v ON a.venta_id = v.id
    LEFT JOIN rifas r ON v.rifa_id = r.id
    LEFT JOIN usuarios u ON a.recibido_por = u.id
    ORDER BY a.fecha_creacion DESC
  `,
  
  GET_ABONOS_BY_VENTA: `
    SELECT a.*, u.nombre as receptor_nombre
    FROM abonos a
    LEFT JOIN usuarios u ON a.recibido_por = u.id
    WHERE a.venta_id = $1
    ORDER BY a.fecha_creacion DESC
  `,
  
  GET_ABONO_BY_ID: `
    SELECT a.*, v.cliente_nombre as cliente_nombre, r.titulo as rifa_titulo, u.nombre as receptor_nombre
    FROM abonos a
    LEFT JOIN ventas v ON a.venta_id = v.id
    LEFT JOIN rifas r ON v.rifa_id = r.id
    LEFT JOIN usuarios u ON a.recibido_por = u.id
    WHERE a.id = $1
  `,
  
  UPDATE_ABONO: `
    UPDATE abonos 
    SET monto = $1, metodo_abono = $2, estado = $3, referencia = $4, 
        actualizado_por = $5, fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE id = $6
    RETURNING *
  `,
  
  UPDATE_ABONO_STATUS: `
    UPDATE abonos 
    SET estado = $1, actualizado_por = $2, fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE id = $3
    RETURNING *
  `,
  
  DELETE_ABONO: `
    DELETE FROM abonos WHERE id = $1 RETURNING *
  `,
  
  GET_ABONOS_STATS: `
    SELECT 
      COUNT(*) as total_abonos,
      COUNT(CASE WHEN estado = 'recibido' THEN 1 END) as abonos_recibidos,
      COUNT(CASE WHEN estado = 'pendiente' THEN 1 END) as abonos_pendientes,
      COUNT(CASE WHEN estado = 'cancelado' THEN 1 END) as abonos_cancelados,
      COALESCE(SUM(CASE WHEN estado = 'recibido' THEN monto END), 0) as total_recibido,
      COALESCE(AVG(CASE WHEN estado = 'recibido' THEN monto END), 0) as promedio_abono
    FROM abonos 
    WHERE DATE(fecha_creacion) = CURRENT_DATE
  `,
  
  GET_ABONOS_STATS_BY_VENTA: `
    SELECT 
      COUNT(*) as total_abonos,
      COALESCE(SUM(CASE WHEN estado = 'recibido' THEN monto END), 0) as total_abonado,
      COALESCE(SUM(monto), 0) as total_intentado,
      v.monto_total as monto_venta,
      v.monto_total - COALESCE(SUM(CASE WHEN estado = 'recibido' THEN monto END), 0) as saldo_pendiente
    FROM abonos a
    LEFT JOIN ventas v ON a.venta_id = v.id
    WHERE a.venta_id = $1
    GROUP BY v.monto_total
  `,
  
  GET_ABONOS_BY_DATE_RANGE: `
    SELECT a.*, v.cliente_nombre as cliente_nombre, r.titulo as rifa_titulo, u.nombre as receptor_nombre
    FROM abonos a
    LEFT JOIN ventas v ON a.venta_id = v.id
    LEFT JOIN rifas r ON v.rifa_id = r.id
    LEFT JOIN usuarios u ON a.recibido_por = u.id
    WHERE a.fecha_creacion BETWEEN $1 AND $2
    ORDER BY a.fecha_creacion DESC
  `,
  
  GET_ABONOS_BY_METODO: `
    SELECT metodo_abono, COUNT(*) as cantidad, COALESCE(SUM(monto), 0) as total
    FROM abonos 
    WHERE estado = 'recibido' AND DATE(fecha_creacion) = CURRENT_DATE
    GROUP BY metodo_abono
    ORDER BY total DESC
  `,
  
  GET_ABONOS_PENDIENTES_BY_VENTA: `
    SELECT 
      v.id as venta_id,
      v.cliente_nombre,
      v.monto_total,
      COALESCE(SUM(CASE WHEN a.estado = 'recibido' THEN a.monto END), 0) as total_abonado,
      v.monto_total - COALESCE(SUM(CASE WHEN a.estado = 'recibido' THEN a.monto END), 0) as saldo_pendiente,
      COUNT(a.id) as total_abonos
    FROM ventas v
    LEFT JOIN abonos a ON v.id = a.venta_id
    WHERE v.estado = 'pendiente' AND v.id = $1
    GROUP BY v.id, v.cliente_nombre, v.monto_total
  `
};

module.exports = SQL_QUERIES;
