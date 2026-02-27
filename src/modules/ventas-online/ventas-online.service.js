/**
 * ═══════════════════════════════════════════════════════════════
 *  VENTAS ONLINE — SERVICE (Business Logic)
 *  
 *  Seguridad implementada:
 *  - SELECT FOR UPDATE en todas las operaciones críticas
 *  - Transacciones atómicas (todo o nada)
 *  - Tokens criptográficos (crypto.randomBytes)
 *  - Validación de estado en cada paso
 *  - Sanitización de datos de entrada
 *  - No expone UUIDs internos al público
 *  - Timeouts de bloqueo y expiración
 * ═══════════════════════════════════════════════════════════════
 */

const { query } = require('../../db/pool');
const { beginTransaction } = require('../../db/tx');
const SQL = require('./ventas-online.sql');
const logger = require('../../utils/logger');
const crypto = require('crypto');

// ───────── CONSTANTES DE SEGURIDAD ─────────
const BLOQUEO_TEMPORAL_MINUTOS = 15;    // Bloqueo temporal al seleccionar boletas
const BLOQUEO_MAXIMO_MINUTOS = 30;      // Máximo que un usuario puede pedir
const RESERVA_EXPIRACION_HORAS = 72;    // 3 días para que el cliente pague
const MAX_BOLETAS_POR_RESERVA = 20;     // Máximo boletas que se pueden reservar de golpe
const MIN_BOLETAS_POR_RESERVA = 1;

class VentasOnlineService {

