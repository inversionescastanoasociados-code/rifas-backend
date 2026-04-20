const { query } = require('../../db/pool');

class VendedoresService {
  /**
   * Lista de usuarios con rol VENDEDOR/ADMIN/SUPER_ADMIN con métricas agregadas.
   * Filtros opcionales por rango de fechas (sobre created_at de venta).
   */
  async getVendedores({ fechaInicio, fechaFin }) {
    const params = [];
    const ventaDateConds = [];
    const abonoDateConds = [];
    const boletaDateConds = [];

    if (fechaInicio) {
      params.push(fechaInicio);
      const idx = params.length;
      ventaDateConds.push(`v.created_at >= $${idx}::timestamptz`);
      abonoDateConds.push(`a.created_at >= $${idx}::timestamptz`);
      boletaDateConds.push(`b.updated_at >= $${idx}::timestamptz`);
    }
    if (fechaFin) {
      params.push(fechaFin);
      const idx = params.length;
      ventaDateConds.push(`v.created_at < ($${idx}::timestamptz + INTERVAL '1 day')`);
      abonoDateConds.push(`a.created_at < ($${idx}::timestamptz + INTERVAL '1 day')`);
      boletaDateConds.push(`b.updated_at < ($${idx}::timestamptz + INTERVAL '1 day')`);
    }

    const ventaWhere = ventaDateConds.length ? `AND ${ventaDateConds.join(' AND ')}` : '';
    const abonoWhere = abonoDateConds.length ? `AND ${abonoDateConds.join(' AND ')}` : '';
    const boletaWhere = boletaDateConds.length ? `AND ${boletaDateConds.join(' AND ')}` : '';

    const sql = `
      SELECT
        u.id,
        u.nombre,
        u.email,
        u.rol,
        u.activo,
        u.ultimo_login,
        u.created_at,
        COALESCE(v.total_ventas, 0)        AS total_ventas,
        COALESCE(v.monto_total, 0)         AS monto_total,
        COALESCE(v.abonado_total, 0)       AS abonado_total,
        COALESCE(v.saldo_pendiente, 0)     AS saldo_pendiente,
        COALESCE(v.clientes_unicos, 0)     AS clientes_unicos,
        COALESCE(b.boletas_vendidas, 0)    AS boletas_vendidas,
        COALESCE(b.boletas_pagadas, 0)     AS boletas_pagadas,
        COALESCE(b.boletas_abonadas, 0)    AS boletas_abonadas,
        COALESCE(b.boletas_reservadas, 0)  AS boletas_reservadas,
        COALESCE(a.abonos_registrados, 0)  AS abonos_registrados,
        COALESCE(a.abonos_monto, 0)        AS abonos_monto
      FROM usuarios u
      LEFT JOIN (
        SELECT
          v.vendedor_id,
          COUNT(*)                                                  AS total_ventas,
          SUM(v.monto_total)                                        AS monto_total,
          SUM(v.abono_total)                                        AS abonado_total,
          SUM(GREATEST(v.monto_total - v.abono_total, 0))           AS saldo_pendiente,
          COUNT(DISTINCT v.cliente_id)                              AS clientes_unicos
        FROM ventas v
        WHERE v.vendedor_id IS NOT NULL ${ventaWhere}
        GROUP BY v.vendedor_id
      ) v ON v.vendedor_id = u.id
      LEFT JOIN (
        SELECT
          b.vendido_por,
          COUNT(*)                                                  AS boletas_vendidas,
          COUNT(*) FILTER (WHERE b.estado = 'PAGADA')               AS boletas_pagadas,
          COUNT(*) FILTER (WHERE b.estado = 'ABONADA')              AS boletas_abonadas,
          COUNT(*) FILTER (WHERE b.estado = 'RESERVADA')            AS boletas_reservadas
        FROM boletas b
        WHERE b.vendido_por IS NOT NULL ${boletaWhere}
        GROUP BY b.vendido_por
      ) b ON b.vendido_por = u.id
      LEFT JOIN (
        SELECT
          a.registrado_por,
          COUNT(*)                                                  AS abonos_registrados,
          SUM(a.monto)                                              AS abonos_monto
        FROM abonos a
        WHERE a.registrado_por IS NOT NULL
          AND a.estado = 'CONFIRMADO' ${abonoWhere}
        GROUP BY a.registrado_por
      ) a ON a.registrado_por = u.id
      WHERE u.rol IN ('VENDEDOR', 'ADMIN', 'SUPER_ADMIN')
      ORDER BY COALESCE(v.monto_total, 0) DESC, u.nombre ASC
    `;

    const { rows } = await query(sql, params);
    return rows;
  }

