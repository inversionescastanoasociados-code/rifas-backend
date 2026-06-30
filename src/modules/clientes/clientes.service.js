const { query } = require('../../db/pool');
const logger = require('../../utils/logger');

function buildResumenPagoBoleta({
  estado,
  es_actual,
  fue_liberada,
  total_abonado,
  precio_boleta,
  estado_venta
}) {
  const abonado = parseFloat(total_abonado) || 0;
  const precio = parseFloat(precio_boleta) || 0;

  if (estado === 'PAGADA' || estado_venta === 'PAGADA') {
    return 'Pagó completo';
  }

  if (es_actual) {
    if (estado === 'ABONADA' || (estado === 'RESERVADA' && abonado > 0)) {
      if (precio > 0 && abonado >= precio) {
        return 'Pagó completo';
      }
      return `Abonó $${Math.round(abonado).toLocaleString('es-CO')} (saldo pendiente)`;
    }
    if (estado === 'RESERVADA') {
      return 'Reservada sin pago';
    }
    if (estado === 'ANULADA') {
      return 'Anulada';
    }
  }

  if (fue_liberada) {
    if (abonado > 0) {
      return `Abonó $${Math.round(abonado).toLocaleString('es-CO')} y quedó liberada`;
    }
    if (estado === 'RESERVADA' || estado_venta === 'PENDIENTE' || estado_venta === 'EXPIRADA') {
      return 'Reservó y no pagó (liberada)';
    }
    return `Tuvo boleta ${estado || 'asignada'} (liberada)`;
  }

  if (abonado > 0) {
    return `Abonó $${Math.round(abonado).toLocaleString('es-CO')}`;
  }

  return estado ? `Estado: ${estado}` : 'Participó en rifa';
}

