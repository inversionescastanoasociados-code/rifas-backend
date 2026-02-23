const SQL_QUERIES = {
  CREATE_RIFA: `
    INSERT INTO rifas (nombre, descripcion, precio_boleta, total_boletas, fecha_sorteo, estado, creado_por)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *
  `,
  
  GET_ALL_RIFAS: `
    SELECT r.*, u.nombre as creador_nombre
    FROM rifas r
    LEFT JOIN usuarios u ON r.creado_por = u.id
    ORDER BY r.created_at DESC
  `,
  
  GET_ALL_RIFAS_BY_ESTADO: `
    SELECT r.*, u.nombre as creador_nombre
    FROM rifas r
    LEFT JOIN usuarios u ON r.creado_por = u.id
    WHERE r.estado = $1
    ORDER BY r.created_at DESC
  `,
  
  GET_RIFA_BY_ID: `
    SELECT r.*, u.nombre as creador_nombre
    FROM rifas r
    LEFT JOIN usuarios u ON r.creado_por = u.id
    WHERE r.id = $1
  `,
  
  UPDATE_RIFA: `
    UPDATE rifas 
    SET nombre = COALESCE($1, nombre),
        descripcion = COALESCE($2, descripcion),
        precio_boleta = COALESCE($3, precio_boleta),
        -- total_boletas no se puede actualizar si ya hay boletas vendidas
        fecha_sorteo = COALESCE($4, fecha_sorteo),
        estado = COALESCE($5, estado),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $6
    RETURNING *
  `,
  
  DELETE_RIFA: `
    DELETE FROM rifas WHERE id = $1 RETURNING *
  `,
  
  GET_RIFA_STATS: `
    SELECT 
      r.id,
      r.nombre as titulo,
      r.total_boletas,
      r.boletas_vendidas,
      r.boletas_vendidas * r.precio_boleta as recaudado,
      r.total_boletas - r.boletas_vendidas as boletas_disponibles
    FROM rifas r
    WHERE r.id = $1
  `
};

module.exports = SQL_QUERIES;
