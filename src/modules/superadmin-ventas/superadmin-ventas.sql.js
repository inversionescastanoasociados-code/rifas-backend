/**
 * Consultas de lectura para el módulo Superadmin de edición de ventas.
 * Las mutaciones viven en el service, dentro de transacciones.
 */
const SQL_QUERIES = {
  // Buscar ventas por número de boleta, cédula/nombre de cliente o id de venta.
  BUSCAR_VENTAS: `
    SELECT DISTINCT
      v.id AS venta_id,
      v.monto_total,
      v.abono_total,
      v.saldo_pendiente,
      v.estado_venta,
      v.created_at,
      c.id AS cliente_id,
      c.nombre AS cliente_nombre,
      c.identificacion AS cliente_identificacion,
      c.telefono AS cliente_telefono,
      r.id AS rifa_id,
      r.nombre AS rifa_nombre,
      r.precio_boleta,
      (SELECT COUNT(*) FROM boletas b2 WHERE b2.venta_id = v.id)::int AS num_boletas
    FROM ventas v
    JOIN clientes c ON c.id = v.cliente_id
    JOIN rifas r ON r.id = v.rifa_id
    LEFT JOIN boletas b ON b.venta_id = v.id
    WHERE
      ($1::text IS NOT NULL AND (
        c.nombre ILIKE '%' || $1 || '%'
        OR c.identificacion ILIKE '%' || $1 || '%'
        OR c.telefono ILIKE '%' || $1 || '%'
      ))
      OR ($2::int IS NOT NULL AND b.numero = $2)
      OR ($3::uuid IS NOT NULL AND v.id = $3)
    ORDER BY v.created_at DESC
    LIMIT 50
  `,

  // Detalle de una venta (cabecera).
  GET_VENTA: `
    SELECT
      v.id AS venta_id,
      v.monto_total,
      v.abono_total,
      v.saldo_pendiente,
      v.estado_venta,
      v.medio_pago_id,
      v.gateway_pago,
      v.referencia_pago,
      v.es_venta_online,
      v.created_at,
      v.updated_at,
      c.id AS cliente_id,
      c.nombre AS cliente_nombre,
      c.identificacion AS cliente_identificacion,
      c.telefono AS cliente_telefono,
      c.email AS cliente_email,
      r.id AS rifa_id,
      r.nombre AS rifa_nombre,
      r.estado AS rifa_estado,
      r.precio_boleta,
      mp.nombre AS medio_pago_nombre
    FROM ventas v
    JOIN clientes c ON c.id = v.cliente_id
    JOIN rifas r ON r.id = v.rifa_id
    LEFT JOIN medios_pago mp ON mp.id = v.medio_pago_id
    WHERE v.id = $1
  `,

  // Boletas de una venta con lo pagado por cada una (abonos confirmados).
  GET_BOLETAS_DE_VENTA: `
    SELECT
      b.id AS boleta_id,
      b.numero,
      b.estado,
      COALESCE((
        SELECT SUM(a.monto) FROM abonos a
        WHERE a.boleta_id = b.id AND a.venta_id = b.venta_id AND a.estado <> 'ANULADO'
      ), 0) AS pagado_boleta
    FROM boletas b
    WHERE b.venta_id = $1
    ORDER BY b.numero
  `,

  // Abonos de una venta (incluye anulados, para trazabilidad).
  GET_ABONOS_DE_VENTA: `
    SELECT
      a.id AS abono_id,
      a.monto,
      a.estado,
      a.gateway_pago,
      a.medio_pago_id,
      a.referencia,
      a.notas,
      a.created_at,
      a.boleta_id,
      b.numero AS boleta_numero,
      mp.nombre AS medio_pago_nombre,
      u.nombre AS registrado_por_nombre
    FROM abonos a
    LEFT JOIN boletas b ON b.id = a.boleta_id
    LEFT JOIN medios_pago mp ON mp.id = a.medio_pago_id
    LEFT JOIN usuarios u ON u.id = a.registrado_por
    WHERE a.venta_id = $1
    ORDER BY a.created_at ASC
  `,

  // Catálogo de medios de pago activos.
  GET_MEDIOS_PAGO: `
    SELECT id, nombre FROM medios_pago WHERE activo = true ORDER BY nombre
  `,
};

module.exports = SQL_QUERIES;
