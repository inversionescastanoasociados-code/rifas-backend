const { query } = require('../../db/pool');
const { beginTransaction } = require('../../db/tx');
const SQL_QUERIES = require('./public-dashboard.sql');
const logger = require('../../utils/logger');

class PublicDashboardService {

  /**
   * 📋 Obtener todas las ventas públicas
   */
  async getVentasPublicas(filtros = {}) {
    try {
      let sql = SQL_QUERIES.GET_VENTAS_PUBLICAS;
      let params = [];
      let whereConditions = [];

      // Filtrar por estado
      if (filtros.estado_venta) {
        whereConditions.push(`v.estado_venta = $${params.length + 1}`);
        params.push(filtros.estado_venta);
      }

      // Filtrar por rifa
      if (filtros.rifa_id) {
        whereConditions.push(`v.rifa_id = $${params.length + 1}`);
        params.push(filtros.rifa_id);
      }

      // Filtrar por cliente
      if (filtros.cliente_nombre) {
        whereConditions.push(`c.nombre ILIKE $${params.length + 1}`);
        params.push(`%${filtros.cliente_nombre}%`);
      }

      // Construir query con WHERE si hay filtros
      if (whereConditions.length > 0) {
        sql = sql.replace(
          'WHERE v.es_venta_online = true',
          `WHERE v.es_venta_online = true AND ${whereConditions.join(' AND ')}`
        );
      }

      const result = await query(sql, params);
      logger.info(`Obtenidas ${result.rows.length} ventas públicas`);
      return result.rows;
    } catch (error) {
      logger.error('Error obteniendo ventas públicas:', error);
      throw error;
    }
  }

  /**
   * ⏳ Obtener ventas públicas pendientes de confirmación
   */
  async getVentasPublicasPendientes() {
    try {
      const result = await query(SQL_QUERIES.GET_VENTAS_PUBLICAS_PENDIENTES);
      logger.info(`Obtenidas ${result.rows.length} ventas públicas pendientes`);
      return result.rows;
    } catch (error) {
      logger.error('Error obteniendo ventas públicas pendientes:', error);
      throw error;
    }
  }

  /**
   * 🔍 Obtener detalles completos de una venta pública
   */
  async getVentaPublicaDetails(ventaId) {
    try {
      if (!ventaId) {
        throw new Error('ventaId es requerido');
      }

      const result = await query(SQL_QUERIES.GET_VENTA_PUBLICA_DETAILS, [ventaId]);
      
      if (result.rows.length === 0) {
        throw new Error('Venta pública no encontrada');
      }

      const venta = result.rows[0];

      // Obtener abonos pendientes
      const abonosResult = await query(
        SQL_QUERIES.GET_ABONOS_PENDIENTES_BY_VENTA,
        [ventaId]
      );

      venta.abonos_pendientes = abonosResult.rows;

      logger.info(`Detalles de venta pública obtenidos: ${ventaId}`);
      return venta;
    } catch (error) {
      logger.error(`Error obteniendo detalles de venta ${ventaId}:`, error);
      throw error;
    }
  }

