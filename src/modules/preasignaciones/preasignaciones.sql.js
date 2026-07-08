module.exports = {
  LISTAR: `
    SELECT
      p.id,
      p.cliente_id,
      p.numero_boleta,
      p.notas,
      p.creado_por,
      uc.nombre AS creado_por_nombre,
      p.ultima_aplicacion_rifa_id,
      r.nombre AS ultima_aplicacion_rifa_nombre,
      p.ultima_aplicacion_venta_id,
      p.ultima_aplicacion_en,
      p.created_at,
      p.updated_at,
      c.nombre AS cliente_nombre,
      c.telefono AS cliente_telefono,
      c.identificacion AS cliente_identificacion,
      c.email AS cliente_email
    FROM boletas_preasignadas p
    JOIN clientes c ON c.id = p.cliente_id
    LEFT JOIN usuarios uc ON uc.id = p.creado_por
    LEFT JOIN rifas r ON r.id = p.ultima_aplicacion_rifa_id
    WHERE (
      $1::text IS NULL
      OR c.nombre ILIKE '%' || $1 || '%'
      OR c.identificacion ILIKE '%' || $1 || '%'
      OR c.telefono ILIKE '%' || $1 || '%'
      OR CAST(p.numero_boleta AS TEXT) ILIKE '%' || $1 || '%'
    )
    ORDER BY p.numero_boleta ASC
  `,

  GET_BY_ID: `
    SELECT id, cliente_id, numero_boleta, notas, creado_por,
           ultima_aplicacion_rifa_id, ultima_aplicacion_venta_id, ultima_aplicacion_en,
           created_at, updated_at
    FROM boletas_preasignadas
    WHERE id = $1
  `,

  GET_BY_NUMERO: `
    SELECT id, cliente_id FROM boletas_preasignadas WHERE numero_boleta = $1
  `,

  CREAR: `
    INSERT INTO boletas_preasignadas (cliente_id, numero_boleta, notas, creado_por)
    VALUES ($1, $2, $3, $4)
    RETURNING id, cliente_id, numero_boleta, notas, creado_por, created_at, updated_at
  `,

  ACTUALIZAR: `
    UPDATE boletas_preasignadas
    SET cliente_id = COALESCE($2, cliente_id),
        numero_boleta = COALESCE($3, numero_boleta),
        notas = COALESCE($4, notas),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
    RETURNING id, cliente_id, numero_boleta, notas, creado_por, created_at, updated_at
  `,

  ELIMINAR: `
    DELETE FROM boletas_preasignadas WHERE id = $1 RETURNING id, numero_boleta
  `,

  CLIENTE_EXISTE: `
    SELECT id, nombre FROM clientes WHERE id = $1
  `,

  // ── Aplicación a una rifa concreta ──
  GET_RIFA_FOR_UPDATE: `
    SELECT id, nombre, precio_boleta, fecha_sorteo, total_boletas, estado
    FROM rifas WHERE id = $1 FOR UPDATE
  `,

  LISTAR_TODAS_PARA_APLICAR: `
    SELECT p.id, p.cliente_id, p.numero_boleta, c.nombre AS cliente_nombre
    FROM boletas_preasignadas p
    JOIN clientes c ON c.id = p.cliente_id
    ORDER BY p.numero_boleta ASC
  `,

  GET_BOLETA_RIFA_FOR_UPDATE: `
    SELECT id, estado FROM boletas WHERE rifa_id = $1 AND numero = $2 FOR UPDATE
  `,

  CREAR_VENTA_RESERVA: `
    INSERT INTO ventas (
      rifa_id, cliente_id, monto_total, estado_venta, notas_admin, vendedor_id, created_at
    ) VALUES ($1, $2, $3, 'PENDIENTE', $4, $5, CURRENT_TIMESTAMP)
    RETURNING id, created_at
  `,

  MARCAR_BOLETA_RESERVADA: `
    UPDATE boletas
    SET estado = 'RESERVADA',
        venta_id = $1,
        cliente_id = $2,
        vendido_por = $3,
        reserva_token = $4,
        bloqueo_hasta = $5,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $6
  `,

  MARCAR_APLICADA: `
    UPDATE boletas_preasignadas
    SET ultima_aplicacion_rifa_id = $2,
        ultima_aplicacion_venta_id = $3,
        ultima_aplicacion_en = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $1
  `,
};
