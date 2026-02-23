const { query } = require('../../db/pool');
const { beginTransaction } = require('../../db/tx');
const SQL_QUERIES = require('./pagos.sql');
const logger = require('../../utils/logger');

class PagoService {
  async createPago(pagoData) {
    const tx = await beginTransaction();
    
    try {
      const {
        venta_id,
        monto,
        metodo_pago,
        estado = 'pendiente',
        referencia,
        procesado_por
      } = pagoData;

      const pagoResult = await tx.query(SQL_QUERIES.CREATE_PAGO, [
        venta_id,
        monto,
        metodo_pago,
        estado,
        referencia,
        procesado_por
      ]);

      const pago = pagoResult.rows[0];
      
      if (estado === 'completado') {
        await tx.query(
          'UPDATE ventas SET estado = CASE WHEN estado = \'pendiente\' THEN \'completada\' ELSE estado END WHERE id = $1',
          [venta_id]
        );
      }
      
      await tx.commit();
      logger.info(`Pago created: ${pago.id}`);
      return pago;
    } catch (error) {
      await tx.rollback();
      logger.error('Error creating pago:', error);
      throw error;
    }
  }

  async getAllPagos() {
    try {
      const result = await query(SQL_QUERIES.GET_ALL_PAGOS);
      return result.rows;
    } catch (error) {
      logger.error('Error getting pagos:', error);
      throw error;
    }
  }

  async getPagosByVenta(venta_id) {
    try {
      const result = await query(SQL_QUERIES.GET_PAGOS_BY_VENTA, [venta_id]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting pagos by venta:', error);
      throw error;
    }
  }

  async getPagoById(id) {
    try {
      const result = await query(SQL_QUERIES.GET_PAGO_BY_ID, [id]);
      if (result.rows.length === 0) {
        throw new Error('Pago not found');
      }
      return result.rows[0];
    } catch (error) {
      logger.error(`Error getting pago ${id}:`, error);
      throw error;
    }
  }

  async updatePago(id, pagoData, actualizado_por) {
    try {
      const {
        monto,
        metodo_pago,
        estado,
        referencia
      } = pagoData;

      const result = await query(SQL_QUERIES.UPDATE_PAGO, [
        monto,
        metodo_pago,
        estado,
        referencia,
        actualizado_por,
        id
      ]);

      if (result.rows.length === 0) {
        throw new Error('Pago not found');
      }

      logger.info(`Pago updated: ${id}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error updating pago ${id}:`, error);
      throw error;
    }
  }

  async updatePagoStatus(id, estado, actualizado_por) {
    const tx = await beginTransaction();
    
    try {
      const pagoResult = await tx.query(
        'SELECT * FROM pagos WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (pagoResult.rows.length === 0) {
        await tx.rollback();
        throw new Error('Pago not found');
      }

      const pago = pagoResult.rows[0];
      
      const updateResult = await tx.query(SQL_QUERIES.UPDATE_PAGO_STATUS, [
        estado,
        actualizado_por,
        id
      ]);

      if (estado === 'completado' && pago.estado !== 'completado') {
        await tx.query(
          `UPDATE ventas 
           SET estado = CASE 
             WHEN (SELECT COALESCE(SUM(monto), 0) FROM pagos WHERE venta_id = $1 AND estado = 'completado') + $2 >= monto_total 
             THEN 'completada' 
             ELSE estado 
           END 
           WHERE id = $1`,
          [pago.venta_id, pago.monto]
        );
      }
      
      await tx.commit();
      logger.info(`Pago status updated: ${id} to ${estado}`);
      return updateResult.rows[0];
    } catch (error) {
      await tx.rollback();
      logger.error(`Error updating pago status ${id}:`, error);
      throw error;
    }
  }

  async deletePago(id) {
    try {
      const result = await query(SQL_QUERIES.DELETE_PAGO, [id]);
      if (result.rows.length === 0) {
        throw new Error('Pago not found');
      }
      logger.info(`Pago deleted: ${id}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error deleting pago ${id}:`, error);
      throw error;
    }
  }

  async getPagosStats() {
    try {
      const result = await query(SQL_QUERIES.GET_PAGOS_STATS);
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting pagos stats:', error);
      throw error;
    }
  }

  async getPagosStatsByVenta(venta_id) {
    try {
      const result = await query(SQL_QUERIES.GET_PAGOS_STATS_BY_VENTA, [venta_id]);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error getting pagos stats for venta ${venta_id}:`, error);
      throw error;
    }
  }

  async getPagosByDateRange(fecha_inicio, fecha_fin) {
    try {
      const result = await query(SQL_QUERIES.GET_PAGOS_BY_DATE_RANGE, [fecha_inicio, fecha_fin]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting pagos by date range:', error);
      throw error;
    }
  }

  async getPagosByMetodo() {
    try {
      const result = await query(SQL_QUERIES.GET_PAGOS_BY_METODO);
      return result.rows;
    } catch (error) {
      logger.error('Error getting pagos by metodo:', error);
      throw error;
    }
  }

  async processPago(id, actualizado_por) {
    const tx = await beginTransaction();
    
    try {
      const pagoResult = await tx.query(
        'SELECT * FROM pagos WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (pagoResult.rows.length === 0) {
        await tx.rollback();
        throw new Error('Pago not found');
      }

      const pago = pagoResult.rows[0];
      if (pago.estado !== 'pendiente') {
        await tx.rollback();
        throw new Error('Pago cannot be processed');
      }

      const updateResult = await tx.query(
        `UPDATE pagos 
         SET estado = 'completado', actualizado_por = $1, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [actualizado_por, id]
      );

      await tx.query(
        `UPDATE ventas 
         SET estado = CASE 
           WHEN (SELECT COALESCE(SUM(monto), 0) FROM pagos WHERE venta_id = $1 AND estado = 'completado') >= monto_total 
           THEN 'completada' 
           ELSE estado 
         END 
         WHERE id = $1`,
        [pago.venta_id]
      );

      await tx.commit();
      logger.info(`Pago processed: ${id}`);
      return updateResult.rows[0];
    } catch (error) {
      await tx.rollback();
      logger.error(`Error processing pago ${id}:`, error);
      throw error;
    }
  }

  async failPago(id, motivo, actualizado_por) {
    const tx = await beginTransaction();
    
    try {
      const pagoResult = await tx.query(
        'SELECT * FROM pagos WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (pagoResult.rows.length === 0) {
        await tx.rollback();
        throw new Error('Pago not found');
      }

      const pago = pagoResult.rows[0];
      if (pago.estado === 'completado') {
        await tx.rollback();
        throw new Error('Completed pago cannot be failed');
      }

      const updateResult = await tx.query(
        `UPDATE pagos 
         SET estado = 'fallido', motivo_fallo = $1, actualizado_por = $2, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [motivo, actualizado_por, id]
      );

      await tx.commit();
      logger.info(`Pago failed: ${id}`);
      return updateResult.rows[0];
    } catch (error) {
      await tx.rollback();
      logger.error(`Error failing pago ${id}:`, error);
      throw error;
    }
  }
}

module.exports = new PagoService();
