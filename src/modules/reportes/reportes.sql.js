const SQL_QUERIES = {

  GET_RIFA_RESUMEN: `
    SELECT 
      r.id,
      r.nombre,
      r.total_boletas,
      r.precio_boleta,
      (r.total_boletas * r.precio_boleta) AS proyeccion_total
    FROM rifas r
    WHERE r.id = $1
  `,

  GET_BOLETAS_RESUMEN: `
    SELECT
      COUNT(*) AS total_boletas,
      COUNT(CASE WHEN estado = 'DISPONIBLE' THEN 1 END) AS disponibles,
      COUNT(CASE WHEN estado = 'RESERVADA' THEN 1 END) AS reservadas,
      COUNT(CASE WHEN estado = 'ABONADA' THEN 1 END) AS abonadas,
      COUNT(CASE WHEN estado = 'PAGADA' THEN 1 END) AS pagadas,
      COUNT(CASE WHEN estado = 'ANULADA' THEN 1 END) AS anuladas
    FROM boletas
    WHERE rifa_id = $1
  `,

  GET_RECAUDO_REAL: `
    SELECT 
      COALESCE(SUM(a.monto), 0) AS recaudo_real
    FROM abonos a
    INNER JOIN ventas v ON v.id = a.venta_id
    WHERE v.rifa_id = $1
      AND a.estado = 'CONFIRMADO'
  `,

  GET_SERIE_DIARIA: `
    SELECT 
      DATE(a.created_at) AS fecha,
      SUM(a.monto) AS total
    FROM abonos a
    INNER JOIN ventas v ON v.id = a.venta_id
    WHERE v.rifa_id = $1
      AND a.estado = 'CONFIRMADO'
    GROUP BY DATE(a.created_at)
    ORDER BY fecha ASC
  `,

  GET_METODOS_PAGO: `
    SELECT 
      COALESCE(a.gateway_pago, 'SIN_GATEWAY') AS metodo,
      COUNT(*) AS cantidad,
      SUM(a.monto) AS total
    FROM abonos a
    INNER JOIN ventas v ON v.id = a.venta_id
    WHERE v.rifa_id = $1
      AND a.estado = 'CONFIRMADO'
    GROUP BY a.gateway_pago
    ORDER BY total DESC
  `
};

module.exports = SQL_QUERIES;
