const { query } = require('../../db/pool');
const { beginTransaction } = require('../../db/tx');
const SQL_QUERIES = require('./boletas.sql');
const logger = require('../../utils/logger');

class BoletaService {
  async createBoleta(boletaData) {
    try {
      const {
        rifa_id,
        numero,
        nombre_comprador,
        telefono,
        estado = 'disponible',
        vendida_por
      } = boletaData;

      const result = await query(SQL_QUERIES.CREATE_BOLETA, [
        rifa_id,
        numero,
        nombre_comprador,
        telefono,
        estado,
        vendida_por
      ]);

      logger.info(`Boleta created: ${result.rows[0].id}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error creating boleta:', error);
      throw error;
    }
  }

  async batchCreateBoletas(rifa_id, total_boletas) {
    try {
      const tx = await beginTransaction();
      
      try {
        const result = await tx.query(SQL_QUERIES.BATCH_CREATE_BOLETAS, [rifa_id, total_boletas]);
        await tx.commit();
        
        logger.info(`Created ${result.rows.length} boletas for rifa ${rifa_id}`);
        return result.rows;
      } catch (error) {
        await tx.rollback();
        throw error;
      }
    } catch (error) {
      logger.error('Error batch creating boletas:', error);
      throw error;
    }
  }

  async getBoletasByRifa(rifa_id, estado = null) {
    try {
      // 🔹 Lazy cleanup: liberar boletas expiradas
      await this.liberarBoletasExpiradas();

      let result;
      if (estado) {
        result = await query(SQL_QUERIES.GET_BOLETAS_BY_RIFA_AND_STATUS, [rifa_id, estado]);
      } else {
        result = await query(SQL_QUERIES.GET_BOLETAS_BY_RIFA, [rifa_id]);
      }
      return result.rows;
    } catch (error) {
      logger.error('Error getting boletas by rifa:', error);
      throw error;
    }
  }

  async getBoletaById(id) {
    try {
      const result = await query(SQL_QUERIES.GET_BOLETA_BY_ID, [id]);
      if (result.rows.length === 0) {
        throw new Error('Boleta not found');
      }
      return result.rows[0];
    } catch (error) {
      logger.error(`Error getting boleta ${id}:`, error);
      throw error;
    }
  }

  async getBoletaByNumberAndRifa(rifaId, numero) {
    try {
      const result = await query(SQL_QUERIES.GET_BOLETA_BY_NUMBER_AND_RIFA, [rifaId, numero]);
      return result.rows[0] || null;
    } catch (error) {
      logger.error(`Error getting boleta ${rifaId}-${numero}:`, error);
      throw error;
    }
  }

  async bloquearBoleta(boletaId, userId, tiempoBloqueo = 15) {
    const tx = await beginTransaction();
    
    try {
      // Verificar si la boleta existe y está disponible
      const boletaCheck = await tx.query(
        'SELECT id, estado, bloqueo_hasta FROM boletas WHERE id = $1 FOR UPDATE',
        [boletaId]
      );
      
      if (boletaCheck.rows.length === 0) {
        throw new Error('Boleta not found');
      }
      
      const boleta = boletaCheck.rows[0];
      
      // Verificar si ya está vendida
      if (boleta.estado === 'VENDIDA' || boleta.estado === 'PAGADA') {
        throw new Error('Boleta already sold');
      }
      
      // Verificar si ya está bloqueada y el bloqueo no ha expirado
      if (boleta.bloqueo_hasta && new Date(boleta.bloqueo_hasta) > new Date()) {
        throw new Error('Boleta already blocked');
      }
      
      // Generar token único para la reserva
      const reservaToken = require('crypto').randomBytes(32).toString('hex');
      
      // Calcular tiempo de bloqueo (por defecto 15 minutos)
      const bloqueoHasta = new Date();
      bloqueoHasta.setMinutes(bloqueoHasta.getMinutes() + tiempoBloqueo);
      
      // Actualizar la boleta con el bloqueo
      await tx.query(
        `UPDATE boletas 
           SET estado = 'RESERVADA', 
               reserva_token = $1, 
               bloqueo_hasta = $2,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $3
           RETURNING *`,
        [reservaToken, bloqueoHasta, boletaId]
      );
      
      await tx.commit();
      
      logger.info(`Boleta ${boletaId} blocked until ${bloqueoHasta}`);
      
      return {
        boleta_id: boletaId,
        reserva_token: reservaToken,
        bloqueo_hasta: bloqueoHasta,
        tiempo_bloqueo_minutos: tiempoBloqueo
      };
      
    } catch (error) {
      await tx.rollback();
      logger.error('Error blocking boleta:', error);
      throw error;
    }
  }

  async desbloquearBoleta(boletaId, reservaToken) {
    const tx = await beginTransaction();
    
    try {
      // Verificar si la boleta existe y el token coincide
      const boletaCheck = await tx.query(
        'SELECT id, estado, reserva_token, bloqueo_hasta FROM boletas WHERE id = $1',
        [boletaId]
      );
      
      if (boletaCheck.rows.length === 0) {
        throw new Error('Boleta not found');
      }
      
      const boleta = boletaCheck.rows[0];
      
      // Verificar si el token coincide
      if (boleta.reserva_token !== reservaToken) {
        throw new Error('Invalid reservation token');
      }
      
      // Verificar si el bloqueo ya expiró
      if (boleta.bloqueo_hasta && new Date(boleta.bloqueo_hasta) <= new Date()) {
        // Si expiró, liberar automáticamente
        await tx.query(
          `UPDATE boletas 
           SET estado = 'DISPONIBLE', 
               reserva_token = NULL, 
               bloqueo_hasta = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [boletaId]
        );
      } else {
        // Si no expiró, liberar manualmente
        await tx.query(
          `UPDATE boletas 
           SET estado = 'DISPONIBLE', 
               reserva_token = NULL, 
               bloqueo_hasta = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [boletaId]
        );
      }
      
      await tx.commit();
      
      logger.info(`Boleta ${boletaId} unblocked`);
      
      return {
        boleta_id: boletaId,
        message: 'Boleta unblocked successfully'
      };
      
    } catch (error) {
      await tx.rollback();
      logger.error('Error unblocking boleta:', error);
      throw error;
    }
  }

  async verificarBloqueo(boletaId, reservaToken) {
    try {
      const result = await query(
        'SELECT id, estado, reserva_token, bloqueo_hasta FROM boletas WHERE id = $1',
        [boletaId]
      );
      
      if (result.rows.length === 0) {
        return { found: false, message: 'Boleta not found' };
      }
      
      const boleta = result.rows[0];
      
      // Verificar si el token coincide
      if (boleta.reserva_token !== reservaToken) {
        return { found: false, message: 'Invalid reservation token' };
      }
      
      // Verificar si el bloqueo expiró
      if (boleta.bloqueo_hasta && new Date(boleta.bloqueo_hasta) <= new Date()) {
        return { 
          found: true, 
          valid: false, 
          expired: true,
          message: 'Reservation expired' 
        };
      }
      
      return { 
        found: true, 
        valid: true, 
        expired: false,
        boleta: {
          id: boleta.id,
          estado: boleta.estado,
          bloqueo_hasta: boleta.bloqueo_hasta
        }
      };
      
    } catch (error) {
      logger.error('Error checking boleta block:', error);
      throw error;
    }
  }

  async updateBoletaImage(boletaId, imagenUrl) {
    try {
      const result = await query(
        'UPDATE boletas SET imagen_url = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
        [imagenUrl, boletaId]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Boleta not found');
      }
      
      logger.info(`Updated image for boleta ${boletaId}`);
      return result.rows[0];
    } catch (error) {
      logger.error('Error updating boleta image:', error);
      throw error;
    }
  }

  async updateBoleta(id, boletaData, actualizada_por) {
    try {
      const {
        nombre_comprador,
        telefono,
        estado
      } = boletaData;

      const result = await query(SQL_QUERIES.UPDATE_BOLETA, [
        nombre_comprador,
        telefono,
        estado,
        actualizada_por,
        id
      ]);

      if (result.rows.length === 0) {
        throw new Error('Boleta not found');
      }

      logger.info(`Boleta updated: ${id}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error updating boleta ${id}:`, error);
      throw error;
    }
  }

  async updateBoletaStatus(id, estado, actualizada_por) {
    try {
      const result = await query(SQL_QUERIES.UPDATE_BOLETA_STATUS, [
        estado,
        actualizada_por,
        id
      ]);

      if (result.rows.length === 0) {
        throw new Error('Boleta not found');
      }

      logger.info(`Boleta status updated: ${id} to ${estado}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error updating boleta status ${id}:`, error);
      throw error;
    }
  }

  async deleteBoleta(id) {
    try {
      const result = await query(SQL_QUERIES.DELETE_BOLETA, [id]);
      if (result.rows.length === 0) {
        throw new Error('Boleta not found');
      }
      logger.info(`Boleta deleted: ${id}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error deleting boleta ${id}:`, error);
      throw error;
    }
  }

  async getAvailableBoletas(rifa_id) {
    try {
      // 🔹 Lazy cleanup: liberar boletas expiradas
      await this.liberarBoletasExpiradas();

      const result = await query(SQL_QUERIES.GET_AVAILABLE_BOLETAS, [rifa_id]);
      return result.rows;
    } catch (error) {
      logger.error(`Error getting available boletas for rifa ${rifa_id}:`, error);
      throw error;
    }
  }

  async getBoletasStats(rifa_id) {
    try {
      const result = await query(SQL_QUERIES.GET_BOLETAS_STATS, [rifa_id]);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error getting boletas stats for rifa ${rifa_id}:`, error);
      throw error;
    }
  }