  /**
   * ✅ Confirmar pago de abono (manual)
   */
  async confirmarPago(abonoId, confirmadoPor) {
    const tx = await beginTransaction();

    try {
      if (!abonoId) {
        throw new Error('abonoId es requerido');
      }

      // 1. Obtener el abono
      const abonoResult = await tx.query(
        `SELECT a.*, b.id as boleta_id, v.id as venta_id 
         FROM abonos a
         JOIN boletas b ON a.boleta_id = b.id
         JOIN ventas v ON a.venta_id = v.id
         WHERE a.id = $1
         FOR UPDATE`,
        [abonoId]
      );

      if (abonoResult.rows.length === 0) {
        throw new Error('Abono no encontrado');
      }

      const abono = abonoResult.rows[0];

      if (abono.estado !== 'REGISTRADO') {
        throw new Error(`Abono ya fue procesado (estado: ${abono.estado})`);
      }

      // 2. Confirmar el abono
      const resultAbono = await tx.query(
        SQL_QUERIES.CONFIRM_ABONO,
        [abonoId]
      );

      logger.info(`Abono ${abonoId} confirmado`);

      // 3. Obtener total de abonos para esta venta
      const totalResult = await tx.query(
        `SELECT COALESCE(SUM(monto), 0) as total_abonado
         FROM abonos
         WHERE venta_id = $1 AND estado = 'CONFIRMADO'`,
        [abono.venta_id]
      );

      const totalAbonado = Number(totalResult.rows[0].total_abonado);

      // 4. Obtener total de venta
      const ventaResult = await tx.query(
        `SELECT monto_total FROM ventas WHERE id = $1 FOR UPDATE`,
        [abono.venta_id]
      );

      const montoTotal = Number(ventaResult.rows[0].monto_total);

      // 5. Si el total abonado >= monto total, actualizar estado de boleta a PAGADA
      if (totalAbonado >= montoTotal) {
        await tx.query(
          SQL_QUERIES.UPDATE_BOLETA_TO_PAGADA,
          [abono.boleta_id]
        );

        logger.info(`Boleta ${abono.boleta_id} marcada como PAGADA`);

        // 6. Verificar si todas las boletas están pagadas para cambiar venta a PAGADA
        const boletasNoPagedasResult = await tx.query(
          `SELECT COUNT(*) as cantidad FROM boletas 
           WHERE venta_id = $1 AND estado != 'PAGADA'`,
          [abono.venta_id]
        );

        const boletasNoPagadas = Number(boletasNoPagedasResult.rows[0].cantidad);

        if (boletasNoPagadas === 0) {
          await tx.query(
            SQL_QUERIES.UPDATE_VENTA_STATUS,
            ['PAGADA', abono.venta_id]
          );
          logger.info(`Venta ${abono.venta_id} marcada como completamente PAGADA`);
        }
      }

      await tx.commit();

      return {
        success: true,
        message: 'Pago confirmado correctamente',
        abono_id: abonoId,
        venta_id: abono.venta_id
      };

    } catch (error) {
      await tx.rollback();
      logger.error(`Error confirmando pago para abono ${abonoId}:`, error);
      throw error;
    }
  }

  /**
   * ❌ Rechazar/Cancelar una venta pública
   */
  async cancelarVenta(ventaId, motivoCancelacion) {
    const tx = await beginTransaction();

    try {
      if (!ventaId) {
        throw new Error('ventaId es requerido');
      }

      // 1. Verificar que la venta existe
      const ventaResult = await tx.query(
        `SELECT id, estado_venta FROM ventas WHERE id = $1 AND es_venta_online = true FOR UPDATE`,
        [ventaId]
      );

      if (ventaResult.rows.length === 0) {
        throw new Error('Venta pública no encontrada');
      }

      // 2. Cambiar estado de la venta a CANCELADA
      await tx.query(
        SQL_QUERIES.CANCEL_VENTA,
        [ventaId]
      );

      // 3. Liberar todas las boletas de esta venta
      await tx.query(
        `UPDATE boletas
         SET estado = 'DISPONIBLE',
             venta_id = NULL,
             cliente_id = NULL,
             reserva_token = NULL,
             bloqueo_hasta = NULL
         WHERE venta_id = $1`,
        [ventaId]
      );

      logger.info(`Venta ${ventaId} cancelada. Boletas liberadas.`);

      await tx.commit();

      return {
        success: true,
        message: 'Venta cancelada y boletas liberadas',
        venta_id: ventaId
      };

    } catch (error) {
      await tx.rollback();
      logger.error(`Error cancelando venta ${ventaId}:`, error);
      throw error;
    }
  }

  /**
   * 📊 Obtener estadísticas de ventas públicas
   */
  async getEstadisticas() {
    try {
      const result = await query(SQL_QUERIES.GET_ESTADISTICAS_VENTAS_PUBLICAS);
      logger.info('Estadísticas de ventas públicas obtenidas');
      return result.rows[0] || {};
    } catch (error) {
      logger.error('Error obteniendo estadísticas:', error);
      throw error;
    }
  }

  /**
   * 📈 Obtener estadísticas por rifa
   */
  async getEstadisticasPorRifa() {
    try {
      const result = await query(SQL_QUERIES.GET_ESTADISTICAS_POR_RIFA);
      logger.info(`Estadísticas por rifa obtenidas: ${result.rows.length} rifas`);
      return result.rows;
    } catch (error) {
      logger.error('Error obteniendo estadísticas por rifa:', error);
      throw error;
    }
  }
}

module.exports = new PublicDashboardService();
