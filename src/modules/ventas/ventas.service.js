const { query } = require('../../db/pool');
const { beginTransaction } = require('../../db/tx');
const SQL_QUERIES = require('./ventas.sql');
const logger = require('../../utils/logger');

class VentaService {
  /**
   * CREAR RESERVA FORMAL
   * Inserta en tabla ventas con monto_total = 0 y estado_venta = 'PENDIENTE'
   * Bloquea boletas por varios días vinculadas a esta venta
   * 
   * Diferencia vs venta:
   * - Reserva: monto_total = 0, estado_venta = 'PENDIENTE', bloqueo largo
   * - Venta: monto_total > 0, estado_venta = 'PAGADA'/'ABONADA'
   * 
   * Boletas apuntan a venta.id (como abonos)
   */
  async crearReservaFormal(reservaData) {
  const tx = await beginTransaction();

  try {
    const {
      rifa_id,
      cliente,
      boletas,
      dias_bloqueo = 3,
      notas,
      reservada_por
    } = reservaData;

    // 🔹 1️⃣ Obtener rifa (precio incluido)
    const rifaResult = await tx.query(
      `SELECT id, nombre, precio_boleta FROM rifas WHERE id = $1`,
      [rifa_id]
    );

    if (rifaResult.rows.length === 0) {
      throw new Error('Rifa no encontrada');
    }

    const rifa = rifaResult.rows[0];
    const precioBoleta = Number(rifa.precio_boleta);

    if (!precioBoleta || precioBoleta <= 0) {
      throw new Error('Precio de boleta inválido en la rifa');
    }

    // 🔹 2️⃣ Buscar o crear cliente
    let clienteId;

    let clienteResult = await tx.query(
      'SELECT id FROM clientes WHERE telefono = $1 LIMIT 1',
      [cliente.telefono]
    );

    if (clienteResult.rows.length === 0 && cliente.identificacion) {
      clienteResult = await tx.query(
        'SELECT id FROM clientes WHERE identificacion = $1 LIMIT 1',
        [cliente.identificacion]
      );
    }

    if (clienteResult.rows.length > 0) {
      clienteId = clienteResult.rows[0].id;
    } else {
      const newCliente = await tx.query(
        `INSERT INTO clientes 
         (nombre, telefono, email, direccion, identificacion) 
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          cliente.nombre,
          cliente.telefono,
          cliente.email || null,
          cliente.direccion || null,
          cliente.identificacion || null
        ]
      );
      clienteId = newCliente.rows[0].id;
    }

    // 🔹 3️⃣ Validar boletas
    const boletasReservadas = [];
    const tiempoBloqueoMinutos = dias_bloqueo * 24 * 60;

    for (const boletaId of boletas) {
      const boletaCheck = await tx.query(
        `SELECT id, numero, estado
         FROM boletas
         WHERE id = $1 AND rifa_id = $2
         FOR UPDATE`,
        [boletaId, rifa_id]
      );

      if (boletaCheck.rows.length === 0) {
        throw new Error(`Boleta ${boletaId} no existe en esta rifa`);
      }

      const boleta = boletaCheck.rows[0];

      if (['PAGADA', 'VENDIDA'].includes(boleta.estado)) {
        throw new Error(`Boleta #${boleta.numero} ya fue vendida`);
      }

      boletasReservadas.push({
        id: boletaId,
        numero: boleta.numero
      });
    }

    // 🔹 4️⃣ Calcular MONTO REAL DE LA RESERVA ✅
    const cantidadBoletas = boletasReservadas.length;
    const montoTotal = precioBoleta * cantidadBoletas;

    // 🔹 5️⃣ Crear venta (RESERVA FORMAL)
    const ventaResult = await tx.query(
      `INSERT INTO ventas (
        rifa_id,
        cliente_id,
        monto_total,
        estado_venta,
        notas_admin,
        vendedor_id,
        created_at
      ) VALUES ($1, $2, $3, 'PENDIENTE', $4, $5, CURRENT_TIMESTAMP)
      RETURNING *`,
      [
        rifa_id,
        clienteId,
        montoTotal,
        notas || null,
        reservada_por
      ]
    );

    const venta = ventaResult.rows[0];

    // 🔹 6️⃣ Bloquear boletas
    const bloqueoHasta = new Date();
    bloqueoHasta.setMinutes(bloqueoHasta.getMinutes() + tiempoBloqueoMinutos);

    for (const boletaInfo of boletasReservadas) {
      const reservaToken = require('crypto')
        .randomBytes(32)
        .toString('hex');

      await tx.query(
        `UPDATE boletas
         SET estado = 'RESERVADA',
             venta_id = $1,
             cliente_id = $2,
             vendido_por = $3,
             reserva_token = $4,
             bloqueo_hasta = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $6`,
        [
          venta.id,
          clienteId,
          reservada_por,
          reservaToken,
          bloqueoHasta,
          boletaInfo.id
        ]
      );
    }

    await tx.commit();

    return {
      reserva_id: venta.id,
      tipo: 'RESERVA_FORMAL',
      rifa_id,
      cliente_id: clienteId,
      cantidad_boletas: cantidadBoletas,
      monto_total: montoTotal,
      estado_venta: 'PENDIENTE',
      bloqueo_hasta: bloqueoHasta,
      boletas_reservadas: boletasReservadas,
      created_at: venta.created_at,
      notas
    };

  } catch (error) {
    await tx.rollback();
    logger.error('Error creating reserva formal:', error);
    throw error;
  }
}
  /**
   * CONVERTIR RESERVA EN VENTA
   * Toma una reserva (venta con monto_total=0, estado='PENDIENTE')
   * y la convierte en venta real con pago
   */
  async convertirReservaEnVenta(ventaId, pagoData) {
    const tx = await beginTransaction();

    try {
      const { monto_total, total_pagado, medio_pago_id } = pagoData;

      // 🔹 1️⃣ Obtener la reserva (venta con monto=0)
      const ventaResult = await tx.query(
        `SELECT * FROM ventas WHERE id = $1 AND monto_total = 0 AND estado_venta = 'PENDIENTE' FOR UPDATE`,
        [ventaId]
      );

      if (ventaResult.rows.length === 0) {
        throw new Error('Reserva no encontrada o no está en estado PENDIENTE');
      }

      const venta = ventaResult.rows[0];
      const clienteId = venta.cliente_id;

      // 🔹 2️⃣ Obtener boletas vinculadas a esta venta
      const boletasResult = await tx.query(
        `SELECT id FROM boletas WHERE venta_id = $1`,
        [ventaId]
      );

      if (boletasResult.rows.length === 0) {
        throw new Error('La reserva no tiene boletas asociadas');
      }

      const boletas = boletasResult.rows;
      const cantidadBoletas = boletas.length;

      // 🔹 3️⃣ Validar medio de pago
      const medioPagoCheck = await tx.query(
        `SELECT id FROM medios_pago WHERE id = $1`,
        [medio_pago_id]
      );

      if (medioPagoCheck.rows.length === 0) {
        throw new Error('Medio de pago no válido');
      }

      // 🔹 4️⃣ Calcular estado según pago
      const saldo_pendiente = monto_total - total_pagado;
      const esPagoCompleto = total_pagado >= monto_total;
      const esAbono = total_pagado > 0 && total_pagado < monto_total;

      let nuevoEstado = 'PAGADA';
      if (esAbono) {
        nuevoEstado = 'ABONADA';
      }

      // 🔹 5️⃣ Actualizar VENTA: monto y estado
      await tx.query(
        `UPDATE ventas
         SET monto_total = $1,
             estado_venta = $2,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $3`,
        [monto_total, nuevoEstado, ventaId]
      );

      // 🔹 6️⃣ Crear ABONOS por cada boleta
      const montoPorBoleta = total_pagado / cantidadBoletas;

      for (const boleta of boletas) {
        await tx.query(
          `INSERT INTO abonos (
            venta_id,
            boleta_id,
            monto,
            estado,
            medio_pago_id,
            moneda,
            registrado_por,
            notas,
            created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
          [
            ventaId,
            boleta.id,
            montoPorBoleta,
            'CONFIRMADO',
            medio_pago_id,
            'COP',
            venta.vendida_por,
            esAbono ? 'Abono inicial (convertida de reserva)' : 'Pago completo (convertida de reserva)'
          ]
        );
      }

      // 🔹 7️⃣ Actualizar BOLETAS: estado = PAGADA/ABONADA
      const estadoBoleta = nuevoEstado === 'PAGADA' ? 'PAGADA' : 'ABONADA';
      await tx.query(
        `UPDATE boletas
         SET estado = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE venta_id = $2`,
        [estadoBoleta, ventaId]
      );

      await tx.commit();

      logger.info(`Reserva convertida a venta: ${ventaId}, monto=${monto_total}, estado=${nuevoEstado}`);

      return {
        venta_id: ventaId,
        tipo: 'VENTA_CONVERTIDA',
        cliente_id: clienteId,
        cantidad_boletas: cantidadBoletas,
        monto_total,
        total_pagado,
        saldo_pendiente,
        estado_venta: nuevoEstado,
        updated_at: new Date()
      };

    } catch (error) {
      await tx.rollback();
      logger.error('Error converting reserva to venta:', error);
      throw error;
    }
  }

  /**
   * CANCELAR RESERVA
   * Borra la venta (reserva) y libera todas las boletas
   */
  async cancelarReserva(ventaId, motivoCancelacion) {
    const tx = await beginTransaction();

    try {
      // 🔹 1️⃣ Obtener la reserva
      const ventaResult = await tx.query(
        `SELECT * FROM ventas WHERE id = $1 AND monto_total = 0 AND estado_venta = 'PENDIENTE' FOR UPDATE`,
        [ventaId]
      );

      if (ventaResult.rows.length === 0) {
        throw new Error('Reserva no encontrada o no está en estado PENDIENTE');
      }

      // 🔹 2️⃣ Obtener boletas vinculadas
      const boletasResult = await tx.query(
        `SELECT id FROM boletas WHERE venta_id = $1`,
        [ventaId]
      );

      const boletas = boletasResult.rows;

      // 🔹 3️⃣ Liberar todas las boletas
      await tx.query(
        `UPDATE boletas
         SET estado = 'DISPONIBLE',
             venta_id = NULL,
             cliente_id = NULL,
             vendido_por = NULL,
             reserva_token = NULL,
             bloqueo_hasta = NULL,
             updated_at = CURRENT_TIMESTAMP
         WHERE venta_id = $1`,
        [ventaId]
      );

      // 🔹 4️⃣ Actualizar venta: CANCELADA
      await tx.query(
        `UPDATE ventas
         SET estado_venta = 'CANCELADA',
             notas = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [motivoCancelacion || 'Cancelación de reserva', ventaId]
      );

      await tx.commit();

      logger.info(`Reserva cancelada: ${ventaId}, ${boletas.length} boletas liberadas`);

      return {
        reserva_id: ventaId,
        boletas_liberadas: boletas.length,
        estado_venta: 'CANCELADA',
        motivo: motivoCancelacion,
        updated_at: new Date()
      };

    } catch (error) {
      await tx.rollback();
      logger.error('Error cancelling reserva:', error);
      throw error;
    }
  }

  async createVenta(ventaData) {
    const tx = await beginTransaction();

    try {
      const {
  rifa_id,
  cliente,
  boletas,
  medio_pago_id,
  total_venta,
  total_pagado,
  notas,
  vendida_por
} = ventaData;


      // 🔹 1️⃣ Obtener precio_boleta desde rifas
      const rifaResult = await tx.query(
        `SELECT precio_boleta FROM rifas WHERE id = $1`,
        [rifa_id]
      );

      if (rifaResult.rows.length === 0) {
        throw new Error('Rifa no encontrada');
      }

      const precioBoleta = Number(rifaResult.rows[0].precio_boleta);

      // 🔹 2️⃣ Buscar o crear cliente
      let clienteId;

      let clienteResult = await tx.query(
        'SELECT id FROM clientes WHERE telefono = $1 LIMIT 1',
        [cliente.telefono]
      );

      if (clienteResult.rows.length === 0 && cliente.identificacion) {
        clienteResult = await tx.query(
          'SELECT id FROM clientes WHERE identificacion = $1 LIMIT 1',
          [cliente.identificacion]
        );
      }

      if (clienteResult.rows.length > 0) {
        clienteId = clienteResult.rows[0].id;
      } else {
        const newCliente = await tx.query(
          `INSERT INTO clientes 
           (nombre, telefono, email, direccion, identificacion) 
           VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [
            cliente.nombre,
            cliente.telefono,
            cliente.email || null,
            cliente.direccion || null,
            cliente.identificacion || null
          ]
        );
        clienteId = newCliente.rows[0].id;
      }

      // 🔹 3️⃣ Calcular estados
      const saldo_pendiente = total_venta - total_pagado;
      const esPagoCompleto = total_pagado >= total_venta;
      const esAbono = total_pagado > 0 && total_pagado < total_venta;

      // 🔹 4️⃣ Crear venta
      const ventaResult = await tx.query(
        `INSERT INTO ventas (
          rifa_id,
          cliente_id,
          monto_total,
          created_at
        ) VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
        RETURNING *`,
        [rifa_id, clienteId, total_venta]
      );

      const venta = ventaResult.rows[0];

      const medioPagoCheck = await tx.query(
  `SELECT id FROM medios_pago WHERE id = $1`,
  [medio_pago_id]
);

if (medioPagoCheck.rows.length === 0) {
  throw new Error('Medio de pago no válido');
}


      const medioPagoId = medio_pago_id || null;


      // 🔹 Calcular monto por boleta
      let montoPorBoleta = 0;
      if (total_pagado > 0) {
        montoPorBoleta = total_pagado / boletas.length;
      }

      // 🔹 5️⃣ Procesar cada boleta
      for (const boletaInfo of boletas) {
        const { id, reserva_token } = boletaInfo;

        const boletaCheck = await tx.query(
          `SELECT id 
           FROM boletas 
           WHERE id = $1 
           AND reserva_token = $2 
           AND bloqueo_hasta > CURRENT_TIMESTAMP`,
          [id, reserva_token]
        );

        if (boletaCheck.rows.length === 0) {
          throw new Error(`Boleta ${id} no está bloqueada o token inválido`);
        }

        let nuevoEstado = 'PAGADA';
        if (esAbono) {
          nuevoEstado = 'ABONADA';
        }

        await tx.query(
  `UPDATE boletas
   SET estado = $1,
       cliente_id = $2,
       vendido_por = $3,
       venta_id = $4,
       reserva_token = NULL,
       bloqueo_hasta = NULL,
       updated_at = CURRENT_TIMESTAMP
   WHERE id = $5`,
  [nuevoEstado, clienteId, vendida_por, venta.id, id]
);


        if (total_pagado > 0) {
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
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,CURRENT_TIMESTAMP)`,
            [
              venta.id,
              vendida_por,
              id,
              medioPagoId,
              montoPorBoleta,
              'COP',
              'CONFIRMADO',
              esAbono ? 'Abono inicial' : 'Pago completo'
            ]
          );
        }

        // 🔥 Validar si ya pagó completamente
        const totalAbonadoResult = await tx.query(
          `SELECT COALESCE(SUM(monto),0) as total
           FROM abonos
           WHERE boleta_id = $1`,
          [id]
        );

        const totalAbonado = Number(totalAbonadoResult.rows[0].total);

        if (totalAbonado >= precioBoleta) {
          await tx.query(
            `UPDATE boletas SET estado = 'PAGADA' WHERE id = $1`,
            [id]
          );
        }
      }

      await tx.commit();

      return {
        ...venta,
        total_venta,
        total_pagado,
        saldo_pendiente,
        boletas_vendidas: boletas.length
      };

    } catch (error) {
      await tx.rollback();
      logger.error('Error creating venta:', error);
      throw error;
    }
  }



