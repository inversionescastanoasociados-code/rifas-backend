const { query } = require('../../db/pool');
const SQL = require('./reportes.sql');

/**
 * Genera el reporte completo de una rifa.
 * Si vendedorId viene definido, los KPIs se restringen a las ventas de ese usuario.
 * Si filtroRol viene definido (ej: 'ADMIN'), agrega todas las ventas de los usuarios con ese rol.
 */
const getReporteRifa = async (rifaId, fechaInicio = null, fechaFin = null, vendedorId = null, filtroRol = null) => {

  const hayFiltroFecha = !!(fechaInicio && fechaFin);
  const params5 = [rifaId, fechaInicio, fechaFin, vendedorId, filtroRol];

  // 1. Info de la rifa (no depende de fechas ni vendedor)
  const rifa = await query(SQL.GET_RIFA_RESUMEN, [rifaId]);
  if (!rifa.rows.length) {
    throw new Error('Rifa no encontrada');
  }

  // 2. Estado ACTUAL de boletas (snapshot, opcionalmente filtrado por vendedor / rol)
  const boletas = await query(SQL.GET_BOLETAS_RESUMEN, [rifaId, vendedorId, filtroRol]);

  // 3. Boletas del periodo
  const bpRes = await query(SQL.GET_BOLETAS_PERIODO, params5);
  const boletasPeriodo = bpRes.rows[0];

  // 4. Recaudo filtrado por periodo
  const recaudo = await query(SQL.GET_RECAUDO_REAL, params5);

  // 5. Recaudo total histórico (sin filtro de fecha; vendedor en $2, filtro_rol en $3)
  const recaudoTotal = await query(SQL.GET_RECAUDO_TOTAL, [rifaId, vendedorId, filtroRol]);

  // 6. Serie diaria filtrada
  const serie = await query(SQL.GET_SERIE_DIARIA, params5);

  // 7. Métodos de pago filtrados
  const metodos = await query(SQL.GET_METODOS_PAGO, params5);

  // 8. Ventas del periodo
  const ventasPeriodo = await query(SQL.GET_VENTAS_PERIODO, params5);

  // 9. Abonado de boletas ABONADAS dentro del periodo: filtra por quien REGISTRÓ el abono.
  //    La deuda (saldo restante) se mantiene atribuida al vendedor de la venta porque es un estado de la boleta.
  const abonadoAbonadasQ = `
    SELECT COALESCE(SUM(a.monto), 0) AS abonado_abonadas
    FROM abonos a
    INNER JOIN boletas b ON b.id = a.boleta_id
    INNER JOIN ventas v ON v.id = a.venta_id
    WHERE v.rifa_id = $1
      AND b.estado = 'ABONADA'
      AND a.estado = 'CONFIRMADO'
      AND ($2::timestamptz IS NULL OR a.created_at >= $2::timestamptz)
      AND ($3::timestamptz IS NULL OR a.created_at < ($3::timestamptz + interval '1 day'))
      AND ($4::uuid IS NULL OR a.registrado_por = $4::uuid)
      AND ($5::text IS NULL OR a.registrado_por IN (SELECT id FROM usuarios WHERE rol::text = ANY(string_to_array($5::text, ','))))
  `;
  const deudaAbonadasQ = `
    SELECT COALESCE(SUM(r.precio_boleta - COALESCE(ab.total_abonado, 0)), 0) AS deuda_abonadas
    FROM boletas b
    INNER JOIN rifas r ON r.id = b.rifa_id
    LEFT JOIN (
      SELECT boleta_id, SUM(monto) AS total_abonado
      FROM abonos
      WHERE estado = 'CONFIRMADO'
      GROUP BY boleta_id
    ) ab ON ab.boleta_id = b.id
    WHERE b.rifa_id = $1
      AND b.estado = 'ABONADA'
      AND (
        ($2::uuid IS NULL AND $3::text IS NULL)
        OR b.venta_id IN (
          SELECT id FROM ventas
          WHERE ($2::uuid IS NULL OR vendedor_id = $2::uuid)
            AND ($3::text IS NULL OR vendedor_id IN (SELECT id FROM usuarios WHERE rol::text = ANY(string_to_array($3::text, ','))))
        )
      )
  `;
  const abonadoAbonadas = await query(abonadoAbonadasQ, params5);
  const deudaAbonadas = await query(deudaAbonadasQ, [rifaId, vendedorId, filtroRol]);

  const r = rifa.rows[0];
  const rec = recaudo.rows[0];
  const recTotal = recaudoTotal.rows[0];

  const porcentajeCumplimiento =
    r.proyeccion_total > 0
      ? (Number(recTotal.recaudo_total) / Number(r.proyeccion_total)) * 100
      : 0;

  const porcentajePeriodo =
    r.proyeccion_total > 0
      ? (Number(rec.recaudo_real) / Number(r.proyeccion_total)) * 100
      : 0;

  return {
    rifa: r,
    resumen_boletas: boletas.rows[0],
    boletas_periodo: {
      vendidas: Number(boletasPeriodo.vendidas_periodo || 0),
      pagadas: Number(boletasPeriodo.pagadas_periodo || 0),
      reservadas: Number(boletasPeriodo.reservadas_periodo || 0),
      abonadas: Number(boletasPeriodo.abonadas_periodo || 0),
      anuladas: Number(boletasPeriodo.anuladas_periodo || 0),
    },
    finanzas: {
      recaudo_real: Number(rec.recaudo_real),
      recaudo_total: Number(recTotal.recaudo_total),
      proyeccion_total: Number(r.proyeccion_total),
      porcentaje_cumplimiento: Number(porcentajeCumplimiento.toFixed(2)),
      porcentaje_periodo: Number(porcentajePeriodo.toFixed(2)),
      abonado_abonadas: Number(abonadoAbonadas.rows[0].abonado_abonadas),
      deuda_abonadas: Number(deudaAbonadas.rows[0].deuda_abonadas)
    },
    ventas_periodo: ventasPeriodo.rows[0],
    serie_diaria: serie.rows,
    metodos_pago: metodos.rows,
    filtro_aplicado: hayFiltroFecha,
    filtro_vendedor: !!vendedorId,
    filtro_rol: filtroRol || null,
    fecha_inicio: fechaInicio,
    fecha_fin: fechaFin
  };
};

