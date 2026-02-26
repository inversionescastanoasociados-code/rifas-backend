const { query } = require('../../db/pool');
const { beginTransaction } = require('../../db/tx');
const SQL_QUERIES = require('./rifas.sql');
const boletaService = require('../boletas/boletas.service');
const logger = require('../../utils/logger');
const crypto = require('crypto');
const config = require('../../config/env');

class RifaService {
  async createRifa(rifaData) {
    const tx = await beginTransaction();
    
    try {
      const {
        titulo,
        descripcion,
        precio_boleta,
        total_boletas,
        fecha_sorteo,
        estado = 'BORRADOR',
        creado_por
      } = rifaData;

      // Crear la rifa
      const rifaResult = await tx.query(SQL_QUERIES.CREATE_RIFA, [
        titulo, // cambiado de nombre a titulo
        descripcion,
        precio_boleta,
        total_boletas,
        fecha_sorteo,
        estado,
        creado_por
      ]);

      const nuevaRifa = rifaResult.rows[0];
      
      // Ya no se generan boletas automáticamente al crear la rifa
      
      await tx.commit();
      
      logger.info(`Rifa created: ${nuevaRifa.id}`);
      return nuevaRifa;
    } catch (error) {
      await tx.rollback();
      logger.error('Error creating rifa with boletas:', error);
      throw error;
    }
  }

  async getAllRifas(estado = null) {
    try {
      let sqlQuery, params;
      
      if (estado) {
        // Filtrar por estado específico
        sqlQuery = SQL_QUERIES.GET_ALL_RIFAS_BY_ESTADO;
        params = [estado];
      } else {
        // Devolver todas las rifas sin filtrar
        sqlQuery = SQL_QUERIES.GET_ALL_RIFAS;
        params = [];
      }
      
      const result = await query(sqlQuery, params);
      return result.rows;
    } catch (error) {
      logger.error('Error getting rifas:', error);
      throw error;
    }
  }

  async getRifaById(id) {
    try {
      const result = await query(SQL_QUERIES.GET_RIFA_BY_ID, [id]);
      if (result.rows.length === 0) {
        throw new Error('Rifa not found');
      }
      return result.rows[0];
    } catch (error) {
      logger.error(`Error getting rifa ${id}:`, error);
      throw error;
    }
  }

  async updateRifa(id, rifaData) {
    try {
      const {
        titulo,
        descripcion,
        precio_boleta,
        fecha_sorteo,
        estado
      } = rifaData;

      const result = await query(SQL_QUERIES.UPDATE_RIFA, [
        titulo || null,
        descripcion || null,
        precio_boleta || null,
        fecha_sorteo || null,
        estado || null,
        id
      ]);

      if (result.rows.length === 0) {
        throw new Error('Rifa not found');
      }

      logger.info(`Rifa updated: ${id}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error updating rifa ${id}:`, error);
      throw error;
    }
  }

  async deleteRifa(id) {
    try {
      const result = await query(SQL_QUERIES.DELETE_RIFA, [id]);
      if (result.rows.length === 0) {
        throw new Error('Rifa not found');
      }
      logger.info(`Rifa deleted: ${id}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error deleting rifa ${id}:`, error);
      throw error;
    }
  }

  async getRifaStats(id) {
    try {
      const result = await query(SQL_QUERIES.GET_RIFA_STATS, [id]);
      if (result.rows.length === 0) {
        throw new Error('Rifa not found');
      }
      return result.rows[0];
    } catch (error) {
      logger.error(`Error getting rifa stats ${id}:`, error);
      throw error;
    }
  }

  async generateBoletas(rifaId, boletaInfo) {
    const tx = await beginTransaction();
    
    try {
      // Verificar si la rifa existe
      const rifa = await this.getRifaById(rifaId);
      
      // Verificar si ya existen boletas para esta rifa
      const existingBoletas = await tx.query(
        'SELECT COUNT(*) as count FROM boletas WHERE rifa_id = $1',
        [rifaId]
      );
      
      if (parseInt(existingBoletas.rows[0].count) > 0) {
        throw new Error('Esta rifa ya tiene boletas generadas');
      }
      
      const { 
        imagen_url = null,
        diseño_template = 'default',
        qr_base_url = null,
        verificacion_base_url = null
      } = boletaInfo;
      
      // Normalizar URL base de verificación
      // Acepta qr_base_url (del frontend) o verificacion_base_url
      // Si el usuario puso la URL completa con /verificar/, la limpiamos
      const DEFAULT_BASE = process.env.VERIFICACION_URL || 'https://elgrancamion.com';
      let baseUrl = (qr_base_url || verificacion_base_url || DEFAULT_BASE).trim();
      // Quitar trailing slash y /verificar si ya viene incluido
      baseUrl = baseUrl.replace(/\/+$/, '').replace(/\/verificar\/?$/, '');
      
      // Generar hashes HMAC-SHA256 únicos para cada boleta
      const secret = config.verificacion?.secret || config.jwt.secret;
      const startNum = rifa.total_boletas === 10000 ? 0 : 1;
      const endNum = rifa.total_boletas === 10000 ? 9999 : rifa.total_boletas;
      
      // Insertar boletas en lotes de 500 para no sobrecargar la memoria
      const batchSize = 500;
      let totalInserted = 0;
      
      for (let batchStart = startNum; batchStart <= endNum; batchStart += batchSize) {
        const batchEnd = Math.min(batchStart + batchSize - 1, endNum);
        
        // Construir VALUES para el batch
        const values = [];
        const placeholders = [];
        let paramIndex = 1;
        
        for (let num = batchStart; num <= batchEnd; num++) {
          // Generar UUID temporal para el hash (usamos rifaId + numero como semilla)
          const boletaSeed = `${rifaId}:${num}:${Date.now()}`;
          const hash = crypto
            .createHmac('sha256', secret)
            .update(boletaSeed)
            .digest('hex')
            .substring(0, 32);
          
          const barcode = 'R' + rifaId.substring(0, 4) + '-' + num.toString().padStart(4, '0');
          const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(baseUrl + '/verificar/' + hash)}`;
          
          placeholders.push(`($${paramIndex}, $${paramIndex + 1}, 'DISPONIBLE', $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`);
          values.push(rifaId, num, qrUrl, barcode, imagen_url, hash);
          paramIndex += 6;
        }
        
        const insertQuery = `
          INSERT INTO boletas (rifa_id, numero, estado, qr_url, barcode, imagen_url, verificacion_hash, created_at, updated_at)
          VALUES ${placeholders.join(', ')}
        `;
        
        const result = await tx.query(insertQuery, values);
        totalInserted += result.rowCount;
      }
      
      await tx.commit();
      
      logger.info(`Generated ${totalInserted} boletas with verification hashes for rifa ${rifaId}`);
      
      return {
        rifa_id: rifaId,
        total_boletas: rifa.total_boletas,
        boletas_generadas: totalInserted,
        estado: 'DISPONIBLE',
        verificacion_url: baseUrl + '/verificar/',
        imagen_url: imagen_url,
        diseño_template: diseño_template
      };
      
    } catch (error) {
      await tx.rollback();
      logger.error('Error generating boletas:', error);
      throw error;
    }
  }
}

module.exports = new RifaService();