function buildResumenFromRifas(rifasList) {
  let totalPagado = 0;

  const resumen = rifasList.reduce((acc, rifa) => {
    acc.total_boletas += rifa.resumen.total;
    acc.pagadas += rifa.resumen.pagadas;
    acc.reservadas += rifa.resumen.reservadas;
    acc.abonadas += rifa.resumen.abonadas;
    acc.anuladas += rifa.resumen.anuladas;
    acc.total_deuda += rifa.resumen.deuda;
    acc.total_abonado += rifa.resumen.abonado;
    return acc;
  }, {
    total_boletas: 0,
    pagadas: 0,
    reservadas: 0,
    abonadas: 0,
    anuladas: 0,
    total_deuda: 0,
    total_abonado: 0,
    total_pagado: 0
  });

  rifasList.forEach((rifa) => {
    rifa.boletas.forEach((b) => {
      if (b.estado === 'PAGADA') {
        totalPagado += b.precio_unitario;
      }
    });
  });

  resumen.total_pagado = totalPagado;
  return resumen;
}

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
      // Manejar errores de unicidad (solo identificacion es único)
      if (error.code === '23505') {
        if (error.constraint === 'clientes_identificacion_key') {
          throw new Error('Ya existe un cliente con esa cédula/identificación');
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
            COALESCE(SUM(
              CASE WHEN b.estado IN ('RESERVADA','ABONADA') THEN
                GREATEST(
                  r.precio_boleta
                  - COALESCE(ab.total_abonado, 0),
                  0
                )
              ELSE 0 END
            ), 0) AS deuda_total
          FROM boletas b
          JOIN rifas r ON b.rifa_id = r.id
          LEFT JOIN ventas v ON b.venta_id = v.id
          LEFT JOIN LATERAL (
            SELECT COUNT(*) AS cnt FROM boletas WHERE venta_id = v.id
          ) bc ON true
          LEFT JOIN LATERAL (
            SELECT COALESCE(SUM(a.monto) FILTER (WHERE a.estado = 'CONFIRMADO'), 0) AS total_abonado
            FROM abonos a WHERE a.boleta_id = b.id
          ) ab ON true
          WHERE b.cliente_id = c.id
            AND r.estado = 'ACTIVA'
            AND b.estado != 'DISPONIBLE'
        ) bs ON true
        ${whereClause}
        ORDER BY c.created_at DESC
        LIMIT $${paramCount - 1} OFFSET $${paramCount}
      `;
      
      const result = await query(selectQuery, queryParams);

      const rifaActualResult = await query(`
        SELECT id, nombre, estado
        FROM rifas
        WHERE estado = 'ACTIVA'
        ORDER BY created_at DESC
        LIMIT 1
      `);
      
      return {
        clientes: result.rows,
        total,
        page,
        limit,
        rifa_actual: rifaActualResult.rows[0] || null
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

      // 2. Get all boletas of this client with rifa info and venta info
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
          r.total_boletas AS rifa_total_boletas,
          v.id AS venta_id,
          v.estado_venta,
          v.monto_total AS venta_monto_total,
          COALESCE(
            (SELECT COUNT(*) FROM boletas WHERE venta_id = v.id),
            1
          ) AS boletas_en_venta
        FROM boletas b
        JOIN rifas r ON b.rifa_id = r.id
        LEFT JOIN ventas v ON b.venta_id = v.id
        WHERE b.cliente_id = $1
        ORDER BY r.nombre, b.numero
      `, [id]);

      // 3. Get all abonos grouped by boleta_id to compute real financial data
      const abonosPorBoletaResult = await query(`
        SELECT 
          a.boleta_id,
          COALESCE(SUM(a.monto) FILTER (WHERE a.estado = 'CONFIRMADO'), 0) AS total_abonado
        FROM abonos a
        JOIN ventas v ON a.venta_id = v.id
        WHERE v.cliente_id = $1
        GROUP BY a.boleta_id
      `, [id]);

      // Build a map: boleta_id -> total_abonado
      const abonoMap = {};
      abonosPorBoletaResult.rows.forEach(row => {
        abonoMap[row.boleta_id] = parseFloat(row.total_abonado);
      });

      // 4. Get abonos history for this client
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

      // 5. Group boletas by rifa
      const boletas = boletasResult.rows;
      const getBoletaPrecio = (b) => parseFloat(b.precio_boleta);

      const rifasMap = {};
      boletas.forEach(b => {
        const precio = getBoletaPrecio(b);
        const abonado = abonoMap[b.boleta_id] || 0;
        const saldo = Math.max(precio - abonado, 0);

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
          precio_unitario: precio,
          abono: abonado,
          saldo: b.estado === 'PAGADA' ? 0 : saldo,
          venta_id: b.venta_id,
          estado_venta: b.estado_venta,
          created_at: b.boleta_created_at
        });
        rifa.resumen.total++;
        if (b.estado === 'PAGADA') rifa.resumen.pagadas++;
        if (b.estado === 'RESERVADA') rifa.resumen.reservadas++;
        if (b.estado === 'ABONADA') rifa.resumen.abonadas++;
        if (b.estado === 'ANULADA') rifa.resumen.anuladas++;

        if (b.estado === 'PAGADA') {
          rifa.resumen.abonado += precio;
        } else if (['RESERVADA', 'ABONADA'].includes(b.estado)) {
          rifa.resumen.deuda += saldo;
          rifa.resumen.abonado += abonado;
        }
      });

      const allRifas = Object.values(rifasMap);
      const rifasActuales = allRifas.filter((r) => r.rifa_estado === 'ACTIVA');
      const rifasPasadas = allRifas.filter((r) => r.rifa_estado !== 'ACTIVA');
      const rifaActual = rifasActuales[0] || null;

      return {
        cliente,
        rifa_actual: rifaActual
          ? {
              id: rifaActual.rifa_id,
              nombre: rifaActual.rifa_nombre,
              estado: rifaActual.rifa_estado
            }
          : null,
        resumen: buildResumenFromRifas(rifasActuales),
        rifas: rifasActuales,
        resumen_pasadas: buildResumenFromRifas(rifasPasadas),
        rifas_pasadas: rifasPasadas,
        abonos: abonosResult.rows
      };

    } catch (error) {
      logger.error('Error in getClienteDetalle service:', error);
      throw error;
    }
  }

  async buscarClientesSimilares({ q, limit = 8, rifaIdActual = null }) {
    try {
      const searchTerm = (q || '').trim();
      if (searchTerm.length < 3) {
        return [];
      }

      const likePattern = `%${searchTerm}%`;
      const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 8, 1), 15);

      const selectQuery = `
        WITH matched AS (
          SELECT
            c.id,
            c.nombre,
            c.telefono,
            c.identificacion,
            c.email,
            GREATEST(
              word_similarity($1, c.nombre),
              CASE WHEN c.nombre ILIKE $2 THEN 0.4 ELSE 0 END,
              CASE WHEN c.identificacion ILIKE $2 THEN 0.6 ELSE 0 END
            ) AS score
          FROM clientes c
          WHERE c.nombre ILIKE $2
             OR c.identificacion ILIKE $2
             OR word_similarity($1, c.nombre) > 0.3
          ORDER BY score DESC, c.nombre ASC
          LIMIT $3
        )
        SELECT
          m.id,
          m.nombre,
          m.telefono,
          m.identificacion,
          m.email,
          m.score,
          COALESCE(
            (
              SELECT json_agg(limited ORDER BY limited.orden, limited.rifa_nombre, limited.numero)
              FROM (
                SELECT *
                FROM (
                  SELECT DISTINCT ON (u.rifa_id, u.numero)
                    u.numero,
                    u.estado,
                    u.rifa_nombre,
                    u.rifa_estado,
                    u.rifa_id,
                    u.es_actual,
                    u.fue_liberada,
                    u.total_abonado,
                    u.estado_venta,
                    u.precio_boleta,
                    u.orden
                  FROM (
                  SELECT
                    b.numero,
                    b.estado::text AS estado,
                    r.nombre AS rifa_nombre,
                    r.estado::text AS rifa_estado,
                    r.id AS rifa_id,
                    true AS es_actual,
                    false AS fue_liberada,
                    COALESCE(ab.total_abonado, 0) AS total_abonado,
                    v.estado_venta::text AS estado_venta,
                    r.precio_boleta,
                    1 AS prioridad,
                    CASE
                      WHEN r.estado = 'TERMINADA' THEN 0
                      WHEN $4::uuid IS NOT NULL AND r.id = $4::uuid THEN 2
                      ELSE 1
                    END AS orden
                  FROM boletas b
                  JOIN rifas r ON r.id = b.rifa_id
                  LEFT JOIN ventas v ON v.id = b.venta_id
                  LEFT JOIN LATERAL (
                    SELECT COALESCE(SUM(a.monto) FILTER (WHERE a.estado = 'CONFIRMADO'), 0) AS total_abonado
                    FROM abonos a
                    WHERE a.boleta_id = b.id
                  ) ab ON true
                  WHERE b.cliente_id = m.id
                    AND b.estado != 'DISPONIBLE'

                  UNION ALL

                  SELECT
                    ha.numero,
                    COALESCE(ha.estado_al_liberar, ha.ultimo_estado, 'DESCONOCIDO') AS estado,
                    r.nombre AS rifa_nombre,
                    r.estado::text AS rifa_estado,
                    r.id AS rifa_id,
                    false AS es_actual,
                    ha.fue_liberada,
                    GREATEST(
                      COALESCE(ha.total_abonado_hist, 0),
                      COALESCE(ha.total_abonado_venta, 0)
                    ) AS total_abonado,
                    ha.estado_venta,
                    r.precio_boleta,
                    2 AS prioridad,
                    CASE
                      WHEN r.estado = 'TERMINADA' THEN 0
                      WHEN $4::uuid IS NOT NULL AND r.id = $4::uuid THEN 2
                      ELSE 1
                    END AS orden
                  FROM (
                    SELECT
                      h.rifa_id,
                      h.numero,
                      (
                        SELECT h2.estado_anterior
                        FROM historial_movimientos h2
                        WHERE (h2.cliente_id = m.id OR h2.cliente_id_anterior = m.id)
                          AND h2.rifa_id = h.rifa_id
                          AND h2.numero = h.numero
                          AND h2.accion IN ('LIBERAR_CLIENTE', 'LIBERAR_BOLETA')
                        ORDER BY h2.created_at DESC
                        LIMIT 1
                      ) AS estado_al_liberar,
                      (
                        SELECT h2.estado_nuevo
                        FROM historial_movimientos h2
                        WHERE (h2.cliente_id = m.id OR h2.cliente_id_anterior = m.id)
                          AND h2.rifa_id = h.rifa_id
                          AND h2.numero = h.numero
                          AND h2.entidad = 'BOLETA'
                          AND h2.estado_nuevo IS NOT NULL
                          AND h2.estado_nuevo <> 'DISPONIBLE'
                        ORDER BY h2.created_at DESC
                        LIMIT 1
                      ) AS ultimo_estado,
                      EXISTS (
                        SELECT 1
                        FROM historial_movimientos h2
                        WHERE (h2.cliente_id = m.id OR h2.cliente_id_anterior = m.id)
                          AND h2.rifa_id = h.rifa_id
                          AND h2.numero = h.numero
                          AND h2.accion IN ('LIBERAR_CLIENTE', 'LIBERAR_BOLETA')
                      ) AS fue_liberada,
                      (
                        SELECT COALESCE(SUM(h2.monto), 0)
                        FROM historial_movimientos h2
                        WHERE h2.cliente_id = m.id
                          AND h2.rifa_id = h.rifa_id
                          AND h2.numero = h.numero
                          AND h2.entidad = 'ABONO'
                          AND h2.accion IN ('ABONO_CONFIRMADO', 'ABONO_REGISTRADO')
                      ) AS total_abonado_hist,
                      (
                        SELECT COALESCE(SUM(a.monto), 0)
                        FROM abonos a
                        JOIN ventas v ON v.id = a.venta_id
                        JOIN boletas bx ON bx.id = a.boleta_id
                        WHERE v.cliente_id = m.id
                          AND bx.rifa_id = h.rifa_id
                          AND bx.numero = h.numero
                          AND a.estado = 'CONFIRMADO'
                      ) AS total_abonado_venta,
                      (
                        SELECT v.estado_venta::text
                        FROM historial_movimientos h2
                        JOIN ventas v ON v.id = h2.venta_id
                        WHERE (h2.cliente_id = m.id OR h2.cliente_id_anterior = m.id)
                          AND h2.rifa_id = h.rifa_id
                          AND h2.numero = h.numero
                          AND h2.venta_id IS NOT NULL
                        ORDER BY h2.created_at DESC
                        LIMIT 1
                      ) AS estado_venta
                    FROM historial_movimientos h
                    WHERE (h.cliente_id = m.id OR h.cliente_id_anterior = m.id)
                      AND h.rifa_id IS NOT NULL
                      AND h.numero IS NOT NULL
                    GROUP BY h.rifa_id, h.numero
                  ) ha
                  JOIN rifas r ON r.id = ha.rifa_id

                  UNION ALL

                  SELECT
                    b.numero,
                    CASE
                      WHEN b.estado = 'PAGADA' THEN 'PAGADA'
                      WHEN v.estado_venta = 'PAGADA' THEN 'PAGADA'
                      WHEN b.estado = 'ABONADA' OR v.estado_venta = 'ABONADA' THEN 'ABONADA'
                      WHEN b.estado = 'ANULADA' THEN 'ANULADA'
                      ELSE 'RESERVADA'
                    END AS estado,
                    r.nombre AS rifa_nombre,
                    r.estado::text AS rifa_estado,
                    r.id AS rifa_id,
                    false AS es_actual,
                    (b.estado = 'DISPONIBLE' AND b.cliente_id IS NULL) AS fue_liberada,
                    GREATEST(
                      COALESCE(v.abono_total, 0),
                      COALESCE(vd.abono, 0),
                      COALESCE(ab.total_abonado, 0)
                    ) AS total_abonado,
                    v.estado_venta::text AS estado_venta,
                    r.precio_boleta,
                    3 AS prioridad,
                    CASE
                      WHEN r.estado = 'TERMINADA' THEN 0
                      WHEN $4::uuid IS NOT NULL AND r.id = $4::uuid THEN 2
                      ELSE 1
                    END AS orden
                  FROM ventas v
                  JOIN rifas r ON r.id = v.rifa_id
                  LEFT JOIN venta_detalles vd ON vd.venta_id = v.id
                  LEFT JOIN boletas b ON b.id = COALESCE(vd.boleta_id, (
                    SELECT b2.id FROM boletas b2 WHERE b2.venta_id = v.id ORDER BY b2.numero LIMIT 1
                  ))
                  LEFT JOIN LATERAL (
                    SELECT COALESCE(SUM(a.monto) FILTER (WHERE a.estado = 'CONFIRMADO'), 0) AS total_abonado
                    FROM abonos a
                    WHERE a.venta_id = v.id
                  ) ab ON true
                  WHERE v.cliente_id = m.id
                    AND b.id IS NOT NULL
                ) u
                ORDER BY u.rifa_id, u.numero, u.prioridad ASC
                ) deduped
                ORDER BY deduped.orden, deduped.rifa_nombre, deduped.numero
                LIMIT 8
              ) limited
            ),
            '[]'::json
          ) AS boletas
        FROM matched m
        ORDER BY m.score DESC, m.nombre ASC
      `;

      const result = await query(selectQuery, [
        searchTerm,
        likePattern,
        safeLimit,
        rifaIdActual
      ]);

      return result.rows.map((row) => ({
        id: row.id,
        nombre: row.nombre,
        telefono: row.telefono,
        identificacion: row.identificacion,
        email: row.email,
        score: parseFloat(row.score),
        boletas: (row.boletas || []).map((boleta) => ({
          numero: boleta.numero,
          estado: boleta.estado,
          rifa_nombre: boleta.rifa_nombre,
          rifa_estado: boleta.rifa_estado,
          rifa_id: boleta.rifa_id,
          es_actual: Boolean(boleta.es_actual),
          fue_liberada: Boolean(boleta.fue_liberada),
          total_abonado: parseFloat(boleta.total_abonado) || 0,
          estado_venta: boleta.estado_venta || null,
          resumen_pago: buildResumenPagoBoleta({
            estado: boleta.estado,
            es_actual: Boolean(boleta.es_actual),
            fue_liberada: Boolean(boleta.fue_liberada),
            total_abonado: boleta.total_abonado,
            precio_boleta: boleta.precio_boleta,
            estado_venta: boleta.estado_venta
          })
        }))
      }));
    } catch (error) {
      logger.error('Error in buscarClientesSimilares service:', error);
      throw error;
    }
  }

  async getNextIdentificacion() {
    try {
      const result = await query(`
        SELECT MAX(identificacion::int) AS max_num
        FROM clientes
        WHERE identificacion ~ '^[0-9]{5}$'
      `);

      let nextNum = 1;
      if (result.rows.length > 0 && result.rows[0].max_num !== null) {
        nextNum = parseInt(result.rows[0].max_num, 10) + 1;
      }

      const nextIdentificacion = String(nextNum).padStart(5, '0');
      return nextIdentificacion;
    } catch (error) {
      logger.error('Error in getNextIdentificacion service:', error);
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
