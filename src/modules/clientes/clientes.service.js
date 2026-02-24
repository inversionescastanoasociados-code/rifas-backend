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
    WHERE c.nombre ILIKE $${paramCount}
       OR c.email ILIKE $${paramCount}
       OR c.telefono ILIKE $${paramCount}
       OR c.identificacion ILIKE $${paramCount}
  `;
        queryParams.push(`%${search}%`);
      }
      
      // Contar total
      const countQuery = `
        SELECT COUNT(*) as total
        FROM clientes c
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
        SELECT 
          c.id, c.nombre, c.telefono, c.email, c.identificacion, c.direccion, c.created_at, c.updated_at,
          COALESCE(bs.total_boletas, 0)::int AS total_boletas,
          COALESCE(bs.pagadas, 0)::int AS boletas_pagadas,
          COALESCE(bs.reservadas, 0)::int AS boletas_reservadas,
          COALESCE(bs.abonadas, 0)::int AS boletas_abonadas,
          COALESCE(bs.deuda_total, 0)::numeric AS deuda_total
        FROM clientes c
        LEFT JOIN LATERAL (
          SELECT 
            COUNT(*) AS total_boletas,
            COUNT(*) FILTER (WHERE b.estado = 'PAGADA') AS pagadas,
            COUNT(*) FILTER (WHERE b.estado = 'RESERVADA') AS reservadas,
            COUNT(*) FILTER (WHERE b.estado = 'ABONADA') AS abonadas,
            COALESCE(SUM(CASE WHEN b.estado IN ('RESERVADA','ABONADA') THEN COALESCE(vd.saldo_pendiente, r.precio_boleta) ELSE 0 END), 0) AS deuda_total
          FROM boletas b
          JOIN rifas r ON b.rifa_id = r.id
          LEFT JOIN venta_detalles vd ON vd.boleta_id = b.id
          WHERE b.cliente_id = c.id
        ) bs ON true
        ${whereClause}
        ORDER BY c.created_at DESC
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

  async getClienteDetalle(id) {
    try {
      // 1. Get client info
      const clienteResult = await query(`
        SELECT id, nombre, telefono, email, identificacion, direccion, created_at, updated_at
        FROM clientes WHERE id = $1
      `, [id]);

      if (clienteResult.rows.length === 0) return null;
      const cliente = clienteResult.rows[0];

      // 2. Get all boletas of this client with rifa info and financial data
      const boletasResult = await query(`
        SELECT 
          b.id AS boleta_id,
          b.numero,
          b.estado,
          b.created_at AS boleta_created_at,
          b.updated_at AS boleta_updated_at,
          r.id AS rifa_id,
          r.nombre AS rifa_nombre,
          r.precio_boleta,
          r.estado AS rifa_estado,
          r.imagen_url AS rifa_imagen,
          v.id AS venta_id,
          v.estado_venta,
          v.monto_total AS venta_monto_total,
          v.abono_total AS venta_abono_total,
          v.saldo_pendiente AS venta_saldo_pendiente,
          COALESCE(vd.precio_unitario, r.precio_boleta) AS precio_unitario,
          COALESCE(vd.abono, 0) AS abono_boleta,
          COALESCE(vd.saldo_pendiente, r.precio_boleta) AS saldo_boleta
        FROM boletas b
        JOIN rifas r ON b.rifa_id = r.id
        LEFT JOIN ventas v ON b.venta_id = v.id
        LEFT JOIN venta_detalles vd ON vd.boleta_id = b.id AND vd.venta_id = v.id
        WHERE b.cliente_id = $1
        ORDER BY r.nombre, b.numero
      `, [id]);

      // 3. Get abonos history for this client
      const abonosResult = await query(`
        SELECT 
          a.id AS abono_id,
          a.monto,
          a.estado,
          a.referencia,
          a.notas,
          a.created_at AS abono_fecha,
          a.gateway_pago,
          mp.nombre AS medio_pago_nombre,
          r.nombre AS rifa_nombre,
          b.numero AS boleta_numero,
          v.id AS venta_id
        FROM abonos a
        JOIN ventas v ON a.venta_id = v.id
        LEFT JOIN medios_pago mp ON a.medio_pago_id = mp.id
        LEFT JOIN boletas b ON a.boleta_id = b.id
        LEFT JOIN rifas r ON v.rifa_id = r.id
        WHERE v.cliente_id = $1
        ORDER BY a.created_at DESC
        LIMIT 50
      `, [id]);

      // 4. Build summary
      const boletas = boletasResult.rows;
      const totalBoletas = boletas.length;
      const boletasPagadas = boletas.filter(b => b.estado === 'PAGADA').length;
      const boletasReservadas = boletas.filter(b => b.estado === 'RESERVADA').length;
      const boletasAbonadas = boletas.filter(b => b.estado === 'ABONADA').length;
      const boletasAnuladas = boletas.filter(b => b.estado === 'ANULADA').length;

      const totalDeuda = boletas.reduce((sum, b) => {
        if (['RESERVADA', 'ABONADA'].includes(b.estado)) {
          return sum + parseFloat(b.saldo_boleta || 0);
        }
        return sum;
      }, 0);

      const totalAbonado = boletas.reduce((sum, b) => {
        return sum + parseFloat(b.abono_boleta || 0);
      }, 0);

      const totalPagado = boletas.reduce((sum, b) => {
        if (b.estado === 'PAGADA') {
          return sum + parseFloat(b.precio_unitario || 0);
        }
        return sum;
      }, 0);

      // 5. Group boletas by rifa
      const rifasMap = {};
      boletas.forEach(b => {
        if (!rifasMap[b.rifa_id]) {
          rifasMap[b.rifa_id] = {
            rifa_id: b.rifa_id,
            rifa_nombre: b.rifa_nombre,
            rifa_estado: b.rifa_estado,
            rifa_imagen: b.rifa_imagen,
            precio_boleta: parseFloat(b.precio_boleta),
            boletas: [],
            resumen: { total: 0, pagadas: 0, reservadas: 0, abonadas: 0, anuladas: 0, deuda: 0, abonado: 0 }
          };
        }
        const rifa = rifasMap[b.rifa_id];
        rifa.boletas.push({
          boleta_id: b.boleta_id,
          numero: b.numero,
          estado: b.estado,
          precio_unitario: parseFloat(b.precio_unitario),
          abono: parseFloat(b.abono_boleta),
          saldo: parseFloat(b.saldo_boleta),
          venta_id: b.venta_id,
          estado_venta: b.estado_venta,
          created_at: b.boleta_created_at
        });
        rifa.resumen.total++;
        if (b.estado === 'PAGADA') rifa.resumen.pagadas++;
        if (b.estado === 'RESERVADA') rifa.resumen.reservadas++;
        if (b.estado === 'ABONADA') rifa.resumen.abonadas++;
        if (b.estado === 'ANULADA') rifa.resumen.anuladas++;
        if (['RESERVADA', 'ABONADA'].includes(b.estado)) {
          rifa.resumen.deuda += parseFloat(b.saldo_boleta || 0);
        }
        rifa.resumen.abonado += parseFloat(b.abono_boleta || 0);
      });

      return {
        cliente,
        resumen: {
          total_boletas: totalBoletas,
          pagadas: boletasPagadas,
          reservadas: boletasReservadas,
          abonadas: boletasAbonadas,
          anuladas: boletasAnuladas,
          total_deuda: totalDeuda,
          total_abonado: totalAbonado,
          total_pagado: totalPagado
        },
        rifas: Object.values(rifasMap),
        abonos: abonosResult.rows
      };

    } catch (error) {
      logger.error('Error in getClienteDetalle service:', error);
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