/**
 * Listado general de ventas con info completa.
 * Si vendedorId viene definido, solo trae ventas de ese vendedor.
 * Si filtroRol viene definido, solo trae ventas de usuarios con ese rol.
 */
const getVentasGeneral = async (
  rifaId,
  fechaInicio = null,
  fechaFin = null,
  page = 1,
  limit = 50,
  vendedorId = null,
  filtroRol = null
) => {
  const offset = (page - 1) * limit;
  const params5 = [rifaId, fechaInicio, fechaFin, vendedorId, filtroRol];

  const ventasResult = await query(SQL.GET_VENTAS_GENERAL, [...params5, limit, offset]);
  const countResult = await query(SQL.GET_VENTAS_GENERAL_COUNT, params5);
  const resumenResult = await query(SQL.GET_VENTAS_GENERAL_RESUMEN, params5);
  const recaudoDiaResult = await query(SQL.GET_RECAUDO_DIA, params5);
  const abonosDetalleResult = await query(SQL.GET_ABONOS_DETALLE_PERIODO, params5);

  return {
    ventas: ventasResult.rows.map(v => ({
      ...v,
      monto_total: Number(v.monto_total),
      abono_total: Number(v.abono_total),
      saldo_pendiente: Number(v.saldo_pendiente),
      total_pagado_real: Number(v.total_pagado_real),
      precio_boleta: Number(v.precio_boleta),
      cantidad_boletas: Number(v.cantidad_boletas)
    })),
    abonos_periodo: abonosDetalleResult.rows.map(a => ({
      ...a,
      monto: Number(a.monto),
      monto_total: Number(a.monto_total),
      abono_total: Number(a.abono_total),
      saldo_pendiente: Number(a.saldo_pendiente),
      cantidad_boletas: Number(a.cantidad_boletas)
    })),
    resumen: {
      total_ventas: Number(countResult.rows[0].total),
      ...resumenResult.rows[0],
      monto_total: Number(resumenResult.rows[0].monto_total),
      total_abonado: Number(resumenResult.rows[0].total_abonado),
      saldo_pendiente_total: Number(resumenResult.rows[0].saldo_pendiente_total),
      recaudo_dia: Number(recaudoDiaResult.rows[0].recaudo_dia),
      cantidad_abonos_dia: Number(recaudoDiaResult.rows[0].cantidad_abonos)
    },
    paginacion: {
      page: Number(page),
      limit: Number(limit),
      total: Number(countResult.rows[0].total),
      total_pages: Math.ceil(Number(countResult.rows[0].total) / limit)
    }
  };
};