  async getBoletasFullStatus(rifa_id) {
    try {
      // 🔹 Lazy cleanup: liberar boletas expiradas
      await this.liberarBoletasExpiradas();

      const result = await query(SQL_QUERIES.GET_BOLETAS_FULL_STATUS, [rifa_id]);
      return result.rows;
    } catch (error) {
      logger.error(`Error getting boletas full status for rifa ${rifa_id}:`, error);
      throw error;
    }
  }

  async sellBoleta(id, nombre_comprador, telefono, vendida_por) {
    const tx = await beginTransaction();
    
    try {
      const boletaResult = await tx.query(
        'SELECT * FROM boletas WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (boletaResult.rows.length === 0) {
        await tx.rollback();
        throw new Error('Boleta not found');
      }

      const boleta = boletaResult.rows[0];
      if (boleta.estado !== 'disponible') {
        await tx.rollback();
        throw new Error('Boleta is not available for sale');
      }

      const updateResult = await tx.query(
        `UPDATE boletas 
         SET nombre_comprador = $1, telefono = $2, estado = 'vendida', 
             vendida_por = $3, fecha_venta = CURRENT_TIMESTAMP, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id = $4
         RETURNING *`,
        [nombre_comprador, telefono, vendida_por, id]
      );

      await tx.commit();
      logger.info(`Boleta sold: ${id}`);
      return updateResult.rows[0];
    } catch (error) {
      await tx.rollback();
      logger.error(`Error selling boleta ${id}:`, error);
      throw error;
    }
  }

