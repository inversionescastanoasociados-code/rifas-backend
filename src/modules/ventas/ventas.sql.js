const SQL_QUERIES = {
  CREATE_VENTA: `
    INSERT INTO ventas (rifa_id, cliente_nombre, cliente_telefono, total_boletas, monto_total, estado, vendida_por)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `,
  
  GET_ALL_VENTAS: `
    SELECT v.*, r.titulo as rifa_titulo, u.nombre as vendedor_nombre
    FROM ventas v
    LEFT JOIN rifas r ON v.rifa_id = r.id
    LEFT JOIN usuarios u ON v.vendida_por = u.id
    ORDER BY v.fecha_creacion DESC
  `,
  
  GET_VENTAS_BY_RIFA: `
    SELECT v.*, u.nombre as vendedor_nombre
    FROM ventas v
    LEFT JOIN usuarios u ON v.vendida_por = u.id
    WHERE v.rifa_id = $1
    ORDER BY v.fecha_creacion DESC
  `,
  
  GET_VENTAS_BY_VENDEDOR: `
    SELECT v.*, r.titulo as rifa_titulo
    FROM ventas v
    LEFT JOIN rifas r ON v.rifa_id = r.id
    WHERE v.vendida_por = $1
    ORDER BY v.fecha_creacion DESC
  `,
  
  GET_VENTA_BY_ID: `
    SELECT v.*, r.titulo as rifa_titulo, u.nombre as vendedor_nombre
    FROM ventas v
    LEFT JOIN rifas r ON v.rifa_id = r.id
    LEFT JOIN usuarios u ON v.vendida_por = u.id
    WHERE v.id = $1
  `,
  
  UPDATE_VENTA: `
    UPDATE ventas 
    SET cliente_nombre = $1, cliente_telefono = $2, total_boletas = $3, 
        monto_total = $4, estado = $5, actualizada_por = $6, fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE id = $7
    RETURNING *
  `,
  
  UPDATE_VENTA_STATUS: `
    UPDATE ventas 
    SET estado = $1, actualizada_por = $2, fecha_actualizacion = CURRENT_TIMESTAMP
    WHERE id = $3
    RETURNING *
  `,
  
  DELETE_VENTA: `
    DELETE FROM ventas WHERE id = $1 RETURNING *
  `,
  
  GET_VENTAS_STATS: `
    SELECT 
      COUNT(*) as total_ventas,
      COUNT(CASE WHEN estado = 'completada' THEN 1 END) as ventas_completadas,
      COUNT(CASE WHEN estado = 'pendiente' THEN 1 END) as ventas_pendientes,
      COUNT(CASE WHEN estado = 'cancelada' THEN 1 END) as ventas_canceladas,
      COALESCE(SUM(CASE WHEN estado = 'completada' THEN monto_total END), 0) as total_recaudado,
      COALESCE(AVG(CASE WHEN estado = 'completada' THEN monto_total END), 0) as promedio_venta
    FROM ventas 
    WHERE rifa_id = $1
  `,
  
  GET_VENTAS_STATS_BY_VENDEDOR: `
    SELECT 
      COUNT(*) as total_ventas,
      COUNT(CASE WHEN estado = 'completada' THEN 1 END) as ventas_completadas,
      COALESCE(SUM(CASE WHEN estado = 'completada' THEN monto_total END), 0) as total_recaudado,
      COALESCE(AVG(CASE WHEN estado = 'completada' THEN monto_total END), 0) as promedio_venta
    FROM ventas 
    WHERE vendida_por = $1 AND DATE(fecha_creacion) = CURRENT_DATE
  `,
  
  GET_VENTAS_BY_DATE_RANGE: `
    SELECT v.*, r.titulo as rifa_titulo, u.nombre as vendedor_nombre
    FROM ventas v
    LEFT JOIN rifas r ON v.rifa_id = r.id
    LEFT JOIN usuarios u ON v.vendida_por = u.id
    WHERE v.fecha_creacion BETWEEN $1 AND $2
    ORDER BY v.fecha_creacion DESC
  `
};

module.exports = SQL_QUERIES;
