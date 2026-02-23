const { query } = require('../../db/pool');
const { beginTransaction } = require('../../db/tx');
const SQL_QUERIES = require('./public.sql');
const logger = require('../../utils/logger');
const crypto = require('crypto');

class PublicService {

  /**
   * 🟢 Obtener todas las rifas activas (para web pública)
   */
  async getRifasActivas() {
    try {
      const result = await query(SQL_QUERIES.GET_RIFAS_ACTIVAS);
      logger.info('Rifas activas obtenidas para web pública');
      return result.rows;
    } catch (error) {
      logger.error('Error obteniendo rifas activas:', error);
      throw error;
    }
  }

  /**
   * ✅ Obtener boletas disponibles de una rifa
   */
  async getBoletasRifa(rifaId) {
    try {
      // Verificar que rifa existe y está activa
      const rifaResult = await query(SQL_QUERIES.GET_RIFA_BY_ID, [rifaId]);
      if (rifaResult.rows.length === 0) {
        throw new Error('Rifa no encontrada o no está activa');
      }

      const result = await query(SQL_QUERIES.GET_BOLETAS_DISPONIBLES_BY_RIFA, [rifaId]);
      logger.info(`Boletas obtenidas para rifa ${rifaId}: ${result.rows.length} disponibles`);
      
      return result.rows;
    } catch (error) {
      logger.error(`Error obteniendo boletas para rifa ${rifaId}:`, error);
      throw error;
    }
  }


  /**
   * 🔒 Bloquear boleta para cliente (temporal)
   */
  async bloquearBoletaPublica(boletaId, tiempoBloqueo = 15) {
    const tx = await beginTransaction();

    try {
      // 1. Obtener boleta y verificar estado
      const boletaCheck = await tx.query(
        `SELECT id, estado, bloqueo_hasta FROM boletas WHERE id = $1 FOR UPDATE`,
        [boletaId]
      );

      if (boletaCheck.rows.length === 0) {
        throw new Error('Boleta no encontrada');
      }

      const boleta = boletaCheck.rows[0];

      // 2. Verificar disponibilidad
      if (boleta.estado !== 'DISPONIBLE') {
        throw new Error(`Boleta no disponible. Estado actual: ${boleta.estado}`);
      }

      // 3. Si hay bloqueo anterior y aún está vigente, rechazar
      if (boleta.bloqueo_hasta && new Date(boleta.bloqueo_hasta) > new Date()) {
        throw new Error('Boleta está bloqueada por otro cliente');
      }

      // 4. Generar token de reserva único
      const reservaToken = crypto.randomBytes(32).toString('hex');

      // 5. Calcular tiempo de bloqueo
      const bloqueoHasta = new Date();
      bloqueoHasta.setMinutes(bloqueoHasta.getMinutes() + tiempoBloqueo);

      // 6. Actualizar boleta
      const result = await tx.query(
        SQL_QUERIES.BLOQUEAR_BOLETA,
        [reservaToken, bloqueoHasta, boletaId]
      );

      await tx.commit();

      logger.info(`Boleta ${boletaId} bloqueada hasta ${bloqueoHasta}`);

      return {
        boleta_id: boletaId,
        numero: result.rows[0].numero,
        reserva_token: reservaToken,
        bloqueo_hasta: bloqueoHasta,
        tiempo_bloqueo_minutos: tiempoBloqueo
      };

    } catch (error) {
      await tx.rollback();
      logger.error('Error bloqueando boleta:', error);
      throw error;
    }
  }

