const { query } = require('../../db/pool');
const logger = require('../../utils/logger');

class RecordatorioService {
  /**
   * Ensure the notificaciones_recordatorio table exists
   */
  async ensureTable() {
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS notificaciones_recordatorio (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          cliente_id UUID NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
          notificado_por UUID REFERENCES usuarios(id),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_notif_recordatorio_cliente 
        ON notificaciones_recordatorio(cliente_id)
      `);
      logger.info('Table notificaciones_recordatorio ensured');
    } catch (error) {
      logger.error('Error ensuring notificaciones_recordatorio table:', error);
      throw error;
    }
  }

  /**
   * Get all clients with pending boletas (RESERVADA or ABONADA) for reminders.
   * Ordered by oldest created_at first (oldest clients first).
   * Includes notification tracking info.
   */
  async getClientesParaRecordatorio({ page = 1, limit = 20, search, filtro = 'todos', notificado = 'todos', vendedor }) {
    try {
      const params = [];
      let paramCount = 0;
      const conditions = [];

      // Base: only clients with RESERVADA or ABONADA boletas
      if (filtro === 'reservadas') {
        conditions.push(`bs.reservadas > 0`);
      } else if (filtro === 'abonadas') {
        conditions.push(`bs.abonadas > 0`);
      } else if (filtro === 'crucero') {
        // 'crucero' - clients with at least one pending boleta with abono < 90000
        // (includes RESERVADA boletas which have abono = 0)
        conditions.push(`bs.crucero_boletas > 0`);
      } else {
        // 'todos' - clients with any pending boletas
        conditions.push(`(bs.reservadas > 0 OR bs.abonadas > 0)`);
      }

      // Search
      let searchCondition = '';
      if (search) {
        paramCount++;
        searchCondition = `
          AND (c.nombre ILIKE $${paramCount}
            OR c.email ILIKE $${paramCount}
            OR c.telefono ILIKE $${paramCount}
            OR c.identificacion ILIKE $${paramCount})
        `;
        params.push(`%${search}%`);
      }

      // Vendedor filter
      let vendedorCondition = '';
      if (vendedor) {
        paramCount++;
        vendedorCondition = `AND b.vendido_por = $${paramCount}`;
        params.push(vendedor);
      }

      // Build the main query with a CTE for boleta stats and notification info
      const mainQuery = `
        WITH boleta_stats AS (
          SELECT 
            b.cliente_id,
            COUNT(*) FILTER (WHERE b.estado = 'RESERVADA') AS reservadas,
            COUNT(*) FILTER (
              WHERE b.estado = 'ABONADA'
                AND COALESCE(ab.total_abonado, 0) > 0
                AND COALESCE(ab.total_abonado, 0) < 90000
            ) AS abonadas,
            COUNT(*) FILTER (WHERE b.estado = 'PAGADA') AS pagadas,
            COUNT(*) AS total_boletas,
            COUNT(*) FILTER (
              WHERE b.estado IN ('RESERVADA','ABONADA')
                AND COALESCE(ab.total_abonado, 0) < 90000
            ) AS crucero_boletas,
            COALESCE(SUM(
              CASE WHEN b.estado IN ('RESERVADA','ABONADA') THEN
                GREATEST(
                  r.precio_boleta - COALESCE(ab.total_abonado, 0),
                  0
                )
              ELSE 0 END
            ), 0) AS deuda_total
          FROM boletas b
          JOIN rifas r ON b.rifa_id = r.id
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(a.monto) FILTER (WHERE a.estado = 'CONFIRMADO'), 0) AS total_abonado
            FROM abonos a WHERE a.boleta_id = b.id
          ) ab ON true
          WHERE 1=1 ${vendedorCondition}
          GROUP BY b.cliente_id
        ),
        vendedor_info AS (
          SELECT DISTINCT ON (b.cliente_id)
            b.cliente_id,
            u.id AS vendedor_id,
            u.nombre AS vendedor_nombre
          FROM boletas b
          JOIN usuarios u ON b.vendido_por = u.id
          WHERE b.estado IN ('RESERVADA', 'ABONADA')
          ${vendedorCondition}
          ORDER BY b.cliente_id, b.created_at DESC
        ),
        notif_info AS (
          SELECT 
            cliente_id,
            COUNT(*) AS total_notificaciones,
            MAX(created_at) AS ultima_notificacion
          FROM notificaciones_recordatorio
          GROUP BY cliente_id
        )
        SELECT 
          c.id, c.nombre, c.telefono, c.email, c.identificacion, c.direccion, c.created_at, c.updated_at,
          COALESCE(bs.total_boletas, 0)::int AS total_boletas,
          COALESCE(bs.pagadas, 0)::int AS boletas_pagadas,
          COALESCE(bs.reservadas, 0)::int AS boletas_reservadas,
          COALESCE(bs.abonadas, 0)::int AS boletas_abonadas,
          COALESCE(bs.crucero_boletas, 0)::int AS boletas_crucero,
          COALESCE(bs.deuda_total, 0)::numeric AS deuda_total,
          COALESCE(ni.total_notificaciones, 0)::int AS total_notificaciones,
          ni.ultima_notificacion,
          vi.vendedor_id,
          vi.vendedor_nombre
        FROM clientes c
        INNER JOIN boleta_stats bs ON bs.cliente_id = c.id
        LEFT JOIN vendedor_info vi ON vi.cliente_id = c.id
        LEFT JOIN notif_info ni ON ni.cliente_id = c.id
        WHERE ${conditions.join(' AND ')}
        ${searchCondition}
        ${notificado === 'si' ? 'AND ni.total_notificaciones > 0' : ''}
        ${notificado === 'no' ? 'AND (ni.total_notificaciones IS NULL OR ni.total_notificaciones = 0)' : ''}
      `;

      // Count query
      const countQuery = `
        SELECT COUNT(*) AS total FROM (${mainQuery}) sub
      `;
      const countResult = await query(countQuery, params);
      const total = parseInt(countResult.rows[0].total);

      // Data query with pagination - oldest first
      const offset = (page - 1) * limit;
      paramCount++;
      params.push(limit);
      paramCount++;
      params.push(offset);

      const dataQuery = `
        ${mainQuery}
        ORDER BY c.created_at ASC
        LIMIT $${paramCount - 1} OFFSET $${paramCount}
      `;

      const result = await query(dataQuery, params);

      return {
        clientes: result.rows,
        total,
        page,
        limit
      };
    } catch (error) {
      logger.error('Error in getClientesParaRecordatorio:', error);
      throw error;
    }
  }

  /**
   * Record a notification for a client
   */
  async registrarNotificacion(clienteId, userId) {
    try {
      const result = await query(`
        INSERT INTO notificaciones_recordatorio (cliente_id, notificado_por)
        VALUES ($1, $2)
        RETURNING id, cliente_id, notificado_por, created_at
      `, [clienteId, userId]);

      logger.info(`Notificación registrada para cliente ${clienteId} por usuario ${userId}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error in registrarNotificacion:', error);
      throw error;
    }
  }

  /**
   * Get notification history for a specific client
   */
  async getNotificacionesCliente(clienteId) {
    try {
      const result = await query(`
        SELECT 
          nr.id, nr.created_at,
          u.nombre AS notificado_por_nombre
        FROM notificaciones_recordatorio nr
        LEFT JOIN usuarios u ON nr.notificado_por = u.id
        WHERE nr.cliente_id = $1
        ORDER BY nr.created_at DESC
        LIMIT 20
      `, [clienteId]);

      return result.rows;
    } catch (error) {
      logger.error('Error in getNotificacionesCliente:', error);
      throw error;
    }
  }

  /**
   * Get summary counts for filter cards
   */
  async getResumenRecordatorios(vendedor) {
    try {
      const params = [];
      let vendedorCondition = '';
      if (vendedor) {
        params.push(vendedor);
        vendedorCondition = `AND b.vendido_por = $1`;
      }

      const result = await query(`
        WITH boleta_stats AS (
          SELECT 
            b.cliente_id,
            COUNT(*) FILTER (WHERE b.estado = 'RESERVADA') AS reservadas,
            COUNT(*) FILTER (
              WHERE b.estado = 'ABONADA'
                AND COALESCE(ab.total_abonado, 0) > 0
                AND COALESCE(ab.total_abonado, 0) < 90000
            ) AS abonadas,
            COUNT(*) FILTER (
              WHERE b.estado IN ('RESERVADA','ABONADA')
                AND COALESCE(ab.total_abonado, 0) < 90000
            ) AS crucero_boletas
          FROM boletas b
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(a.monto) FILTER (WHERE a.estado = 'CONFIRMADO'), 0) AS total_abonado
            FROM abonos a WHERE a.boleta_id = b.id
          ) ab ON true
          WHERE 1=1 ${vendedorCondition}
          GROUP BY b.cliente_id
        ),
        notif_info AS (
          SELECT DISTINCT cliente_id
          FROM notificaciones_recordatorio
        )
        SELECT
          COUNT(*) FILTER (WHERE bs.reservadas > 0 OR bs.abonadas > 0) AS total_pendientes,
          COUNT(*) FILTER (WHERE bs.reservadas > 0) AS con_reservadas,
          COUNT(*) FILTER (WHERE bs.abonadas > 0) AS con_abonadas,
          COUNT(*) FILTER (WHERE bs.crucero_boletas > 0) AS con_crucero,
          COUNT(*) FILTER (WHERE (bs.reservadas > 0 OR bs.abonadas > 0) AND ni.cliente_id IS NOT NULL) AS notificados,
          COUNT(*) FILTER (WHERE (bs.reservadas > 0 OR bs.abonadas > 0) AND ni.cliente_id IS NULL) AS no_notificados
        FROM boleta_stats bs
        LEFT JOIN notif_info ni ON ni.cliente_id = bs.cliente_id
      `, params);

      return result.rows[0];
    } catch (error) {
      logger.error('Error in getResumenRecordatorios:', error);
      throw error;
    }
  }

  /**
   * Get list of vendedores/admins who have sold boletas
   */
  async getVendedores() {
    try {
      const result = await query(`
        SELECT DISTINCT u.id, u.nombre, u.rol
        FROM usuarios u
        INNER JOIN boletas b ON b.vendido_por = u.id
        WHERE b.estado IN ('RESERVADA', 'ABONADA')
          AND u.activo = true
        ORDER BY u.nombre ASC
      `);
      return result.rows;
    } catch (error) {
      logger.error('Error in getVendedores:', error);
      throw error;
    }
  }
}

module.exports = new RecordatorioService();
