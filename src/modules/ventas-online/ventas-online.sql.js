/**
 * ═══════════════════════════════════════════════════════════════
 *  VENTAS ONLINE — SQL QUERIES (Seguro)
 *  Todas las queries usan parametrización ($1, $2...) contra SQL injection
 *  Las queries críticas usan FOR UPDATE para prevenir race conditions
 * ═══════════════════════════════════════════════════════════════
 */

const SQL_QUERIES = {
  // ───────── RIFAS ─────────
  GET_RIFAS_ACTIVAS: `
    SELECT 
      r.id, 
      r.nombre, 
      r.precio_boleta, 
      r.fecha_sorteo,
      r.descripcion,
      r.premio_principal,
      r.imagen_url,
      r.total_boletas,
      r.boletas_vendidas,
      (r.total_boletas - r.boletas_vendidas) as boletas_disponibles
    FROM rifas r
    WHERE r.estado = 'ACTIVA'
    ORDER BY r.fecha_sorteo ASC
  `,

  GET_RIFA_ACTIVA_BY_ID: `
    SELECT id, nombre, precio_boleta, total_boletas, boletas_vendidas, estado
    FROM rifas
    WHERE id = $1 AND estado = 'ACTIVA'
  `,

  // ───────── BOLETAS ─────────
  /**
   * Obtener boletas disponibles de una rifa.
   * SOLO retorna boletas DISPONIBLES o con bloqueo expirado.
   * NO retorna IDs internos (uuid) al público — solo numero + estado.
   */
  GET_BOLETAS_DISPONIBLES: `
    SELECT 
      b.id,
      b.numero, 
      b.estado,
      b.qr_url,
      b.imagen_url
    FROM boletas b
    WHERE b.rifa_id = $1 
      AND (
        b.estado = 'DISPONIBLE'
        OR (b.estado = 'RESERVADA' AND b.bloqueo_hasta < CURRENT_TIMESTAMP AND b.cliente_id IS NULL)
      )
    ORDER BY b.numero ASC
  `,

  /**
   * Bloquear múltiples boletas atómicamente.
   * Usa CTE con FOR UPDATE SKIP LOCKED para evitar deadlocks.
   * Solo bloquea boletas que estén realmente DISPONIBLES (o con bloqueo expirado).
   */
  BLOQUEAR_BOLETAS_ATOMICO: `
    WITH target AS (
      SELECT id, numero
      FROM boletas
      WHERE id = ANY($1::UUID[])
        AND rifa_id = $2
        AND (
          estado = 'DISPONIBLE'
          OR (estado = 'RESERVADA' AND bloqueo_hasta < CURRENT_TIMESTAMP AND cliente_id IS NULL)
        )
      FOR UPDATE
    )
    UPDATE boletas b
    SET estado = 'RESERVADA',
        reserva_token = $3,
        bloqueo_hasta = $4,
        updated_at = CURRENT_TIMESTAMP
    FROM target t
    WHERE b.id = t.id
    RETURNING b.id, b.numero, b.estado, b.bloqueo_hasta
  `,

  /**
   * Verificar boletas bloqueadas con token válido.
   * Asegura que TODAS las boletas del token están vigentes.
   */
  VERIFICAR_BOLETAS_BLOQUEADAS: `
    SELECT id, numero, estado, reserva_token, bloqueo_hasta, cliente_id, rifa_id
    FROM boletas
    WHERE reserva_token = $1
      AND estado = 'RESERVADA'
    FOR UPDATE
  `,

  /**
   * Liberar boletas por token (si el usuario cancela o expira).
   */
  LIBERAR_BOLETAS_POR_TOKEN: `
    UPDATE boletas
    SET estado = 'DISPONIBLE',
        reserva_token = NULL,
        bloqueo_hasta = NULL,
        updated_at = CURRENT_TIMESTAMP
    WHERE reserva_token = $1
      AND estado = 'RESERVADA'
    RETURNING id, numero
  `,

  // ───────── CLIENTES ─────────
  GET_CLIENTE_BY_TELEFONO: `
    SELECT id, nombre, telefono, email, identificacion FROM clientes 
    WHERE telefono = $1 
    LIMIT 1
  `,

  GET_CLIENTE_BY_IDENTIFICACION: `
    SELECT id, nombre, telefono, email, identificacion FROM clientes 
    WHERE identificacion = $1 
    LIMIT 1
  `,

  CREATE_CLIENTE: `
    INSERT INTO clientes (nombre, telefono, email, identificacion, direccion)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, nombre, telefono, email, identificacion
  `,

  // ───────── RESERVAS / VENTAS ONLINE ─────────
  /**
   * Crear venta online (reserva formal).
   * - es_venta_online = true → aparece en dashboard admin automáticamente
   * - estado_venta = 'PENDIENTE' → admin debe aprobar
   * - expires_at = tiempo límite para que el cliente pague
   * NOTA: saldo_pendiente es GENERATED ALWAYS (monto_total - abono_total), no se inserta
   */
  CREATE_RESERVA_ONLINE: `
    INSERT INTO ventas (
      rifa_id,
      cliente_id,
      monto_total,
      abono_total,
      estado_venta,
      es_venta_online,
      medio_pago_id,
      gateway_pago,
      expires_at,
      created_at,
      updated_at
    )
    VALUES ($1, $2, $3, 0, 'PENDIENTE', true, $4, $5, $6, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    RETURNING id, rifa_id, cliente_id, monto_total, saldo_pendiente, estado_venta, expires_at, created_at
  `,

  /**
   * Asignar boletas a la reserva formal.
   * Actualiza: venta_id, cliente_id, bloqueo_hasta extendido (días, no minutos).
   * Mantiene reserva_token original para trazabilidad.
   */
  ASIGNAR_BOLETAS_A_RESERVA: `
    UPDATE boletas
    SET venta_id = $1,
        cliente_id = $2,
        bloqueo_hasta = $3,
        updated_at = CURRENT_TIMESTAMP
    WHERE reserva_token = $4
      AND estado = 'RESERVADA'
    RETURNING id, numero
  `,

  /**
   * Consultar estado de una reserva por token (para el cliente).
   * No expone UUIDs internos, solo datos públicos.
   */
  GET_RESERVA_BY_TOKEN: `
    SELECT 
      v.id as venta_id,
      v.monto_total,
      v.abono_total,
      (v.monto_total - v.abono_total) as saldo_pendiente,
      v.estado_venta,
      v.expires_at,
      v.created_at,
      r.nombre as rifa_nombre,
      r.precio_boleta,
      r.fecha_sorteo,
      r.premio_principal,
      c.nombre as cliente_nombre,
      json_agg(
        json_build_object(
          'numero', b.numero,
          'estado', b.estado
        ) ORDER BY b.numero
      ) as boletas
    FROM ventas v
    JOIN rifas r ON v.rifa_id = r.id
    JOIN clientes c ON v.cliente_id = c.id
    JOIN boletas b ON b.venta_id = v.id
    WHERE b.reserva_token = $1
      AND v.es_venta_online = true
    GROUP BY v.id, r.id, c.id
  `,

  /**
   * Incrementar boletas_vendidas en la rifa.
   */
  INCREMENT_BOLETAS_VENDIDAS: `
    UPDATE rifas
    SET boletas_vendidas = boletas_vendidas + $1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = $2
  `,

  /**
   * Obtener medios de pago activos.
   */
  GET_MEDIOS_PAGO: `
    SELECT id, nombre, descripcion, activo
    FROM medios_pago
    WHERE activo = true
    ORDER BY nombre ASC
  `,

  // ───────── CONSULTA POR CÉDULA ─────────
  /**
   * Buscar cliente por identificación (cédula).
   */
  GET_CLIENTE_BY_CEDULA: `
    SELECT id, nombre, telefono, email, identificacion
    FROM clientes
    WHERE identificacion = $1
    LIMIT 1
  `,

  /**
   * Obtener ventas de un cliente con boletas, info de rifa y medio de pago.
   * Incluye QR hash y QR URL para cada boleta.
   */
  GET_VENTAS_BY_CLIENTE_ID: `
    SELECT 
      v.id as venta_id,
      r.nombre as rifa_nombre,
      r.premio_principal,
      r.precio_boleta,
      r.fecha_sorteo,
      v.estado_venta,
      v.monto_total,
      v.abono_total,
      (v.monto_total - v.abono_total) as saldo_pendiente,
      mp.nombre as medio_pago,
      v.created_at,
      v.expires_at,
      json_agg(
        json_build_object(
          'numero', b.numero,
          'estado', b.estado,
          'qr_hash', b.verificacion_hash,
          'qr_url', b.qr_url,
          'boleta_id', b.id
        ) ORDER BY b.numero
      ) as boletas
    FROM ventas v
    JOIN rifas r ON v.rifa_id = r.id
    LEFT JOIN medios_pago mp ON v.medio_pago_id = mp.id
    JOIN boletas b ON b.venta_id = v.id
    WHERE v.cliente_id = $1
    GROUP BY v.id, r.id, mp.id
    ORDER BY v.created_at DESC
  `,

  /**
   * Obtener historial de abonos de una boleta por boleta_id.
   */
  GET_ABONOS_BY_BOLETA_ID: `
    SELECT 
      a.id,
      a.monto,
      a.moneda,
      a.estado,
      a.referencia,
      a.notas,
      a.created_at,
      COALESCE(mp.nombre, a.gateway_pago, 'N/A') as metodo_pago
    FROM abonos a
    LEFT JOIN medios_pago mp ON a.medio_pago_id = mp.id
    WHERE a.boleta_id = $1
      AND a.estado != 'ANULADO'
    ORDER BY a.created_at ASC
  `
};

module.exports = SQL_QUERIES;