  /**
   * 💾 Crear venta desde web pública
   */
  async crearVentaPublica(data) {
    const tx = await beginTransaction();

    try {
      const {
        rifa_id,
        cliente,
        boletas,
        total_venta,
        total_pagado,
        metodo_pago_id,
        notas
      } = data;

      // ✅ VALIDACIONES
      if (!rifa_id || !cliente || !boletas || boletas.length === 0) {
        throw new Error('Datos incompletos: rifa_id, cliente y boletas son requeridos');
      }

      if (!total_venta || total_venta <= 0) {
        throw new Error('Total debe ser mayor a 0');
      }

      if (Math.isNaN(total_pagado) || total_pagado < 0) {
        throw new Error('Total pagado inválido');
      }

      // 1️⃣ Verificar rifa existe y está activa
      const rifaResult = await tx.query(
        `SELECT id, precio_boleta FROM rifas WHERE id = $1 AND estado = 'ACTIVA' FOR UPDATE`,
        [rifa_id]
      );

      if (rifaResult.rows.length === 0) {
        throw new Error('Rifa no encontrada o no está activa');
      }

      const precioBoleta = Number(rifaResult.rows[0].precio_boleta);

      // 2️⃣ Verificar que todas las boletas están bloqueadas con tokens válidos
      const boletaIds = boletas.map(b => b.id);
      const boletasCheck = await tx.query(
        `SELECT id, estado, reserva_token, bloqueo_hasta 
         FROM boletas 
         WHERE id = ANY($1::UUID[]) 
         FOR UPDATE`,
        [boletaIds]
      );

      if (boletasCheck.rows.length !== boletas.length) {
        throw new Error('Una o más boletas no existen');
      }

      for (const boletaDb of boletasCheck.rows) {
        const boletaSubmitted = boletas.find(b => b.id === boletaDb.id);
        
        if (!boletaSubmitted) {
          throw new Error(`Boleta ${boletaDb.id} no encontrada en solicitud`);
        }

        // Verificar que el estado sea RESERVADA
        if (boletaDb.estado !== 'RESERVADA') {
          throw new Error(`Boleta ${boletaDb.id} no está bloqueada (estado: ${boletaDb.estado})`);
        }

        // Verificar token
        if (boletaDb.reserva_token !== boletaSubmitted.reserva_token) {
          throw new Error(`Token de reserva inválido para boleta ${boletaDb.id}`);
        }

        // Verificar bloqueo aún vigente
        if (new Date(boletaDb.bloqueo_hasta) <= new Date()) {
          throw new Error(`Bloqueo de boleta ${boletaDb.id} ha expirado`);
        }
      }

      // 3️⃣ Buscar o crear cliente
      let clienteId;
      let clienteExistente = null;

      // Buscar por teléfono primero
      const clientePorTelResult = await tx.query(
        SQL_QUERIES.GET_CLIENTE_BY_TELEFONO,
        [cliente.telefono]
      );

      if (clientePorTelResult.rows.length > 0) {
        clienteId = clientePorTelResult.rows[0].id;
        clienteExistente = true;
      } else if (cliente.identificacion) {
        // Luego por identificación
        const clientePorIdResult = await tx.query(
          SQL_QUERIES.GET_CLIENTE_BY_IDENTIFICACION,
          [cliente.identificacion]
        );

        if (clientePorIdResult.rows.length > 0) {
          clienteId = clientePorIdResult.rows[0].id;
          clienteExistente = true;
        }
      }

      // Crear cliente si no existe
      if (!clienteId) {
        const newClienteResult = await tx.query(
          SQL_QUERIES.CREATE_CLIENTE,
          [
            cliente.nombre,
            cliente.telefono,
            cliente.email || null,
            cliente.identificacion || null,
            cliente.direccion || null
          ]
        );
        clienteId = newClienteResult.rows[0].id;
      }

      // 4️⃣ Calcular estados según monto pagado
      const saldoPendiente = total_venta - total_pagado;
      const esAbono = total_pagado > 0 && total_pagado < total_venta;
      const esPagoCompleto = total_pagado >= total_venta;

      let estadoVenta = 'PENDIENTE';
      if (esPagoCompleto) {
        estadoVenta = 'PAGADA';
      } else if (esAbono) {
        estadoVenta = 'ABONADA';
      }

      // 5️⃣ Crear venta
      const ventaResult = await tx.query(
        SQL_QUERIES.CREATE_VENTA_PUBLICA,
        [
          rifa_id,
          clienteId,
          total_venta,
          total_pagado || 0,
          estadoVenta,
          metodo_pago_id || null
        ]
      );

      const venta = ventaResult.rows[0];
      logger.info(`Venta web pública creada: ${venta.id}`);

      // 6️⃣ Procesar cada boleta
      let montoPorBoleta = 0;
      if (total_pagado > 0) {
        montoPorBoleta = total_pagado / boletas.length;
      }

      for (const boletaInfo of boletas) {
        const { id: boletaId } = boletaInfo;

        // Determinar estado de la boleta
        let estadoBoleta = 'RESERVADA';
        if (esPagoCompleto) {
          estadoBoleta = 'PAGADA';
        } else if (esAbono) {
          estadoBoleta = 'ABONADA';
        }

        // Actualizar boleta
        await tx.query(
          `UPDATE boletas
           SET venta_id = $1,
               cliente_id = $2,
               estado = $3,
               reserva_token = NULL,
               bloqueo_hasta = NULL,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $4`,
          [venta.id, clienteId, estadoBoleta, boletaId]
        );

        // Si hay pago, registrar abono
        if (total_pagado > 0) {
          await tx.query(
            SQL_QUERIES.CREATE_ABONO,
            [
              venta.id,
              null, // web pública no tiene usuario registrado
              boletaId,
              metodo_pago_id || null,
              montoPorBoleta,
              'COP',
              'REGISTRADO', // Requiere confirmación manual en dashboard
              notas || 'Venta desde web pública'
            ]
          );
          logger.info(`Abono registrado para boleta ${boletaId}: ${montoPorBoleta}`);
        }
      }

      // 7️⃣ Actualizar contador de boletas vendidas
      await tx.query(
        SQL_QUERIES.UPDATE_VENTA_TOTAL_BOLETAS,
        [boletas.length, rifa_id]
      );

      await tx.commit();

      logger.info(`Venta completada: ${venta.id}, estado: ${estadoVenta}, cliente: ${clienteId}`);

      return {
        venta_id: venta.id,
        estado: estadoVenta,
        cliente_id: clienteId,
        total_venta,
        total_pagado,
        saldo_pendiente: saldoPendiente,
        boletas_bloqueadas: boletas.length,
        origen: 'web_publica',
        created_at: venta.created_at
      };

    } catch (error) {

      await tx.rollback();
      throw error;

    }

  }

}

module.exports = new PublicService();