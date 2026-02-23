const { query } = require('../../db/pool');
const { beginTransaction } = require('../../db/tx');
const SQL_QUERIES = require('./rifas.sql');
const boletaService = require('../boletas/boletas.service');
const logger = require('../../utils/logger');

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
        qr_base_url = 'https://rifas.com/boletas',
        imagen_url = null,
        diseño_template = 'default'
      } = boletaInfo;
      
      let boletaQuery, boletaParams;
      
      if (rifa.total_boletas === 10000) {
        // Para 10000 boletas, generar de 0 a 9999 (4 cifras)
        boletaQuery = `
  INSERT INTO boletas (rifa_id, numero, estado, qr_url, barcode, imagen_url, created_at, updated_at)
  SELECT 
    $1::uuid as rifa_id, 
    generate_series as numero, 
    'DISPONIBLE',
    'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' || $2,
    'R' || SUBSTRING($1::text, 1, 4) || '-' || LPAD(generate_series::text, 4, '0'),    $3,
    CURRENT_TIMESTAMP, 
    CURRENT_TIMESTAMP
  FROM generate_series(0, 9999)
`;
boletaParams = [rifaId, qr_base_url, imagen_url];
      } else {
        // Para otros casos, generar de 1 a total_boletas
        boletaQuery = `
  INSERT INTO boletas (rifa_id, numero, estado, qr_url, barcode, imagen_url, created_at, updated_at)
  SELECT 
    $1::uuid as rifa_id, 
    generate_series as numero, 
    'DISPONIBLE',
    'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=' || $3,
    'R' || SUBSTRING($1::text, 1, 4) || '-' || LPAD(generate_series::text, 4, '0'),    $4,
    CURRENT_TIMESTAMP, 
    CURRENT_TIMESTAMP
  FROM generate_series(1, $2)
`;
boletaParams = [rifaId, rifa.total_boletas, qr_base_url, imagen_url];
      }
      
      const result = await tx.query(boletaQuery, boletaParams);
      
      await tx.commit();
      
      logger.info(`Generated ${rifa.total_boletas} boletas for rifa ${rifaId}`);
      
      return {
        rifa_id: rifaId,
        total_boletas: rifa.total_boletas,
        boletas_generadas: result.rowCount,
        estado: 'DISPONIBLE',
        qr_base_url: qr_base_url,
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
