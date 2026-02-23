const { query } = require('../../db/pool');
const { beginTransaction } = require('../../db/tx');
const SQL_QUERIES = require('./abonos.sql');
const logger = require('../../utils/logger');

class AbonoService {
  async createAbono(abonoData) {
    const tx = await beginTransaction();
    
    try {
      const {
        venta_id,
        monto,
        metodo_abono,
        estado = 'pendiente',
        referencia,
        recibido_por
      } = abonoData;

      const abonoResult = await tx.query(SQL_QUERIES.CREATE_ABONO, [
        venta_id,
        monto,
        metodo_abono,
        estado,
        referencia,
        recibido_por
      ]);

      const abono = abonoResult.rows[0];
      
      if (estado === 'recibido') {
        await tx.query(
          `UPDATE ventas 
           SET estado = CASE 
             WHEN (SELECT COALESCE(SUM(monto), 0) FROM abonos WHERE venta_id = $1 AND estado = 'recibido') >= monto_total 
             THEN 'completada' 
             ELSE 'pendiente' 
           END 
           WHERE id = $1`,
          [venta_id]
        );
      }
      
      await tx.commit();
      logger.info(`Abono created: ${abono.id}`);
      return abono;
    } catch (error) {
      await tx.rollback();
      logger.error('Error creating abono:', error);
      throw error;
    }
  }

  async getAllAbonos() {
    try {
      const result = await query(SQL_QUERIES.GET_ALL_ABONOS);
      return result.rows;
    } catch (error) {
      logger.error('Error getting abonos:', error);
      throw error;
    }
  }

  async getAbonosByVenta(venta_id) {
    try {
      const result = await query(SQL_QUERIES.GET_ABONOS_BY_VENTA, [venta_id]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting abonos by venta:', error);
      throw error;
    }
  }

  async getAbonoById(id) {
    try {
      const result = await query(SQL_QUERIES.GET_ABONO_BY_ID, [id]);
      if (result.rows.length === 0) {
        throw new Error('Abono not found');
      }
      return result.rows[0];
    } catch (error) {
      logger.error(`Error getting abono ${id}:`, error);
      throw error;
    }
  }

  async updateAbono(id, abonoData, actualizado_por) {
    try {
      const {
        monto,
        metodo_abono,
        estado,
        referencia
      } = abonoData;

      const result = await query(SQL_QUERIES.UPDATE_ABONO, [
        monto,
        metodo_abono,
        estado,
        referencia,
        actualizado_por,
        id
      ]);

      if (result.rows.length === 0) {
        throw new Error('Abono not found');
      }

      logger.info(`Abono updated: ${id}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error updating abono ${id}:`, error);
      throw error;
    }
  }

  async updateAbonoStatus(id, estado, actualizado_por) {
    const tx = await beginTransaction();
    
    try {
      const abonoResult = await tx.query(
        'SELECT * FROM abonos WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (abonoResult.rows.length === 0) {
        await tx.rollback();
        throw new Error('Abono not found');
      }

      const abono = abonoResult.rows[0];
      
      const updateResult = await tx.query(SQL_QUERIES.UPDATE_ABONO_STATUS, [
        estado,
        actualizado_por,
        id
      ]);

      if (estado === 'recibido' && abono.estado !== 'recibido') {
        await tx.query(
          `UPDATE ventas 
           SET estado = CASE 
             WHEN (SELECT COALESCE(SUM(monto), 0) FROM abonos WHERE venta_id = $1 AND estado = 'recibido') >= monto_total 
             THEN 'completada' 
             ELSE 'pendiente' 
           END 
           WHERE id = $1`,
          [abono.venta_id]
        );
      }
      
      await tx.commit();
      logger.info(`Abono status updated: ${id} to ${estado}`);
      return updateResult.rows[0];
    } catch (error) {
      await tx.rollback();
      logger.error(`Error updating abono status ${id}:`, error);
      throw error;
    }
  }

  async deleteAbono(id) {
    try {
      const result = await query(SQL_QUERIES.DELETE_ABONO, [id]);
      if (result.rows.length === 0) {
        throw new Error('Abono not found');
      }
      logger.info(`Abono deleted: ${id}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error deleting abono ${id}:`, error);
      throw error;
    }
  }

  async getAbonosStats() {
    try {
      const result = await query(SQL_QUERIES.GET_ABONOS_STATS);
      return result.rows[0];
    } catch (error) {
      logger.error('Error getting abonos stats:', error);
      throw error;
    }
  }

  async getAbonosStatsByVenta(venta_id) {
    try {
      const result = await query(SQL_QUERIES.GET_ABONOS_STATS_BY_VENTA, [venta_id]);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error getting abonos stats for venta ${venta_id}:`, error);
      throw error;
    }
  }

  async getAbonosByDateRange(fecha_inicio, fecha_fin) {
    try {
      const result = await query(SQL_QUERIES.GET_ABONOS_BY_DATE_RANGE, [fecha_inicio, fecha_fin]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting abonos by date range:', error);
      throw error;
    }
  }

  async getAbonosByMetodo() {
    try {
      const result = await query(SQL_QUERIES.GET_ABONOS_BY_METODO);
      return result.rows;
    } catch (error) {
      logger.error('Error getting abonos by metodo:', error);
      throw error;
    }
  }

  async getAbonosPendientesByVenta(venta_id) {
    try {
      const result = await query(SQL_QUERIES.GET_ABONOS_PENDIENTES_BY_VENTA, [venta_id]);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error getting abonos pendientes for venta ${venta_id}:`, error);
      throw error;
    }
  }

