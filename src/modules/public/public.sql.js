const SQL_QUERIES = {
  // RIFAS
  GET_RIFAS_ACTIVAS: `
    SELECT 
      id, 
      nombre, 
      precio_boleta, 
      fecha_sorteo,
      descripcion,
      premio_principal,
      imagen_url,
      total_boletas,
      boletas_vendidas,
      (total_boletas - boletas_vendidas) as boletas_disponibles
    FROM rifas
    WHERE estado = 'ACTIVA'
    ORDER BY fecha_sorteo ASC
  `,

  GET_RIFA_BY_ID: `
    SELECT *
    FROM rifas
    WHERE id = $1 AND estado = 'ACTIVA'
  `,

  // BOLETAS
  GET_BOLETAS_DISPONIBLES_BY_RIFA: `
    SELECT 
      id, 
      numero, 
      estado, 
      bloqueo_hasta
    FROM boletas
    WHERE rifa_id = $1 
      AND estado = 'DISPONIBLE'
    ORDER BY numero ASC
  `,

  GET_BOLETA_BY_ID: `
    SELECT id, numero, estado, rifa_id, bloqueo_hasta
    FROM boletas
    WHERE id = $1
  `,

  BLOQUEAR_BOLETA: `
    UPDATE boletas
    SET estado = 'RESERVADA',
        reserva_token = $1,
        bloqueo_hasta = $2
    WHERE id = $3 AND estado = 'DISPONIBLE'
    RETURNING id, numero, estado, bloqueo_hasta, reserva_token
  `,

  LIBERAR_BOLETA: `
    UPDATE boletas
    SET estado = 'DISPONIBLE',
        reserva_token = NULL,
        bloqueo_hasta = NULL
    WHERE id = $1 AND reserva_token = $2
    RETURNING id, numero, estado
  `,

  // CLIENTES
  GET_CLIENTE_BY_TELEFONO: `
    SELECT id FROM clientes 
    WHERE telefono = $1 
    LIMIT 1
  `,

  GET_CLIENTE_BY_IDENTIFICACION: `
    SELECT id FROM clientes 
    WHERE identificacion = $1 
    LIMIT 1
  `,

  CREATE_CLIENTE: `
    INSERT INTO clientes (nombre, telefono, email, identificacion, direccion)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, nombre, telefono, email, identificacion
  `,

  // VENTAS
  CREATE_VENTA_PUBLICA: `
    INSERT INTO ventas (
      rifa_id,
      cliente_id,
      monto_total,
      abono_total,
      estado_venta,
      es_venta_online,
      medio_pago_id,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, true, $6, CURRENT_TIMESTAMP)
    RETURNING *
  `,

  UPDATE_VENTA_TOTAL_BOLETAS: `
    UPDATE rifas
    SET boletas_vendidas = boletas_vendidas + $1
    WHERE id = $2
  `,

  // ABONOS
  CREATE_ABONO: `
    INSERT INTO abonos (
      venta_id,
      registrado_por,
      boleta_id,
      medio_pago_id,
      monto,
      moneda,
      estado,
      notas,
      created_at
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
    RETURNING *
  `,

  // VERIFICAR STATUS DE BOLETAS
  CHECK_BOLETAS_STATUS: `
    SELECT 
      id,
      numero,
      estado,
      reserva_token,
      bloqueo_hasta
    FROM boletas
    WHERE id = ANY($1::UUID[])
    FOR UPDATE
  `,

  // OBTENER VENTA CON DETALLES COMPLETOS
  GET_VENTA_DETAILS: `
    SELECT 
      v.id,
      v.rifa_id,
      v.cliente_id,
      v.monto_total,
      v.abono_total,
      v.estado_venta,
      v.es_venta_online,
      v.created_at,
      c.nombre as cliente_nombre,
      c.telefono as cliente_telefono,
      c.email as cliente_email,
      c.identificacion as cliente_identificacion,
      r.nombre as rifa_nombre,
      r.precio_boleta,
      array_agg(json_build_object('id', b.id, 'numero', b.numero, 'estado', b.estado)) as boletas
    FROM ventas v
    JOIN clientes c ON v.cliente_id = c.id
    JOIN rifas r ON v.rifa_id = r.id
    LEFT JOIN boletas b ON v.id = b.venta_id
    WHERE v.id = $1
    GROUP BY v.id, c.id, r.id
  `
};

module.exports = SQL_QUERIES;