/**
 * Retorna una lista paginada de clientes con sus boletas,
 * abonos, saldos e info de recordatorios.
 * Solo para ADMIN / SUPER_ADMIN.
 *
 * Filtros disponibles:
 *   search         – nombre | teléfono | número de boleta
 *   estado_boleta  – 'todas' | 'RESERVADA' | 'ABONADA' | 'PAGADA'
 *   notificado     – 'todos' | 'si' | 'no'
 *   rifa_id        – uuid (opcional)
 *   page / limit   – paginación
 */
const getSeguimientoClientes = async ({
  page = 1,
  limit = 20,
  search = '',
  estadoBoleta = 'todas',
  notificado = 'todos',
  rifaId = null,
  abonoMin = null,
  abonoMax = null,
} = {}) => {
  const params = [];
  let p = 0;

  // ── condiciones de filtro ───────────────────────────────────────────────
  const whereParts = [`b.estado != 'DISPONIBLE'`];

  // filtro estado boleta
  if (estadoBoleta && estadoBoleta !== 'todas') {
    p++;
    whereParts.push(`b.estado = $${p}::estado_boleta`);
    params.push(estadoBoleta);
  }

  // filtro rango de abono (solo aplica sobre boletas ABONADAS)
  // Se filtra sobre el lateral subquery de abono (ab.total_abonado)
  if (estadoBoleta === 'ABONADA' && abonoMin !== null && Number.isFinite(abonoMin)) {
    p++;
    whereParts.push(`COALESCE(ab_lat.total_abonado,0) >= $${p}`);
    params.push(abonoMin);
  }
  if (estadoBoleta === 'ABONADA' && abonoMax !== null && Number.isFinite(abonoMax)) {
    p++;
    whereParts.push(`COALESCE(ab_lat.total_abonado,0) <= $${p}`);
    params.push(abonoMax);
  }

  // filtro rifa
  if (rifaId) {
    p++;
    whereParts.push(`b.rifa_id = $${p}::uuid`);
    params.push(rifaId);
  }

  // búsqueda: nombre, teléfono o número de boleta
  // Si el término es numérico tratamos de matchear numero de boleta también
  if (search && search.trim()) {
    const term = search.trim();
    p++;
    const pTerm = p;
    params.push(`%${term}%`);

    // intentar parsear como número de boleta
    const numBoleta = parseInt(term, 10);
    if (!isNaN(numBoleta) && numBoleta > 0 && numBoleta < 65536) {
      p++;
      params.push(numBoleta);
      whereParts.push(`(
        c.nombre      ILIKE $${pTerm}
        OR c.telefono ILIKE $${pTerm}
        OR b.numero   = $${p}::smallint
      )`);
    } else {
      whereParts.push(`(
        c.nombre      ILIKE $${pTerm}
        OR c.telefono ILIKE $${pTerm}
      )`);
    }
  }

  const whereClause = whereParts.join(' AND ');

  // ── CTE principal ───────────────────────────────────────────────────────
  const baseCTE = `
    WITH notif_info AS (
      SELECT
        cliente_id,
        COUNT(*)         AS total_notificaciones,
        MAX(created_at)  AS ultima_notificacion
      FROM notificaciones_recordatorio
      GROUP BY cliente_id
    ),
    contacto_info AS (
      SELECT
        cliente_id,
        COUNT(*)         AS total_contactos,
        MAX(created_at)  AS ultimo_contacto
      FROM seguimiento_contactos
      GROUP BY cliente_id
    ),
    whatsapp_info AS (
      SELECT
        cliente_id,
        COUNT(*)         AS total_whatsapp,
        MAX(created_at)  AS ultimo_whatsapp
      FROM seguimiento_whatsapp
      GROUP BY cliente_id
    ),
    boletas_base AS (
      SELECT
        c.id              AS cliente_id,
        c.nombre,
        c.telefono,
        c.email,
        c.identificacion,
        c.created_at      AS cliente_created_at,
        b.id              AS boleta_id,
        b.numero,
        b.estado          AS boleta_estado,
        b.created_at      AS boleta_created_at,
        r.id              AS rifa_id,
        r.nombre          AS rifa_nombre,
        r.precio_boleta,
        COALESCE(ab_lat.total_abonado, 0)                                       AS abono_total,
        GREATEST(r.precio_boleta - COALESCE(ab_lat.total_abonado, 0), 0)        AS saldo_pendiente,
        v.created_at      AS fecha_venta,
        CASE WHEN v.es_venta_online = true THEN true ELSE false END AS es_venta_online,
        COALESCE(u.nombre, NULL)   AS vendedor_nombre,
        COALESCE(ni.total_notificaciones, 0)::int                               AS total_notificaciones,
        ni.ultima_notificacion,
        COALESCE(ci.total_contactos, 0)::int                                    AS total_contactos,
        ci.ultimo_contacto,
        COALESCE(wi.total_whatsapp, 0)::int                                     AS total_whatsapp,
        wi.ultimo_whatsapp
      FROM clientes c
      INNER JOIN boletas b            ON b.cliente_id   = c.id
      INNER JOIN rifas   r            ON r.id           = b.rifa_id
      LEFT  JOIN ventas  v            ON v.id           = b.venta_id
      LEFT  JOIN usuarios u           ON u.id           = v.vendedor_id
      LEFT  JOIN notif_info ni        ON ni.cliente_id  = c.id
      LEFT  JOIN contacto_info ci     ON ci.cliente_id  = c.id
      LEFT  JOIN whatsapp_info wi     ON wi.cliente_id  = c.id
      LEFT  JOIN LATERAL (
        SELECT COALESCE(SUM(a.monto) FILTER (WHERE a.estado = 'CONFIRMADO'), 0) AS total_abonado
        FROM abonos a WHERE a.boleta_id = b.id
      ) ab_lat ON true
      WHERE ${whereClause}
    )
  `;

  // ── condición notificado (se aplica sobre las filas del cliente) ────────
  let notifCond = '';
  if (notificado === 'si')  notifCond = 'AND total_notificaciones > 0';
  if (notificado === 'no')  notifCond = 'AND total_notificaciones = 0';

  // ── contar clientes distintos ───────────────────────────────────────────
  const countSQL = `
    ${baseCTE}
    SELECT COUNT(DISTINCT cliente_id)::int AS total
    FROM boletas_base
    WHERE 1=1 ${notifCond}
  `;
  const countRes = await query(countSQL, params);
  const total = parseInt(countRes.rows[0].total, 10);

  // ── datos paginados ─────────────────────────────────────────────────────
  // Necesitamos los IDs de clientes de la página actual, ordenados por antigüedad
  p++;
  params.push(limit);
  const pLimit = p;
  p++;
  params.push((page - 1) * limit);
  const pOffset = p;

  const dataSQL = `
    ${baseCTE},
    clientes_pagina AS (
      SELECT DISTINCT ON (cliente_id) cliente_id, cliente_created_at
      FROM boletas_base
      WHERE 1=1 ${notifCond}
      ORDER BY cliente_id, cliente_created_at ASC
    ),
    clientes_ids AS (
      SELECT cliente_id
      FROM clientes_pagina
      ORDER BY cliente_created_at ASC
      LIMIT  $${pLimit}
      OFFSET $${pOffset}
    )
    SELECT
      bb.cliente_id,
      bb.nombre,
      bb.telefono,
      bb.email,
      bb.identificacion,
      bb.cliente_created_at,
      bb.total_notificaciones,
      bb.ultima_notificacion,
      bb.total_contactos,
      bb.ultimo_contacto,
      bb.total_whatsapp,
      bb.ultimo_whatsapp,
      JSON_AGG(
        JSON_BUILD_OBJECT(
          'boleta_id',       bb.boleta_id,
          'numero',          bb.numero,
          'estado',          bb.boleta_estado,
          'rifa_id',         bb.rifa_id,
          'rifa_nombre',     bb.rifa_nombre,
          'precio_boleta',   bb.precio_boleta,
          'abono_total',     bb.abono_total,
          'saldo_pendiente', bb.saldo_pendiente,
          'boleta_created_at', bb.boleta_created_at,
          'fecha_venta',       bb.fecha_venta,
          'es_venta_online',   bb.es_venta_online,
          'vendedor_nombre',   bb.vendedor_nombre
        )
        ORDER BY bb.boleta_created_at ASC
      ) AS boletas
    FROM boletas_base bb
    INNER JOIN clientes_ids ci ON ci.cliente_id = bb.cliente_id
    GROUP BY
      bb.cliente_id, bb.nombre, bb.telefono, bb.email,
      bb.identificacion, bb.cliente_created_at,
      bb.total_notificaciones, bb.ultima_notificacion,
      bb.total_contactos, bb.ultimo_contacto,
      bb.total_whatsapp, bb.ultimo_whatsapp
    ORDER BY bb.cliente_created_at ASC
  
  `;

  const dataRes = await query(dataSQL, params);

  return {
    clientes: dataRes.rows,
    paginacion: {
      page:        Number(page),
      limit:       Number(limit),
      total,
      total_pages: Math.ceil(total / limit),
    },
  };
};

