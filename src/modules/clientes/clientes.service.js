const { query } = require('../../db/pool');
const logger = require('../../utils/logger');

class ClienteService {
  async createCliente(clienteData) {
    try {
      const { nombre, telefono, email, identificacion, direccion } = clienteData;
      
      const insertQuery = `
        INSERT INTO clientes (nombre, telefono, email, identificacion, direccion)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, nombre, telefono, email, identificacion, direccion, created_at
      `;
      
      const result = await query(insertQuery, [nombre, telefono, email, identificacion, direccion]);
      
      logger.info(`Cliente created: ${result.rows[0].id}`);
      return result.rows[0];
      
    } catch (error) {
      // Manejar errores de unicidad
      if (error.code === '23505') {
        if (error.constraint === 'clientes_email_key') {
          throw new Error('Email already exists');
        }
        if (error.constraint === 'clientes_telefono_key') {
          throw new Error('Phone number already exists');
        }
        if (error.constraint === 'clientes_identificacion_key') {
          throw new Error('Identification already exists');
        }
      }
      logger.error('Error in createCliente service:', error);
      throw error;
    }
  }

  async updateCliente(id, clienteData) {
    try {
      const { nombre, telefono, email, identificacion, direccion } = clienteData;
      
      const updateQuery = `
        UPDATE clientes 
        SET nombre = COALESCE($1, nombre),
            telefono = COALESCE($2, telefono),
            email = COALESCE($3, email),
            identificacion = COALESCE($4, identificacion),
            direccion = COALESCE($5, direccion),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
        RETURNING id, nombre, telefono, email, identificacion, direccion, created_at, updated_at
      `;
      
      const result = await query(updateQuery, [nombre, telefono, email, identificacion, direccion, id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      logger.info(`Cliente updated: ${id}`);
      return result.rows[0];
      
    } catch (error) {
      // Manejar errores de unicidad
      if (error.code === '23505') {
        if (error.constraint === 'clientes_email_key') {
          throw new Error('Email already exists');
        }
        if (error.constraint === 'clientes_telefono_key') {
          throw new Error('Phone number already exists');
        }
        if (error.constraint === 'clientes_identificacion_key') {
          throw new Error('Identification already exists');
        }
      }
      logger.error('Error in updateCliente service:', error);
      throw error;
    }
  }

  async getClienteById(id) {
    try {
      const selectQuery = `
        SELECT id, nombre, telefono, email, identificacion, direccion, created_at, updated_at
        FROM clientes
        WHERE id = $1
      `;
      
      const result = await query(selectQuery, [id]);
      return result.rows[0] || null;
      
    } catch (error) {
      logger.error('Error in getClienteById service:', error);
      throw error;
    }
  }

  async getClienteByIdentificacion(identificacion) {
    try {
      const selectQuery = `
        SELECT id, nombre, telefono, email, identificacion, direccion, created_at, updated_at
        FROM clientes
        WHERE identificacion = $1
      `;
      
      const result = await query(selectQuery, [identificacion]);
      return result.rows[0] || null;
      
    } catch (error) {
      logger.error('Error in getClienteByIdentificacion service:', error);
      throw error;
    }
  }

  async getClienteByCedula(cedula) {
    try {
      const selectQuery = `
        SELECT id, nombre, telefono, email, identificacion, direccion, created_at, updated_at
        FROM clientes
        WHERE identificacion = $1
      `;
      
      const result = await query(selectQuery, [cedula]);
      return result.rows[0] || null;
      
    } catch (error) {
      logger.error('Error in getClienteByCedula service:', error);
      throw error;
    }
  }

  async getAllClientes({ page, limit, search }) {
    try {
      let whereClause = '';
      let queryParams = [];
      let paramCount = 0;
      
      // Búsqueda por nombre o email
      if (search) {
        paramCount++;
        whereClause = `
    WHERE nombre ILIKE $${paramCount}
       OR email ILIKE $${paramCount}
       OR telefono ILIKE $${paramCount}
       OR identificacion ILIKE $${paramCount}
  `;
        queryParams.push(`%${search}%`);
      }
      
      // Contar total
      const countQuery = `
        SELECT COUNT(*) as total
        FROM clientes
        ${whereClause}
      `;
      const countResult = await query(countQuery, queryParams);
      const total = parseInt(countResult.rows[0].total);
      
      // Paginación
      const offset = (page - 1) * limit;
      paramCount++;
      queryParams.push(limit);
      paramCount++;
      queryParams.push(offset);
      
      const selectQuery = `
        SELECT id, nombre, telefono, email, identificacion, direccion, created_at, updated_at
        FROM clientes
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramCount - 1} OFFSET $${paramCount}
      `;
      
      const result = await query(selectQuery, queryParams);
      
      return {
        clientes: result.rows,
        total,
        page,
        limit
      };
      
    } catch (error) {
      logger.error('Error in getAllClientes service:', error);
      throw error;
    }
  }

  async deleteCliente(id) {
    try {
      // Verificar si el cliente tiene ventas o boletas asociadas
      const checkQuery = `
        SELECT 
          (SELECT COUNT(*) FROM ventas WHERE cliente_id = $1) as ventas_count,
          (SELECT COUNT(*) FROM boletas WHERE cliente_id = $1) as boletas_count
      `;
      
      const checkResult = await query(checkQuery, [id]);
      const { ventas_count, boletas_count } = checkResult.rows[0];
      
      if (ventas_count > 0 || boletas_count > 0) {
        throw new Error('Cannot delete client with associated sales or tickets');
      }
      
      const deleteQuery = `
        DELETE FROM clientes
        WHERE id = $1
        RETURNING id
      `;
      
      const result = await query(deleteQuery, [id]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      logger.info(`Cliente deleted: ${id}`);
      return true;
      
    } catch (error) {
      logger.error('Error in deleteCliente service:', error);
      throw error;
    }
  }
}

module.exports = new ClienteService();