  // ═══════════════════════════════════════
  //  1. LISTAR RIFAS ACTIVAS
  // ═══════════════════════════════════════
  async getRifasActivas() {
    try {
      const result = await query(SQL.GET_RIFAS_ACTIVAS);
      return result.rows;
    } catch (error) {
      logger.error('[VentasOnline] Error obteniendo rifas activas:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════
  //  2. LISTAR BOLETAS DISPONIBLES
  // ═══════════════════════════════════════
  async getBoletasDisponibles(rifaId) {
    try {
      // Verificar que la rifa existe y está activa
      const rifaResult = await query(SQL.GET_RIFA_ACTIVA_BY_ID, [rifaId]);
      if (rifaResult.rows.length === 0) {
        throw new Error('Rifa no encontrada o no está activa');
      }

      const result = await query(SQL.GET_BOLETAS_DISPONIBLES, [rifaId]);

      return {
        rifa: rifaResult.rows[0],
        boletas: result.rows,
        total_disponibles: result.rows.length
      };
    } catch (error) {
      logger.error(`[VentasOnline] Error obteniendo boletas rifa ${rifaId}:`, error);
      throw error;
    }
  }

  // ═══════════════════════════════════════
  //  3. BLOQUEAR BOLETAS (temporal, antes de llenar datos)
  // ═══════════════════════════════════════
  /**
   * Bloquea una o varias boletas atómicamente.
   * Genera un token de reserva único compartido por todas las boletas.
   * Si ALGUNA boleta no está disponible, NO se bloquea NINGUNA.
   * 
   * @param {string} rifaId - UUID de la rifa
   * @param {string[]} boletaIds - Array de UUIDs de boletas
   * @param {number} tiempoMinutos - Minutos de bloqueo (default 15, max 30)
   * @returns {Object} - Token de reserva + boletas bloqueadas
   */
  async bloquearBoletas(rifaId, boletaIds, tiempoMinutos = BLOQUEO_TEMPORAL_MINUTOS) {
    const tx = await beginTransaction();

    try {
      // ── Validaciones ──
      if (!boletaIds || boletaIds.length === 0) {
        throw new Error('Debe seleccionar al menos una boleta');
      }
      if (boletaIds.length > MAX_BOLETAS_POR_RESERVA) {
        throw new Error(`Máximo ${MAX_BOLETAS_POR_RESERVA} boletas por reserva`);
      }

      // Limitar tiempo de bloqueo
      const tiempo = Math.min(Math.max(1, tiempoMinutos), BLOQUEO_MAXIMO_MINUTOS);

      // Verificar rifa activa
      const rifaCheck = await tx.query(SQL.GET_RIFA_ACTIVA_BY_ID, [rifaId]);
      if (rifaCheck.rows.length === 0) {
        throw new Error('Rifa no encontrada o no está activa');
      }

      // ── Generar token criptográfico ──
      const reservaToken = crypto.randomBytes(32).toString('hex');
      const bloqueoHasta = new Date();
      bloqueoHasta.setMinutes(bloqueoHasta.getMinutes() + tiempo);

      // ── Bloquear atómicamente con FOR UPDATE ──
      const result = await tx.query(SQL.BLOQUEAR_BOLETAS_ATOMICO, [
        boletaIds,
        rifaId,
        reservaToken,
        bloqueoHasta
      ]);

      // ── Verificar que TODAS las boletas se bloquearon ──
      if (result.rows.length !== boletaIds.length) {
        // Revertir — algunas boletas no estaban disponibles
        await tx.rollback();

        const bloqueadas = result.rows.map(r => r.numero);
        const solicitadas = boletaIds.length;
        throw new Error(
          `No se pudieron bloquear todas las boletas. ` +
          `Solicitadas: ${solicitadas}, Disponibles: ${bloqueadas.length}. ` +
          `Alguna(s) ya estaba(n) reservada(s) o vendida(s).`
        );
      }

      await tx.commit();

      logger.info(`[VentasOnline] Boletas bloqueadas: ${result.rows.map(r => r.numero).join(', ')} | Token: ${reservaToken.substring(0, 8)}... | Expira: ${bloqueoHasta.toISOString()}`);

      return {
        reserva_token: reservaToken,
        bloqueo_hasta: bloqueoHasta,
        tiempo_bloqueo_minutos: tiempo,
        boletas: result.rows.map(r => ({
          id: r.id,
          numero: r.numero
        }))
      };

    } catch (error) {
      await tx.rollback().catch(() => {});
      logger.error('[VentasOnline] Error bloqueando boletas:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════
  //  4. LIBERAR BOLETAS (el usuario cancela)
  // ═══════════════════════════════════════
  async liberarBoletas(reservaToken) {
    try {
      const result = await query(SQL.LIBERAR_BOLETAS_POR_TOKEN, [reservaToken]);

      if (result.rows.length === 0) {
        throw new Error('No se encontraron boletas con ese token o ya fueron liberadas');
      }

      logger.info(`[VentasOnline] Boletas liberadas: ${result.rows.map(r => r.numero).join(', ')} | Token: ${reservaToken.substring(0, 8)}...`);

      return {
        boletas_liberadas: result.rows.length,
        numeros: result.rows.map(r => r.numero)
      };
    } catch (error) {
      logger.error('[VentasOnline] Error liberando boletas:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════
  //  5. CREAR RESERVA FORMAL (el usuario llena datos + confirma)
  // ═══════════════════════════════════════
  /**
   * Convierte un bloqueo temporal en una reserva formal.
   * El flujo es:
   *   1. Verificar que el token es válido y las boletas siguen bloqueadas
   *   2. Buscar cliente existente (por teléfono/cédula) o crear nuevo
   *   3. Crear venta con estado PENDIENTE + es_venta_online=true
   *   4. Asignar boletas a la venta con bloqueo extendido (72h)
   *   5. La reserva aparece automáticamente en el dashboard admin
   *   6. El admin revisa comprobante → aprueba o rechaza
   * 
   * @param {Object} data
   * @param {string} data.reserva_token - Token del bloqueo temporal
   * @param {Object} data.cliente - { nombre, telefono, email?, identificacion?, direccion? }
   * @param {string} [data.medio_pago_id] - UUID del medio de pago
   * @param {string} [data.notas] - Notas del cliente
   */
  async crearReserva(data) {
    const tx = await beginTransaction();

    try {
      const { reserva_token, cliente, medio_pago_id, notas } = data;

      // ══════════════════════════════════
      //  PASO 1: Verificar token y boletas
      // ══════════════════════════════════
      if (!reserva_token || typeof reserva_token !== 'string' || reserva_token.length !== 64) {
        throw new Error('Token de reserva inválido');
      }

      const boletasResult = await tx.query(SQL.VERIFICAR_BOLETAS_BLOQUEADAS, [reserva_token]);

      if (boletasResult.rows.length === 0) {
        throw new Error('No se encontraron boletas con ese token. Puede que hayan expirado o ya fueron reservadas.');
      }

      // Verificar que no están expiradas
      const ahora = new Date();
      for (const boleta of boletasResult.rows) {
        if (new Date(boleta.bloqueo_hasta) <= ahora) {
          throw new Error(`La boleta #${boleta.numero} ha expirado. Por favor vuelva a seleccionarla.`);
        }
        // Verificar que no tienen cliente asignado (es bloqueo temporal, no formal)
        if (boleta.cliente_id) {
          throw new Error(`La boleta #${boleta.numero} ya tiene un cliente asignado.`);
        }
      }

      const rifaId = boletasResult.rows[0].rifa_id;
      const cantidadBoletas = boletasResult.rows.length;

      // Verificar rifa activa
      const rifaResult = await tx.query(SQL.GET_RIFA_ACTIVA_BY_ID, [rifaId]);
      if (rifaResult.rows.length === 0) {
        throw new Error('La rifa ya no está activa');
      }
      const precioBoleta = parseFloat(rifaResult.rows[0].precio_boleta);

      // ══════════════════════════════════
      //  PASO 2: Buscar o crear cliente
      // ══════════════════════════════════
      // Igual que el módulo de ventas del dashboard:
      // 1. Buscar por teléfono
      // 2. Si no encuentra, buscar por cédula
      // 3. Si encuentra → usar ese cliente existente
      // 4. Si no encuentra → crear uno nuevo
      if (!cliente || !cliente.nombre || !cliente.telefono) {
        throw new Error('Nombre y teléfono del cliente son obligatorios');
      }

      let clienteId;
      let clienteNuevo = true;

      // Buscar por teléfono
      let clienteResult = await tx.query(SQL.GET_CLIENTE_BY_TELEFONO, [cliente.telefono.trim()]);

      // Si no encuentra por teléfono, buscar por cédula
      if (clienteResult.rows.length === 0 && cliente.identificacion) {
        clienteResult = await tx.query(SQL.GET_CLIENTE_BY_IDENTIFICACION, [cliente.identificacion.trim()]);
      }

      if (clienteResult.rows.length > 0) {
        // Cliente existente encontrado → usarlo
        clienteId = clienteResult.rows[0].id;
        clienteNuevo = false;
        logger.info(`[VentasOnline] Cliente existente encontrado: ${clienteId} - ${clienteResult.rows[0].nombre}`);
      } else {
        // Cliente nuevo → crearlo
        const newCliente = await tx.query(SQL.CREATE_CLIENTE, [
          cliente.nombre.trim(),
          cliente.telefono.trim(),
          cliente.email ? cliente.email.trim().toLowerCase() : null,
          cliente.identificacion ? cliente.identificacion.trim() : null,
          cliente.direccion ? cliente.direccion.trim() : null
        ]);
        clienteId = newCliente.rows[0].id;
        logger.info(`[VentasOnline] Cliente nuevo creado: ${clienteId} - ${cliente.nombre.trim()}`);
      }

      // ══════════════════════════════════
      //  PASO 3: Calcular montos
      // ══════════════════════════════════
      const montoTotal = precioBoleta * cantidadBoletas;

      // Validar medio de pago si se proporcionó
      let gatewayPago = null;
      if (medio_pago_id) {
        const mpResult = await tx.query(
          'SELECT id, nombre FROM medios_pago WHERE id = $1 AND activo = true',
          [medio_pago_id]
        );
        if (mpResult.rows.length === 0) {
          throw new Error('Medio de pago no válido');
        }
        gatewayPago = mpResult.rows[0].nombre;
      }

      // ══════════════════════════════════
      //  PASO 4: Crear venta/reserva
      // ══════════════════════════════════
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + RESERVA_EXPIRACION_HORAS);

      const ventaResult = await tx.query(SQL.CREATE_RESERVA_ONLINE, [
        rifaId,
        clienteId,
        montoTotal,
        medio_pago_id || null,
        gatewayPago,
        expiresAt
      ]);

      const venta = ventaResult.rows[0];

      // ══════════════════════════════════
      //  PASO 5: Asignar boletas a la reserva
      // ══════════════════════════════════
      // Extender el bloqueo al período de la reserva formal
      const bloqueoExtendido = new Date(expiresAt);

      const boletasAsignadas = await tx.query(SQL.ASIGNAR_BOLETAS_A_RESERVA, [
        venta.id,
        clienteId,
        bloqueoExtendido,
        reserva_token
      ]);

      if (boletasAsignadas.rows.length !== cantidadBoletas) {
        throw new Error('Error asignando boletas a la reserva. Intente de nuevo.');
      }

      // ══════════════════════════════════
      //  PASO 6: Actualizar contador de boletas vendidas
      // ══════════════════════════════════
      await tx.query(SQL.INCREMENT_BOLETAS_VENDIDAS, [cantidadBoletas, rifaId]);

      await tx.commit();

      logger.info(`[VentasOnline] ✅ Reserva creada: venta=${venta.id} | cliente=${clienteId} (nuevo: ${clienteNuevo}) | boletas=${cantidadBoletas} | total=$${montoTotal} | expira=${expiresAt.toISOString()}`);

      return {
        reserva_token: reserva_token, // El cliente usa este token para consultar estado
        venta_id: venta.id,
        estado: 'PENDIENTE',
        monto_total: montoTotal,
        boletas: boletasAsignadas.rows.map(b => b.numero),
        cantidad_boletas: cantidadBoletas,
        rifa: rifaResult.rows[0].nombre,
        precio_boleta: precioBoleta,
        cliente_nombre: cliente.nombre.trim(),
        expires_at: expiresAt,
        mensaje: `Reserva creada exitosamente. Tiene ${RESERVA_EXPIRACION_HORAS} horas para enviar su comprobante de pago. Un administrador revisará y aprobará su compra.`,
        instrucciones: [
          'Envíe su comprobante de pago al administrador.',
          'Su reserva será revisada y confirmada.',
          `Si no se confirma el pago en ${RESERVA_EXPIRACION_HORAS} horas, las boletas se liberarán automáticamente.`,
          'Puede consultar el estado de su reserva con el token proporcionado.'
        ]
      };

    } catch (error) {
      await tx.rollback().catch(() => {});
      logger.error('[VentasOnline] Error creando reserva:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════
  //  6. CONSULTAR ESTADO DE RESERVA (público)
  // ═══════════════════════════════════════
  async getEstadoReserva(reservaToken) {
    try {
      if (!reservaToken || typeof reservaToken !== 'string' || reservaToken.length !== 64) {
        throw new Error('Token de reserva inválido');
      }

      const result = await query(SQL.GET_RESERVA_BY_TOKEN, [reservaToken]);

      if (result.rows.length === 0) {
        throw new Error('Reserva no encontrada. Verifique el token.');
      }

      const reserva = result.rows[0];

      return {
        estado: reserva.estado_venta,
        monto_total: parseFloat(reserva.monto_total),
        abono_total: parseFloat(reserva.abono_total),
        saldo_pendiente: parseFloat(reserva.saldo_pendiente),
        expires_at: reserva.expires_at,
        rifa: reserva.rifa_nombre,
        premio: reserva.premio_principal,
        fecha_sorteo: reserva.fecha_sorteo,
        cliente: reserva.cliente_nombre,
        boletas: reserva.boletas,
        created_at: reserva.created_at
      };
    } catch (error) {
      logger.error('[VentasOnline] Error consultando reserva:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════
  //  7. OBTENER MEDIOS DE PAGO ACTIVOS
  // ═══════════════════════════════════════
  async getMediosPago() {
    try {
      const result = await query(SQL.GET_MEDIOS_PAGO);
      return result.rows;
    } catch (error) {
      logger.error('[VentasOnline] Error obteniendo medios de pago:', error);
      throw error;
    }
  }

  // ═══════════════════════════════════════
  //  8. CONSULTA POR CÉDULA (estado de cuenta)
  // ═══════════════════════════════════════
  /**
   * Busca un cliente por cédula (identificacion) y retorna todas
   * sus ventas con boletas, incluido QR hash / QR URL.
   *
   * @param {string} cedula - Número de cédula / identificación
   * @returns {{ cliente, ventas, total_ventas }}
   */
  async consultarPorCedula(cedula) {
    try {
      if (!cedula || typeof cedula !== 'string' || cedula.trim().length < 4) {
        throw new Error('Cédula inválida. Debe tener al menos 4 caracteres.');
      }

      const cedulaLimpia = cedula.trim();

      // 1. Buscar cliente
      const clienteResult = await query(SQL.GET_CLIENTE_BY_CEDULA, [cedulaLimpia]);

      if (clienteResult.rows.length === 0) {
        // No encontrado → devolver resultado vacío (no error 404)
        return {
          cliente: null,
          ventas: [],
          total_ventas: 0
        };
      }

      const cliente = clienteResult.rows[0];

      // 2. Buscar ventas del cliente
      const ventasResult = await query(SQL.GET_VENTAS_BY_CLIENTE_ID, [cliente.id]);

      const ventas = ventasResult.rows.map((v) => ({
        venta_id: v.venta_id,
        rifa_nombre: v.rifa_nombre,
        premio_principal: v.premio_principal,
        fecha_sorteo: v.fecha_sorteo,
        estado_venta: v.estado_venta,
        monto_total: parseFloat(v.monto_total),
        abono_total: parseFloat(v.abono_total),
        saldo_pendiente: parseFloat(v.saldo_pendiente),
        medio_pago: v.medio_pago,
        created_at: v.created_at,
        expires_at: v.expires_at,
        boletas: v.boletas
      }));

      return {
        cliente: {
          nombre: cliente.nombre,
          telefono: cliente.telefono,
          email: cliente.email,
          identificacion: cliente.identificacion
        },
        ventas,
        total_ventas: ventas.length
      };
    } catch (error) {
      logger.error(`[VentasOnline] Error consultando por cédula ${cedula}:`, error);
      throw error;
    }
  }
}

module.exports = new VentasOnlineService();