const registrarContactoSeguimiento = async ({ clienteId, registradoPor, nota }) => {
  // Verificar que el cliente existe
  const existe = await query('SELECT id FROM clientes WHERE id = $1', [clienteId]);
  if (!existe.rows.length) throw new Error('Cliente no encontrado');

  await query(
    `INSERT INTO seguimiento_contactos (cliente_id, registrado_por, nota)
     VALUES ($1, $2, $3)`,
    [clienteId, registradoPor || null, nota || null]
  );

  // Devolver el resumen actualizado de contactos para ese cliente
  const res = await query(
    `SELECT COUNT(*)::int AS total_contactos, MAX(created_at) AS ultimo_contacto
     FROM seguimiento_contactos WHERE cliente_id = $1`,
    [clienteId]
  );
  return res.rows[0];
};

const registrarWhatsappSeguimiento = async ({ clienteId, registradoPor }) => {
  const existe = await query('SELECT id FROM clientes WHERE id = $1', [clienteId]);
  if (!existe.rows.length) throw new Error('Cliente no encontrado');

  await query(
    `INSERT INTO seguimiento_whatsapp (cliente_id, registrado_por)
     VALUES ($1, $2)`,
    [clienteId, registradoPor || null]
  );

  const res = await query(
    `SELECT COUNT(*)::int AS total_whatsapp, MAX(created_at) AS ultimo_whatsapp
     FROM seguimiento_whatsapp WHERE cliente_id = $1`,
    [clienteId]
  );
  return res.rows[0];
};

module.exports = { getReporteRifa, getVentasGeneral, getSeguimientoClientes, registrarContactoSeguimiento, registrarWhatsappSeguimiento };