  async receiveAbono(id, actualizado_por) {
    const tx = await beginTransaction();
    
    try {
      const abonoResult = await tx.query(
        'SELECT * FROM abonos WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (abonoResult.rows.length === 0) {
        await tx.rollback();
        throw new Error('Abono not found');
      }

      const abono = abonoResult.rows[0];
      if (abono.estado !== 'pendiente') {
        await tx.rollback();
        throw new Error('Abono cannot be received');
      }

      const updateResult = await tx.query(
        `UPDATE abonos 
         SET estado = 'recibido', actualizado_por = $1, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [actualizado_por, id]
      );

      await tx.query(
        `UPDATE ventas 
         SET estado = CASE 
           WHEN (SELECT COALESCE(SUM(monto), 0) FROM abonos WHERE venta_id = $1 AND estado = 'recibido') >= monto_total 
           THEN 'completada' 
           ELSE 'pendiente' 
         END 
         WHERE id = $1`,
        [abono.venta_id]
      );

      await tx.commit();
      logger.info(`Abono received: ${id}`);
      return updateResult.rows[0];
    } catch (error) {
      await tx.rollback();
      logger.error(`Error receiving abono ${id}:`, error);
      throw error;
    }
  }

  async cancelAbono(id, motivo, actualizado_por) {
    const tx = await beginTransaction();
    
    try {
      const abonoResult = await tx.query(
        'SELECT * FROM abonos WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (abonoResult.rows.length === 0) {
        await tx.rollback();
        throw new Error('Abono not found');
      }

      const abono = abonoResult.rows[0];
      if (abono.estado === 'recibido') {
        await tx.rollback();
        throw new Error('Received abono cannot be cancelled');
      }

      const updateResult = await tx.query(
        `UPDATE abonos 
         SET estado = 'cancelado', motivo_cancelacion = $1, actualizado_por = $2, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [motivo, actualizado_por, id]
      );

      await tx.commit();
      logger.info(`Abono cancelled: ${id}`);
      return updateResult.rows[0];
    } catch (error) {
      await tx.rollback();
      logger.error(`Error cancelling abono ${id}:`, error);
      throw error;
    }
  }

  async registrarAbono(ventaId, data, usuarioId) {
  const { boleta_id, monto, metodo_pago, notas } = data;

  const tx = await db.beginTransaction();

  try {

    // 🔹 Obtener precio boleta
    const boletaResult = await tx.query(
      `SELECT precio FROM boletas WHERE id = $1`,
      [boleta_id]
    );

    if (boletaResult.rows.length === 0) {
      throw new Error('Boleta no encontrada');
    }

    const precioBoleta = boletaResult.rows[0].precio;

    // 🔹 Buscar medio_pago_id
    const medioPagoResult = await tx.query(
      `SELECT id FROM medios_pago WHERE nombre = $1 AND activo = true LIMIT 1`,
      [metodo_pago]
    );

    const medioPagoId = medioPagoResult.rows[0]?.id || null;

    // 🔹 Insertar abono
    await tx.query(
      `INSERT INTO abonos (
        venta_id,
        registrado_por,
        boleta_id,
        medio_pago_id,
        monto,
        moneda,
        estado,
        notas,
        created_at
      ) VALUES ($1,$2,$3,$4,$5,'COP','CONFIRMADO',$6,CURRENT_TIMESTAMP)`,
      [
        ventaId,
        usuarioId,
        boleta_id,
        medioPagoId,
        monto,
        notas || 'Abono adicional'
      ]
    );

    // 🔥 Calcular total abonado
    const totalAbonadoResult = await tx.query(
      `SELECT COALESCE(SUM(monto),0) as total
       FROM abonos
       WHERE boleta_id = $1`,
      [boleta_id]
    );

    const totalAbonado = Number(totalAbonadoResult.rows[0].total);
    const saldoPendiente = precioBoleta - totalAbonado;

    // 🔹 Si ya pagó todo
    if (totalAbonado >= precioBoleta) {
      await tx.query(
        `UPDATE boletas SET estado = 'PAGADA' WHERE id = $1`,
        [boleta_id]
      );
    }

    await tx.commit();

    return {
      total_abonado: totalAbonado,
      saldo_pendiente: saldoPendiente > 0 ? saldoPendiente : 0,
      estado: totalAbonado >= precioBoleta ? 'PAGADA' : 'ABONADA'
    };

  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

}

module.exports = new AbonoService();