  /**
   * AUTOMATIZACIÓN: Liberar boletas con bloqueo expirado
   * Se ejecuta automáticamente por job y lazy en cada lectura
   * 
   * Casos:
   * 1. Bloqueo temporal - sin cliente: DISPONIBLE + limpiar tokens
   * 2. Reserva formal - con cliente: DISPONIBLE + desvincular cliente y vendedor + limpiar tokens
   */
  async liberarBoletasExpiradas() {
    const tx = await beginTransaction();

    try {
      // 🔹 CASO 1: Bloqueos temporales sin cliente SIN CLIENTE
      const boletasBloqueoSinCliente = await tx.query(
        `UPDATE boletas
         SET estado = 'DISPONIBLE',
             reserva_token = NULL,
             bloqueo_hasta = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE bloqueo_hasta < CURRENT_TIMESTAMP
           AND estado = 'RESERVADA'
           AND cliente_id IS NULL
         RETURNING id`
      );

      const liberadasSinCliente = boletasBloqueoSinCliente.rows.length;

      logger.info(
        `[AUTO] ${liberadasSinCliente} boletas bloqueadas liberadas (sin cliente)`
      );

      // 🔹 CASO 2: Reservas formales CON CLIENTE
      const boletasReservaConCliente = await tx.query(
        `UPDATE boletas
         SET estado = 'DISPONIBLE',
             cliente_id = NULL,
             vendido_por = NULL,
             reserva_token = NULL,
             bloqueo_hasta = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE bloqueo_hasta < CURRENT_TIMESTAMP
           AND estado = 'RESERVADA'
           AND cliente_id IS NOT NULL
         RETURNING id, venta_id`
      );

      const liberadasConCliente = boletasReservaConCliente.rows.length;

      logger.info(
        `[AUTO] ${liberadasConCliente} reservas formales liberadas y desvinculadas`
      );

      await tx.commit();

      return {
        liberadas_bloqueos: liberadasSinCliente,
        liberadas_reservas: liberadasConCliente,
        total: liberadasSinCliente + liberadasConCliente,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      await tx.rollback();
      logger.error('Error liberating expired boletas:', error);
      throw error;
    }
  }
}

module.exports = new BoletaService();