  async getAllVentas() {
    try {
      const result = await query(SQL_QUERIES.GET_ALL_VENTAS);
      return result.rows;
    } catch (error) {
      logger.error('Error getting ventas:', error);
      throw error;
    }
  }

  async getVentasByRifa(rifa_id) {
    try {
      const result = await query(SQL_QUERIES.GET_VENTAS_BY_RIFA, [rifa_id]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting ventas by rifa:', error);
      throw error;
    }
  }

  async getVentasByVendedor(vendedor_id) {
    try {
      const result = await query(SQL_QUERIES.GET_VENTAS_BY_VENDEDOR, [vendedor_id]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting ventas by vendedor:', error);
      throw error;
    }
  }

  async getVentaById(id) {
    try {
      const result = await query(SQL_QUERIES.GET_VENTA_BY_ID, [id]);
      if (result.rows.length === 0) {
        throw new Error('Venta not found');
      }
      return result.rows[0];
    } catch (error) {
      logger.error(`Error getting venta ${id}:`, error);
      throw error;
    }
  }

  async updateVenta(id, ventaData, actualizada_por) {
    try {
      const {
        cliente_nombre,
        cliente_telefono,
        total_boletas,
        monto_total,
        estado
      } = ventaData;

      const result = await query(SQL_QUERIES.UPDATE_VENTA, [
        cliente_nombre,
        cliente_telefono,
        total_boletas,
        monto_total,
        estado,
        actualizada_por,
        id
      ]);

      if (result.rows.length === 0) {
        throw new Error('Venta not found');
      }

      logger.info(`Venta updated: ${id}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error updating venta ${id}:`, error);
      throw error;
    }
  }

  async updateVentaStatus(id, estado, actualizada_por) {
    try {
      const result = await query(SQL_QUERIES.UPDATE_VENTA_STATUS, [
        estado,
        actualizada_por,
        id
      ]);

      if (result.rows.length === 0) {
        throw new Error('Venta not found');
      }

      logger.info(`Venta status updated: ${id} to ${estado}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error updating venta status ${id}:`, error);
      throw error;
    }
  }

  async deleteVenta(id) {
    try {
      const result = await query(SQL_QUERIES.DELETE_VENTA, [id]);
      if (result.rows.length === 0) {
        throw new Error('Venta not found');
      }
      logger.info(`Venta deleted: ${id}`);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error deleting venta ${id}:`, error);
      throw error;
    }
  }

  async getVentasStats(rifa_id) {
    try {
      const result = await query(SQL_QUERIES.GET_VENTAS_STATS, [rifa_id]);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error getting ventas stats for rifa ${rifa_id}:`, error);
      throw error;
    }
  }

  async getVentasStatsByVendedor(vendedor_id) {
    try {
      const result = await query(SQL_QUERIES.GET_VENTAS_STATS_BY_VENDEDOR, [vendedor_id]);
      return result.rows[0];
    } catch (error) {
      logger.error(`Error getting ventas stats for vendedor ${vendedor_id}:`, error);
      throw error;
    }
  }

  async getVentasByDateRange(fecha_inicio, fecha_fin) {
    try {
      const result = await query(SQL_QUERIES.GET_VENTAS_BY_DATE_RANGE, [fecha_inicio, fecha_fin]);
      return result.rows;
    } catch (error) {
      logger.error('Error getting ventas by date range:', error);
      throw error;
    }
  }

  async completeVenta(id, actualizada_por) {
    const tx = await beginTransaction();
    
    try {
      const ventaResult = await tx.query(
        'SELECT * FROM ventas WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (ventaResult.rows.length === 0) {
        await tx.rollback();
        throw new Error('Venta not found');
      }

      const venta = ventaResult.rows[0];
      if (venta.estado !== 'pendiente') {
        await tx.rollback();
        throw new Error('Venta cannot be completed');
      }

      const updateResult = await tx.query(
        `UPDATE ventas 
         SET estado = 'completada', actualizada_por = $1, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING *`,
        [actualizada_por, id]
      );

      await tx.commit();
      logger.info(`Venta completed: ${id}`);
      return updateResult.rows[0];
    } catch (error) {
      await tx.rollback();
      logger.error(`Error completing venta ${id}:`, error);
      throw error;
    }
  }

  async cancelVenta(id, motivo, actualizada_por) {
    const tx = await beginTransaction();
    
    try {
      const ventaResult = await tx.query(
        'SELECT * FROM ventas WHERE id = $1 FOR UPDATE',
        [id]
      );

      if (ventaResult.rows.length === 0) {
        await tx.rollback();
        throw new Error('Venta not found');
      }

      const venta = ventaResult.rows[0];
      if (venta.estado === 'completada') {
        await tx.rollback();
        throw new Error('Completed venta cannot be cancelled');
      }

      const updateResult = await tx.query(
        `UPDATE ventas 
         SET estado = 'cancelada', motivo_cancelacion = $1, actualizada_por = $2, fecha_actualizacion = CURRENT_TIMESTAMP
         WHERE id = $3
         RETURNING *`,
        [motivo, actualizada_por, id]
      );

      await tx.commit();
      logger.info(`Venta cancelled: ${id}`);
      return updateResult.rows[0];
    } catch (error) {
      await tx.rollback();
      logger.error(`Error cancelling venta ${id}:`, error);
      throw error;
    }
  }


  async registrarAbonoVenta(ventaId, monto, medioPagoId, moneda, userId, notas) {
  const tx = await beginTransaction();

  try {
    // 1) Verificar que la venta existe
    const ventaResult = await tx.query(
      `SELECT * FROM ventas WHERE id = $1 FOR UPDATE`,
      [ventaId]
    );

    if (ventaResult.rows.length === 0) {
      throw new Error('Venta no encontrada');
    }

    const venta = ventaResult.rows[0];
    const montoTotal = Number(venta.monto_total || 0);
    
    // 2) Calcular total pagado actual
    const abonosActualesResult = await tx.query(
      `SELECT COALESCE(SUM(monto), 0) as total_pagado
       FROM abonos WHERE venta_id = $1`,
      [ventaId]
    );
    const totalPagadoActual = Number(abonosActualesResult.rows[0].total_pagado);
    const saldoPendienteActual = montoTotal - totalPagadoActual;

    if (saldoPendienteActual <= 0) {
      throw new Error('La venta ya está pagada');
    }

    if (monto > saldoPendienteActual) {
      throw new Error('El monto excede el saldo pendiente');
    }

    // 3) Obtener boletas de la venta
    const boletasResult = await tx.query(
      `SELECT id FROM boletas WHERE venta_id = $1`,
      [ventaId]
    );

    if (boletasResult.rows.length === 0) {
      throw new Error('La venta no tiene boletas asociadas');
    }

    const boletas = boletasResult.rows;
    const cantidadBoletas = boletas.length;
    const montoPorBoleta = monto / cantidadBoletas;

    // 4) Crear abonos (uno por cada boleta)
    for (const boleta of boletas) {
      await tx.query(
        `INSERT INTO abonos (
          venta_id,
          boleta_id,
          monto,
          estado,
          medio_pago_id,
          moneda,
          registrado_por,
          notas,
          created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)`,
        [
          ventaId,
          boleta.id,
          montoPorBoleta,
          'CONFIRMADO',
          medioPagoId,
          moneda || 'COP',
          userId,
          notas || null
        ]
      );
    }

        // 5) Calcular nuevos totales
    const nuevoTotalPagado = totalPagadoActual + monto;
    const nuevoSaldo = montoTotal - nuevoTotalPagado;

    let nuevoEstado = 'ABONADA';
    if (nuevoSaldo <= 0) {
      nuevoEstado = 'PAGADA';
    }

    // 6) Actualizar venta (solo abono_total y estado; saldo_pendiente es columna generada)
    await tx.query(
      `UPDATE ventas 
       SET abono_total = $1, 
           estado_venta = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [nuevoTotalPagado, nuevoEstado, ventaId]
    );

    // 7) Actualizar estado de boletas
    const estadoBoleta = nuevoEstado === 'PAGADA' ? 'PAGADA' : 'ABONADA';
    await tx.query(
      `UPDATE boletas 
       SET estado = $1, updated_at = CURRENT_TIMESTAMP
       WHERE venta_id = $2`,
      [estadoBoleta, ventaId]
    );

    await tx.commit();

    // 8) Retornar venta actualizada
    const ventaActualizadaResult = await query(
      `SELECT * FROM ventas WHERE id = $1`,
      [ventaId]
    );

    return ventaActualizadaResult.rows[0];

  } catch (error) {
    await tx.rollback();
    throw error;
  }
}


















///// FUNCIONES AVANZADAS PARA GESTIONAR VENTAS (MÓDULO GESTIONAR)
async getVentaDetalleFinanciero(id) {
  // 1) Venta + cliente
  const ventaResult = await query(
    `SELECT v.*, c.nombre, c.telefono
     FROM ventas v
     JOIN clientes c ON v.cliente_id = c.id
     WHERE v.id = $1`,
    [id]
  );

  if (ventaResult.rows.length === 0)
    throw new Error('Venta not found');

  const venta = ventaResult.rows[0];

 // 2) Todos los abonos de la venta, incluyendo número de boleta
const abonosResult = await query(
  `SELECT a.*, b.numero AS boleta_numero
   FROM abonos a
   JOIN boletas b ON a.boleta_id = b.id
   WHERE a.venta_id = $1
   ORDER BY a.created_at ASC`,
  [id]
);

const abonos = abonosResult.rows;

// ⬇⬇⬇ ESTO FALTABA
const totalPagado = abonos.reduce(
  (sum, a) => sum + Number(a.monto),
  0
);
// ⬆⬆⬆

  const montoTotal = Number(venta.monto_total);
  const saldoPendienteTotal = Math.max(montoTotal - totalPagado, 0);

  // 3) Boletas de esta venta (incluyendo numero y bloqueo_hasta)
  const boletasResult = await query(
    `SELECT id, numero, estado, bloqueo_hasta
     FROM boletas
     WHERE venta_id = $1
     ORDER BY numero ASC`,
    [id]
  );

  const boletas = boletasResult.rows;

  if (boletas.length === 0) {
    throw new Error("Venta sin boletas asociadas");
  }

  const cantidadBoletas = boletas.length;
  const precioBoleta = montoTotal / cantidadBoletas;

  // 4) Agrupar abonos por boleta para calcular pagado/saldo por boleta
  const abonosPorBoleta = new Map();

  for (const abono of abonos) {
    const boletaId = abono.boleta_id;
    const monto = Number(abono.monto);

    if (!abonosPorBoleta.has(boletaId)) {
      abonosPorBoleta.set(boletaId, 0);
    }

    abonosPorBoleta.set(
      boletaId,
      abonosPorBoleta.get(boletaId) + monto
    );
  }

  const boletasConFinanzas = boletas.map((b) => {
    const pagadoBoleta = Number(abonosPorBoleta.get(b.id) || 0);
    const saldoBoleta = Math.max(precioBoleta - pagadoBoleta, 0);

    return {
      ...b, // incluye id, numero, estado, bloqueo_hasta
      precio_boleta: precioBoleta,
      total_pagado_boleta: pagadoBoleta,
      saldo_pendiente_boleta: saldoBoleta
    };
  });

  // 5) Devolver todo listo para el frontend (módulo Gestionar)
  return {
    ...venta,
    // del JOIN con clientes
    nombre: venta.nombre,
    telefono: venta.telefono,
    // totales generales
    total_pagado: totalPagado,
    saldo_pendiente: saldoPendienteTotal,
    // detalle
    abonos,
    boletas: boletasConFinanzas
  };
}



async getVentasPorCliente(clienteId) {
  const ventas = await query(
    `SELECT id, monto_total, estado_venta, created_at
     FROM ventas
     WHERE cliente_id = $1
       AND estado_venta IN ('PENDIENTE', 'ABONADA')
     ORDER BY created_at DESC`,
    [clienteId]
  );

  const ventasConSaldo = [];

  for (const venta of ventas.rows) {
    const abonos = await query(
      `SELECT COALESCE(SUM(monto),0) as total_pagado
       FROM abonos
       WHERE venta_id = $1`,
      [venta.id]
    );

    const totalPagado = Number(abonos.rows[0].total_pagado);
    const montoTotal = Number(venta.monto_total);

    const saldoPendiente =
      venta.estado_venta === 'PENDIENTE'
        ? montoTotal || 0
        : montoTotal - totalPagado;

    ventasConSaldo.push({
      ...venta,
      total_pagado: totalPagado,
      saldo_pendiente: saldoPendiente
    });
  }

  return ventasConSaldo;
}
}

module.exports = new VentaService();
