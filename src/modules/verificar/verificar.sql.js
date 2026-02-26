const SQL_QUERIES = {
  /**
   * Obtener boleta por hash HMAC (buscamos en campo verificacion_hash)
   */
  GET_BOLETA_BY_HASH: `
    SELECT 
      b.id,
      b.numero,
      b.estado,
      b.barcode,
      b.created_at,
      b.updated_at,
      -- Rifa info
      r.id as rifa_id,
      r.nombre as rifa_nombre,
      r.descripcion as rifa_descripcion,
      r.precio_boleta,
      r.fecha_sorteo,
      r.premio_principal,
      r.total_boletas,
      r.imagen_url as rifa_imagen_url,
      r.terminos_condiciones,
      r.estado as rifa_estado,
      -- Cliente info
      CASE 
        WHEN COALESCE(c.id, vc.id) IS NOT NULL THEN 
          json_build_object(
            'nombre', COALESCE(c.nombre, vc.nombre),
            'identificacion', COALESCE(c.identificacion, vc.identificacion),
            'telefono', COALESCE(c.telefono, vc.telefono),
            'email', COALESCE(c.email, vc.email)
          )
        ELSE NULL 
      END as cliente_info,
      -- Venta info
      CASE 
        WHEN b.venta_id IS NOT NULL THEN 
          json_build_object(
            'monto_total', v.monto_total,
            'abono_total', v.abono_total,
            'saldo_pendiente', v.saldo_pendiente,
            'estado', v.estado_venta,
            'fecha_venta', v.created_at,
            'metodo_pago', COALESCE(mp.nombre, 'N/A')
          )
        ELSE NULL 
      END as venta_info
    FROM boletas b
    JOIN rifas r ON b.rifa_id = r.id
    LEFT JOIN clientes c ON b.cliente_id = c.id
    LEFT JOIN ventas v ON b.venta_id = v.id
    LEFT JOIN clientes vc ON v.cliente_id = vc.id
    LEFT JOIN medios_pago mp ON v.medio_pago_id = mp.id
    WHERE b.verificacion_hash = $1
  `,

  /**
   * Obtener historial de abonos de una boleta (via venta_id)
   */
  GET_ABONOS_BY_BOLETA: `
    SELECT 
      a.id,
      a.monto,
      a.moneda,
      a.estado,
      a.referencia,
      a.notas,
      a.created_at,
      mp.nombre as metodo_pago
    FROM abonos a
    LEFT JOIN medios_pago mp ON a.medio_pago_id = mp.id
    WHERE a.venta_id = $1
      AND a.estado != 'ANULADO'
    ORDER BY a.created_at DESC
  `,
};

module.exports = SQL_QUERIES;
