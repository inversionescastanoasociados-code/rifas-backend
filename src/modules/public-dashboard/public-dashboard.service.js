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

      // Filtrar por cliente nombre
      if (filtros.cliente_nombre) {
        whereConditions.push(`c.nombre ILIKE $${params.length + 1}`);
        params.push(`%${filtros.cliente_nombre}%`);
      }

      // Filtrar por cédula/identificación del cliente
      if (filtros.cliente_identificacion) {
        whereConditions.push(`c.identificacion ILIKE $${params.length + 1}`);
        params.push(`%${filtros.cliente_identificacion}%`);
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
  async getVentasPublicasPendientes(filtros = {}) {
    try {
      let sql = SQL_QUERIES.GET_VENTAS_PUBLICAS_PENDIENTES;
      let params = [];
      let extraConditions = [];

      if (filtros.cliente_nombre) {
        extraConditions.push(`c.nombre ILIKE $${params.length + 1}`);
        params.push(`%${filtros.cliente_nombre}%`);
      }

      if (filtros.cliente_identificacion) {
        extraConditions.push(`c.identificacion ILIKE $${params.length + 1}`);
        params.push(`%${filtros.cliente_identificacion}%`);
      }

      if (extraConditions.length > 0) {
        sql = sql.replace(
          "AND (v.estado_venta = 'SIN_REVISAR' OR v.estado_venta = 'PENDIENTE' OR v.estado_venta = 'ABONADA')",
          `AND (v.estado_venta = 'SIN_REVISAR' OR v.estado_venta = 'PENDIENTE' OR v.estado_venta = 'ABONADA') AND ${extraConditions.join(' AND ')}`
        );
      }

      const result = await query(sql, params);
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

      // ── Calcular datos financieros por boleta ──
      // Obtener todos los abonos de esta venta
      const todosAbonosResult = await query(
        `SELECT a.boleta_id, a.monto
         FROM abonos a
         WHERE a.venta_id = $1`,
        [ventaId]
      );

      const montoTotal = Number(venta.monto_total);
      const boletas = venta.boletas || [];
      const cantidadBoletas = boletas.length;

      if (cantidadBoletas > 0) {
        const precioBoleta = montoTotal / cantidadBoletas;

        // Agrupar abonos por boleta
        const abonosPorBoleta = new Map();
        for (const abono of todosAbonosResult.rows) {
          const boletaId = abono.boleta_id;
          const monto = Number(abono.monto);
          if (!abonosPorBoleta.has(boletaId)) {
            abonosPorBoleta.set(boletaId, 0);
          }
          abonosPorBoleta.set(boletaId, abonosPorBoleta.get(boletaId) + monto);
        }

        // Enriquecer cada boleta con datos financieros
        venta.boletas = boletas.map((b) => {
          const pagadoBoleta = Number(abonosPorBoleta.get(b.boleta_id) || 0);
          const saldoBoleta = Math.max(precioBoleta - pagadoBoleta, 0);
          return {
            ...b,
            precio_boleta: precioBoleta,
            total_pagado_boleta: pagadoBoleta,
            saldo_pendiente_boleta: saldoBoleta
          };
        });
      }

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
   * ✅ Marcar venta como revisada (SIN_REVISAR → PENDIENTE)
   * Se usa cuando el admin envía el WhatsApp de recordatorio
   */
  async marcarRevisada(ventaId) {
    try {
      if (!ventaId) {
        throw new Error('ventaId es requerido');
      }

      const result = await query(SQL_QUERIES.MARK_VENTA_REVISADA, [ventaId]);

      if (result.rows.length === 0) {
        throw new Error('Venta no encontrada o ya fue revisada');
      }

      logger.info(`Venta ${ventaId} marcada como revisada (SIN_REVISAR → PENDIENTE)`);

      return {
        success: true,
        message: 'Venta marcada como revisada',
        venta_id: ventaId
      };
    } catch (error) {
      logger.error(`Error marcando venta ${ventaId} como revisada:`, error);
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

  /**
   * 🔔 Obtener SOLO ventas SIN_REVISAR (para banner de notificación)
   */
  async getVentasSinRevisar() {
    try {
      const result = await query(SQL_QUERIES.GET_VENTAS_SIN_REVISAR);
      logger.info(`Obtenidas ${result.rows.length} ventas sin revisar`);
      return result.rows;
    } catch (error) {
      logger.error('Error obteniendo ventas sin revisar:', error);
      throw error;
    }
  }

  /**
   * 🎟️ Obtener todas las boletas reservadas (online + punto físico)
   */
  async getBoletasReservadas() {
    try {
      const result = await query(SQL_QUERIES.GET_BOLETAS_RESERVADAS);
      logger.info(`Obtenidas ${result.rows.length} boletas reservadas`);
      return result.rows;
    } catch (error) {
      logger.error('Error obteniendo boletas reservadas:', error);
      throw error;
    }
  }

  /**
   * 🔓 Liberar una boleta reservada manualmente
   */
  async liberarBoletaManual(boletaId) {
    const tx = await beginTransaction();
    try {
      // Liberar la boleta
      const result = await tx.query(SQL_QUERIES.LIBERAR_BOLETA_MANUAL, [boletaId]);
      
      if (result.rows.length === 0) {
        throw new Error('Boleta no encontrada o no está en estado RESERVADA');
      }

      const boleta = result.rows[0];

      // Decrementar boletas_vendidas en la rifa
      await tx.query(
        `UPDATE rifas SET boletas_vendidas = GREATEST(boletas_vendidas - 1, 0), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [boleta.rifa_id]
      );

      await tx.commit();
      logger.info(`Boleta #${boleta.numero} liberada manualmente (rifa: ${boleta.rifa_id})`);
      return boleta;
    } catch (error) {
      await tx.rollback();
      logger.error('Error liberando boleta manual:', error);
      throw error;
    }
  }

  /**
   * 🔓 Liberar TODAS las boletas de una venta y cancelar la venta
   */
  async liberarBoletasDeVenta(ventaId) {
    const tx = await beginTransaction();
    try {
      // Liberar boletas
      const boletas = await tx.query(SQL_QUERIES.LIBERAR_BOLETAS_DE_VENTA, [ventaId]);

      if (boletas.rows.length === 0) {
        throw new Error('No se encontraron boletas reservadas para esta venta');
      }

      // Cancelar la venta
      await tx.query(SQL_QUERIES.CANCELAR_VENTA_SI_SIN_BOLETAS, [ventaId]);

      // Decrementar boletas_vendidas en la rifa correspondiente
      const ventaResult = await tx.query('SELECT rifa_id FROM ventas WHERE id = $1', [ventaId]);
      if (ventaResult.rows.length > 0) {
        await tx.query(
          `UPDATE rifas SET boletas_vendidas = GREATEST(boletas_vendidas - $1, 0), updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [boletas.rows.length, ventaResult.rows[0].rifa_id]
        );
      }

      await tx.commit();
      logger.info(`${boletas.rows.length} boletas liberadas de venta ${ventaId}`);
      return {
        boletas_liberadas: boletas.rows.length,
        numeros: boletas.rows.map(b => b.numero)
      };
    } catch (error) {
      await tx.rollback();
      logger.error('Error liberando boletas de venta:', error);
      throw error;
    }
  }
}

module.exports = new PublicDashboardService();
