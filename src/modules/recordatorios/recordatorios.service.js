const { query } = require('../../db/pool');
const logger = require('../../utils/logger');

/**
 * Deuda máxima por boleta para NO aparecer en recordatorios.
 * En anticipado participan con mínimo $80.000 abonados; quien debe $50.000 o menos ya cumplió.
 * Solo entran clientes con al menos una boleta cuya deuda sea MAYOR a este valor.
 */
const MAX_DEUDA_EXCLUIDA = 50000;

/** Solo rifa(s) del proyecto actual — no mezclar con rifas anteriores. */
const SQL_RIFA_ACTIVA = `r.estado = 'ACTIVA'`;

/** Saldo pendiente por boleta (RESERVADA/ABONADA). */
const SQL_SALDO_BOLETA = `GREATEST(r.precio_boleta - COALESCE(ab.total_abonado, 0), 0)`;

/** Boleta pendiente que califica para recordatorio (deuda estrictamente mayor a $50.000). */
const SQL_BOLETA_RECORDATORIO = `b.estado IN ('RESERVADA','ABONADA') AND ${SQL_SALDO_BOLETA} > ${MAX_DEUDA_EXCLUIDA}`;

/** Notificaciones de contacto solo de la rifa activa (legacy sin rifa_id no cuenta). */
const SQL_NOTIF_RIFA_ACTIVA = `
  nr.rifa_id IN (SELECT id FROM rifas WHERE estado = 'ACTIVA')
`;

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
      await query(`
        ALTER TABLE notificaciones_recordatorio
          ADD COLUMN IF NOT EXISTS rifa_id UUID REFERENCES rifas(id) ON DELETE CASCADE
      `);
      await query(`
        CREATE INDEX IF NOT EXISTS idx_notif_recordatorio_rifa_cliente
        ON notificaciones_recordatorio (cliente_id, rifa_id)
      `);
      await query(`
        ALTER TABLE notificaciones_recordatorio
          ADD COLUMN IF NOT EXISTS linea_contacto SMALLINT
      `);
      logger.info('Table notificaciones_recordatorio ensured');
    } catch (error) {
      logger.error('Error ensuring notificaciones_recordatorio table:', error);
      throw error;
    }
  }

  /**
   * Rifa activa donde el cliente tiene boletas pendientes (para registrar contacto).
   */
  async getRifaActivaParaCliente(clienteId) {
    const result = await query(`
      SELECT DISTINCT b.rifa_id
      FROM boletas b
      JOIN rifas r ON b.rifa_id = r.id
      WHERE b.cliente_id = $1
        AND ${SQL_RIFA_ACTIVA}
        AND b.estado IN ('RESERVADA', 'ABONADA')
      ORDER BY b.rifa_id
      LIMIT 1
    `, [clienteId]);

    if (result.rows[0]?.rifa_id) {
      return result.rows[0].rifa_id;
    }

    const fallback = await query(`
      SELECT id FROM rifas WHERE estado = 'ACTIVA' ORDER BY created_at DESC LIMIT 1
    `);
    return fallback.rows[0]?.id || null;
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

      if (filtro === 'reservadas') {
        conditions.push(`bs.reservadas > 0`);
      } else if (filtro === 'abonadas') {
        conditions.push(`bs.abonadas > 0`);
      } else if (filtro === 'crucero') {
        conditions.push(`bs.crucero_boletas > 0`);
      } else {
        conditions.push(`(bs.reservadas > 0 OR bs.abonadas > 0)`);
      }

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

      let vendedorCondition = '';
      if (vendedor) {
        paramCount++;
        vendedorCondition = `AND b.vendido_por = $${paramCount}`;
        params.push(vendedor);
      }

      const mainQuery = `
        WITH boleta_stats AS (
          SELECT 
            b.cliente_id,
            COUNT(*) FILTER (
              WHERE b.estado = 'RESERVADA'
                AND ${SQL_SALDO_BOLETA} > ${MAX_DEUDA_EXCLUIDA}
            ) AS reservadas,
            COUNT(*) FILTER (
              WHERE b.estado = 'ABONADA'
                AND ${SQL_SALDO_BOLETA} > ${MAX_DEUDA_EXCLUIDA}
            ) AS abonadas,
            COUNT(*) FILTER (WHERE b.estado = 'PAGADA') AS pagadas,
            COUNT(*) AS total_boletas,
            COUNT(*) FILTER (WHERE ${SQL_BOLETA_RECORDATORIO}) AS crucero_boletas,
            COALESCE(SUM(
              CASE WHEN ${SQL_BOLETA_RECORDATORIO} THEN ${SQL_SALDO_BOLETA} ELSE 0 END
            ), 0) AS deuda_total
          FROM boletas b
          JOIN rifas r ON b.rifa_id = r.id
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(a.monto) FILTER (WHERE a.estado = 'CONFIRMADO'), 0) AS total_abonado
            FROM abonos a WHERE a.boleta_id = b.id
          ) ab ON true
          WHERE ${SQL_RIFA_ACTIVA} ${vendedorCondition}
          GROUP BY b.cliente_id
        ),
        vendedor_info AS (
          SELECT DISTINCT ON (b.cliente_id)
            b.cliente_id,
            u.id AS vendedor_id,
            u.nombre AS vendedor_nombre
          FROM boletas b
          JOIN rifas r ON b.rifa_id = r.id
          JOIN usuarios u ON b.vendido_por = u.id
          WHERE b.estado IN ('RESERVADA', 'ABONADA')
            AND ${SQL_RIFA_ACTIVA}
          ${vendedorCondition}
          ORDER BY b.cliente_id, b.created_at DESC
        ),
        notif_info AS (
          SELECT 
            nr.cliente_id,
            COUNT(*) AS total_notificaciones,
            MAX(nr.created_at) AS ultima_notificacion
          FROM notificaciones_recordatorio nr
          WHERE ${SQL_NOTIF_RIFA_ACTIVA}
          GROUP BY nr.cliente_id
        ),
        ultima_notif AS (
          SELECT DISTINCT ON (nr.cliente_id)
            nr.cliente_id,
            nr.linea_contacto AS ultima_linea_contacto
          FROM notificaciones_recordatorio nr
          WHERE ${SQL_NOTIF_RIFA_ACTIVA}
          ORDER BY nr.cliente_id, nr.created_at DESC
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
          un.ultima_linea_contacto,
          vi.vendedor_id,
          vi.vendedor_nombre
        FROM clientes c
        INNER JOIN boleta_stats bs ON bs.cliente_id = c.id
        LEFT JOIN vendedor_info vi ON vi.cliente_id = c.id
        LEFT JOIN notif_info ni ON ni.cliente_id = c.id
        LEFT JOIN ultima_notif un ON un.cliente_id = c.id
        WHERE ${conditions.join(' AND ')}
        ${searchCondition}
        ${notificado === 'si' ? 'AND ni.total_notificaciones > 0' : ''}
        ${notificado === 'no' ? 'AND (ni.total_notificaciones IS NULL OR ni.total_notificaciones = 0)' : ''}
      `;

      const countQuery = `
        SELECT COUNT(*) AS total FROM (${mainQuery}) sub
      `;
      const countResult = await query(countQuery, params);
      const total = parseInt(countResult.rows[0].total);

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
   * Record a notification for a client (scoped to active rifa).
   */
  async registrarNotificacion(clienteId, userId, lineaContacto) {
    try {
      const linea = Number(lineaContacto);
      if (!Number.isInteger(linea) || linea < 1 || linea > 5) {
        throw new Error('La línea de contacto debe ser un número entre 1 y 5');
      }

      const rifaId = await this.getRifaActivaParaCliente(clienteId);
      if (!rifaId) {
        throw new Error('No hay rifa activa para registrar el contacto');
      }

      const result = await query(`
        INSERT INTO notificaciones_recordatorio (cliente_id, notificado_por, rifa_id, linea_contacto)
        VALUES ($1, $2, $3, $4)
        RETURNING id, cliente_id, notificado_por, rifa_id, linea_contacto, created_at
      `, [clienteId, userId, rifaId, linea]);

      logger.info(`Notificación registrada para cliente ${clienteId} rifa ${rifaId} línea ${linea} por usuario ${userId}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error in registrarNotificacion:', error);
      throw error;
    }
  }

  /**
   * Get notification history for a specific client (active rifa only).
   */
  async getNotificacionesCliente(clienteId) {
    try {
      const result = await query(`
        SELECT 
          nr.id, nr.created_at, nr.rifa_id, nr.linea_contacto,
          u.nombre AS notificado_por_nombre
        FROM notificaciones_recordatorio nr
        LEFT JOIN usuarios u ON nr.notificado_por = u.id
        WHERE nr.cliente_id = $1
          AND ${SQL_NOTIF_RIFA_ACTIVA}
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
            COUNT(*) FILTER (
              WHERE b.estado = 'RESERVADA'
                AND ${SQL_SALDO_BOLETA} > ${MAX_DEUDA_EXCLUIDA}
            ) AS reservadas,
            COUNT(*) FILTER (
              WHERE b.estado = 'ABONADA'
                AND ${SQL_SALDO_BOLETA} > ${MAX_DEUDA_EXCLUIDA}
            ) AS abonadas,
            COUNT(*) FILTER (WHERE ${SQL_BOLETA_RECORDATORIO}) AS crucero_boletas
          FROM boletas b
          JOIN rifas r ON b.rifa_id = r.id
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(a.monto) FILTER (WHERE a.estado = 'CONFIRMADO'), 0) AS total_abonado
            FROM abonos a WHERE a.boleta_id = b.id
          ) ab ON true
          WHERE ${SQL_RIFA_ACTIVA} ${vendedorCondition}
          GROUP BY b.cliente_id
        ),
        notif_info AS (
          SELECT DISTINCT nr.cliente_id
          FROM notificaciones_recordatorio nr
          WHERE ${SQL_NOTIF_RIFA_ACTIVA}
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
   * Get list of vendedores/admins who have sold boletas in the active rifa
   */
  async getVendedores() {
    try {
      const result = await query(`
        SELECT DISTINCT u.id, u.nombre, u.rol
        FROM usuarios u
        INNER JOIN boletas b ON b.vendido_por = u.id
        INNER JOIN rifas r ON b.rifa_id = r.id
        WHERE b.estado IN ('RESERVADA', 'ABONADA')
          AND ${SQL_RIFA_ACTIVA}
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