  /**
   * Detalle de un vendedor: resumen + clientes + ventas paginadas.
   */
  async getVendedorDetalle(vendedorId, { fechaInicio, fechaFin }) {
    const params = [vendedorId];
    const ventaConds = [`v.vendedor_id = $1`];
    const abonoConds = [`a.registrado_por = $1`];
    const boletaConds = [`b.vendido_por = $1`];

    if (fechaInicio) {
      params.push(fechaInicio);
      const idx = params.length;
      ventaConds.push(`v.created_at >= $${idx}::timestamptz`);
      abonoConds.push(`a.created_at >= $${idx}::timestamptz`);
      boletaConds.push(`b.updated_at >= $${idx}::timestamptz`);
    }
    if (fechaFin) {
      params.push(fechaFin);
      const idx = params.length;
      ventaConds.push(`v.created_at < ($${idx}::timestamptz + INTERVAL '1 day')`);
      abonoConds.push(`a.created_at < ($${idx}::timestamptz + INTERVAL '1 day')`);
      boletaConds.push(`b.updated_at < ($${idx}::timestamptz + INTERVAL '1 day')`);
    }

    const ventaWhere = ventaConds.join(' AND ');
    const abonoWhere = abonoConds.join(' AND ');
    const boletaWhere = boletaConds.join(' AND ');

    const usuarioRes = await query(
      `SELECT id, nombre, email, rol, telefono, activo, ultimo_login, created_at
         FROM usuarios WHERE id = $1`,
      [vendedorId]
    );
    if (!usuarioRes.rows[0]) {
      return null;
    }

    const resumenRes = await query(
      `
        SELECT
          (SELECT COUNT(*) FROM ventas v WHERE ${ventaWhere})                                         AS total_ventas,
          (SELECT COALESCE(SUM(v.monto_total), 0) FROM ventas v WHERE ${ventaWhere})                  AS monto_total,
          (SELECT COALESCE(SUM(v.abono_total), 0) FROM ventas v WHERE ${ventaWhere})                  AS abonado_total,
          (SELECT COALESCE(SUM(GREATEST(v.monto_total - v.abono_total, 0)), 0)
             FROM ventas v WHERE ${ventaWhere})                                                        AS saldo_pendiente,
          (SELECT COUNT(DISTINCT v.cliente_id) FROM ventas v WHERE ${ventaWhere})                     AS clientes_unicos,
          (SELECT COUNT(*) FROM boletas b WHERE ${boletaWhere})                                        AS boletas_vendidas,
          (SELECT COUNT(*) FROM boletas b WHERE ${boletaWhere} AND b.estado = 'PAGADA')               AS boletas_pagadas,
          (SELECT COUNT(*) FROM boletas b WHERE ${boletaWhere} AND b.estado = 'ABONADA')              AS boletas_abonadas,
          (SELECT COUNT(*) FROM boletas b WHERE ${boletaWhere} AND b.estado = 'RESERVADA')            AS boletas_reservadas,
          (SELECT COUNT(*) FROM abonos a WHERE ${abonoWhere} AND a.estado = 'CONFIRMADO')             AS abonos_registrados,
          (SELECT COALESCE(SUM(a.monto), 0) FROM abonos a WHERE ${abonoWhere} AND a.estado = 'CONFIRMADO') AS abonos_monto
      `,
      params
    );

    const clientesRes = await query(
      `
        SELECT
          c.id,
          c.nombre,
          c.telefono,
          c.email,
          COUNT(v.id)                                              AS total_ventas,
          COALESCE(SUM(v.monto_total), 0)                          AS monto_total,
          COALESCE(SUM(v.abono_total), 0)                          AS abonado_total,
          COALESCE(SUM(GREATEST(v.monto_total - v.abono_total, 0)), 0) AS saldo_pendiente,
          MAX(v.created_at)                                        AS ultima_venta
        FROM ventas v
        JOIN clientes c ON c.id = v.cliente_id
        WHERE ${ventaWhere}
        GROUP BY c.id, c.nombre, c.telefono, c.email
        ORDER BY MAX(v.created_at) DESC
        LIMIT 100
      `,
      params
    );

    const ventasRes = await query(
      `
        SELECT
          v.id,
          v.created_at,
          v.monto_total,
          v.abono_total,
          GREATEST(v.monto_total - v.abono_total, 0) AS saldo_pendiente,
          v.estado_venta,
          c.id     AS cliente_id,
          c.nombre AS cliente_nombre,
          c.telefono AS cliente_telefono,
          r.id     AS rifa_id,
          r.nombre AS rifa_nombre,
          (SELECT COUNT(*) FROM boletas b WHERE b.venta_id = v.id) AS total_boletas
        FROM ventas v
        JOIN clientes c ON c.id = v.cliente_id
        JOIN rifas r    ON r.id = v.rifa_id
        WHERE ${ventaWhere}
        ORDER BY v.created_at DESC
        LIMIT 200
      `,
      params
    );

    return {
      vendedor: usuarioRes.rows[0],
      resumen: resumenRes.rows[0],
      clientes: clientesRes.rows,
      ventas: ventasRes.rows
    };
  }

  /**
   * Resumen global por día (top 30 días dentro del rango).
   */
  async getResumenGlobal({ fechaInicio, fechaFin }) {
    const params = [];
    const conds = [`v.vendedor_id IS NOT NULL`];

    if (fechaInicio) {
      params.push(fechaInicio);
      conds.push(`v.created_at >= $${params.length}::timestamptz`);
    }
    if (fechaFin) {
      params.push(fechaFin);
      conds.push(`v.created_at < ($${params.length}::timestamptz + INTERVAL '1 day')`);
    }

    const sql = `
      SELECT
        COUNT(*)                                              AS total_ventas,
        COALESCE(SUM(v.monto_total), 0)                       AS monto_total,
        COALESCE(SUM(v.abono_total), 0)                       AS abonado_total,
        COALESCE(SUM(GREATEST(v.monto_total - v.abono_total, 0)), 0) AS saldo_pendiente,
        COUNT(DISTINCT v.cliente_id)                          AS clientes_unicos,
        COUNT(DISTINCT v.vendedor_id)                         AS vendedores_activos
      FROM ventas v
      WHERE ${conds.join(' AND ')}
    `;
    const { rows } = await query(sql, params);
    return rows[0];
  }
}

module.exports = new VendedoresService();
