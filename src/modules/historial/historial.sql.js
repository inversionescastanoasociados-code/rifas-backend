const LISTAR_BASE = `
  SELECT
    h.id,
    h.entidad,
    h.accion,
    h.boleta_id,
    h.rifa_id,
    h.numero,
    h.cliente_id,
    h.cliente_id_anterior,
    h.venta_id,
    h.abono_id,
    h.usuario_id,
    h.estado_anterior,
    h.estado_nuevo,
    h.monto,
    h.medio_pago_id,
    h.origen,
    h.notas,
    h.metadata,
    h.created_at,
    c.nombre AS cliente_nombre,
    c.identificacion AS cliente_identificacion,
    ca.nombre AS cliente_anterior_nombre,
    ca.identificacion AS cliente_anterior_identificacion,
    u.nombre AS usuario_nombre
  FROM historial_movimientos h
  LEFT JOIN clientes c ON c.id = h.cliente_id
  LEFT JOIN clientes ca ON ca.id = h.cliente_id_anterior
  LEFT JOIN usuarios u ON u.id = h.usuario_id
`;

const POR_BOLETA = `
  ${LISTAR_BASE}
  WHERE h.boleta_id = $1
  ORDER BY h.created_at DESC
  LIMIT $2 OFFSET $3
`;

const POR_CLIENTE = `
  ${LISTAR_BASE}
  WHERE h.cliente_id = $1 OR h.cliente_id_anterior = $1
  ORDER BY h.created_at DESC
  LIMIT $2 OFFSET $3
`;

const POR_VENTA = `
  ${LISTAR_BASE}
  WHERE h.venta_id = $1
  ORDER BY h.created_at DESC
  LIMIT $2 OFFSET $3
`;

const POR_NUMERO = `
  ${LISTAR_BASE}
  WHERE h.rifa_id = $1 AND h.numero = $2
  ORDER BY h.created_at DESC
  LIMIT $3 OFFSET $4
`;

const COUNT_POR_BOLETA = `
  SELECT COUNT(*)::int AS total
  FROM historial_movimientos
  WHERE boleta_id = $1
`;

const COUNT_POR_CLIENTE = `
  SELECT COUNT(*)::int AS total
  FROM historial_movimientos
  WHERE cliente_id = $1 OR cliente_id_anterior = $1
`;

const COUNT_POR_VENTA = `
  SELECT COUNT(*)::int AS total
  FROM historial_movimientos
  WHERE venta_id = $1
`;

const RECIENTES = `
  ${LISTAR_BASE}
  WHERE ($1::varchar IS NULL OR h.entidad = $1)
    AND ($2::varchar IS NULL OR h.accion = $2)
    AND ($3::uuid IS NULL OR h.rifa_id = $3)
  ORDER BY h.created_at DESC
  LIMIT $4 OFFSET $5
`;

const COUNT_RECIENTES = `
  SELECT COUNT(*)::int AS total
  FROM historial_movimientos h
  WHERE ($1::varchar IS NULL OR h.entidad = $1)
    AND ($2::varchar IS NULL OR h.accion = $2)
    AND ($3::uuid IS NULL OR h.rifa_id = $3)
`;

module.exports = {
  POR_BOLETA,
  POR_CLIENTE,
  POR_VENTA,
  POR_NUMERO,
  RECIENTES,
  COUNT_POR_BOLETA,
  COUNT_POR_CLIENTE,
  COUNT_POR_VENTA,
  COUNT_RECIENTES,
};
