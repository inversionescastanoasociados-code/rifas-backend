const { query } = require('../../db/pool');
const { beginTransaction } = require('../../db/tx');
const logger = require('../../utils/logger');
const SQL = require('./superadmin-ventas.sql');

/**
 * Módulo Superadmin: edición segura de ventas, abonos y boletas.
 *
 * Trabaja en armonía con los triggers de producción:
 *  - Cambios en `abonos` (INSERT/UPDATE/DELETE) => el trigger recalc_venta_abonos
 *    recalcula `abono_total` y `estado_venta` automáticamente.
 *  - Cambios de `estado_venta` NO tocan boletas (venta_detalles está vacía).
 *  - `saldo_pendiente` es columna generada (no se escribe directo).
 * Por eso el código reconcilia SIEMPRE el estado de las boletas de forma
 * explícita, y recalcula `monto_total` cuando cambia el número de boletas.
 */
class SuperadminVentasService {
  // ─────────────────────────────────────────────────────────────
  // Helpers internos (reciben una transacción `tx`)
  // ─────────────────────────────────────────────────────────────

  /**
   * Reconciliar el estado de cada boleta que sigue vinculada a la venta,
   * según lo realmente abonado (confirmado) vs el precio de la boleta.
   */
  async reconciliarBoletasDeVenta(tx, ventaId, precioBoleta) {
    const boletas = await tx.query(
      `SELECT id FROM boletas WHERE venta_id = $1`,
      [ventaId]
    );
    for (const b of boletas.rows) {
      const pagadoRes = await tx.query(
        `SELECT COALESCE(SUM(monto), 0) AS pagado
         FROM abonos
         WHERE boleta_id = $1 AND venta_id = $2 AND estado <> 'ANULADO'`,
        [b.id, ventaId]
      );
      const pagado = Number(pagadoRes.rows[0].pagado);
      let estado;
      if (pagado >= precioBoleta && precioBoleta > 0) estado = 'PAGADA';
      else if (pagado > 0) estado = 'ABONADA';
      else estado = 'RESERVADA';

      await tx.query(
        `UPDATE boletas SET estado = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND estado <> $1`,
        [estado, b.id]
      );
    }
  }

  /**
   * Recalcular monto_total (= boletas vinculadas x precio) y, en base al
   * abono_total actual (mantenido por el trigger), el estado_venta.
   * No toca ventas CANCELADA/EXPIRADA.
   */
  async recalcularMontoYEstadoVenta(tx, ventaId, precioBoleta) {
    const info = await tx.query(
      `SELECT
         (SELECT COUNT(*) FROM boletas WHERE venta_id = $1)::int AS num_boletas,
         v.abono_total,
         v.estado_venta
       FROM ventas v WHERE v.id = $1`,
      [ventaId]
    );
    if (info.rows.length === 0) return;
    const { num_boletas, abono_total, estado_venta } = info.rows[0];
    const nuevoMonto = Number(num_boletas) * Number(precioBoleta);

    await tx.query(
      `UPDATE ventas SET monto_total = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND monto_total <> $2`,
      [ventaId, nuevoMonto]
    );

    if (estado_venta === 'CANCELADA' || estado_venta === 'EXPIRADA') return;

    const abonos = Number(abono_total);
    let nuevoEstado;
    if (nuevoMonto > 0 && abonos >= nuevoMonto) nuevoEstado = 'PAGADA';
    else if (abonos > 0) nuevoEstado = 'ABONADA';
    else nuevoEstado = 'PENDIENTE';

    await tx.query(
      `UPDATE ventas SET estado_venta = $2, updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND estado_venta <> $2`,
      [ventaId, nuevoEstado]
    );
  }

  async getGatewayNombre(tx, medioPagoId) {
    if (!medioPagoId) return null;
    const r = await tx.query(`SELECT nombre FROM medios_pago WHERE id = $1`, [medioPagoId]);
    return r.rows[0]?.nombre || null;
  }

  /**
   * Verifica que el número de comprobante no esté ya usado en `ventas.referencia_pago`
   * ni en `abonos.referencia`.
   *
   * `excludeVentaId` excluye la venta que se está editando. `excludeAbonoId`
   * excluye el abono que se está editando. `excludeVentaIdEnAbonos` excluye
   * TODOS los abonos de esa venta: un mismo pago genera un abono por boleta que
   * comparte el mismo comprobante, así que esos hermanos no son un duplicado.
   */
  async verificarComprobanteUnico(tx, referencia, { excludeVentaId, excludeAbonoId, excludeVentaIdEnAbonos } = {}) {
    if (!referencia) return;

    const ventaParams = [referencia];
    let ventaFiltro = '';
    if (excludeVentaId) {
      ventaParams.push(excludeVentaId);
      ventaFiltro = ` AND id <> $${ventaParams.length}`;
    }
    const ventaExistente = await tx.query(
      `SELECT id FROM ventas WHERE referencia_pago = $1${ventaFiltro} LIMIT 1`,
      ventaParams
    );
    if (ventaExistente.rows.length > 0) {
      throw Object.assign(new Error(`El número de comprobante "${referencia}" ya fue usado en otra venta`), { statusCode: 409 });
    }

    const abonoParams = [referencia];
    let abonoFiltro = '';
    if (excludeAbonoId) {
      abonoParams.push(excludeAbonoId);
      abonoFiltro += ` AND id <> $${abonoParams.length}`;
    }
    if (excludeVentaIdEnAbonos) {
      abonoParams.push(excludeVentaIdEnAbonos);
      abonoFiltro += ` AND venta_id <> $${abonoParams.length}`;
    }
    const abonoExistente = await tx.query(
      `SELECT id FROM abonos WHERE referencia = $1${abonoFiltro} LIMIT 1`,
      abonoParams
    );
    if (abonoExistente.rows.length > 0) {
      throw Object.assign(new Error(`El número de comprobante "${referencia}" ya fue usado en otro abono`), { statusCode: 409 });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Lectura
  // ─────────────────────────────────────────────────────────────

  async buscarVentas(q) {
    const termino = (q || '').trim();
    if (!termino) return [];

    const esNumero = /^\d+$/.test(termino);
    const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(termino);

    const texto = termino;
    const numero = esNumero ? parseInt(termino, 10) : null;
    const uuid = esUuid ? termino : null;

    const result = await query(SQL.BUSCAR_VENTAS, [texto, numero, uuid]);
    return result.rows;
  }

  async getVentaDetalle(ventaId) {
    const ventaRes = await query(SQL.GET_VENTA, [ventaId]);
    if (ventaRes.rows.length === 0) {
      const err = new Error('Venta no encontrada');
      err.statusCode = 404;
      throw err;
    }
    const [boletas, abonos, medios] = await Promise.all([
      query(SQL.GET_BOLETAS_DE_VENTA, [ventaId]),
      query(SQL.GET_ABONOS_DE_VENTA, [ventaId]),
      query(SQL.GET_MEDIOS_PAGO),
    ]);

    return {
      venta: ventaRes.rows[0],
      boletas: boletas.rows,
      abonos: abonos.rows,
      medios_pago: medios.rows,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Abonos
  // ─────────────────────────────────────────────────────────────

  async editarAbono(abonoId, { monto, medioPagoId, referencia }, userId) {
    const tx = await beginTransaction({ usuarioId: userId, origen: 'superadmin.editarAbono' });
    try {
      const abonoRes = await tx.query(`SELECT * FROM abonos WHERE id = $1 FOR UPDATE`, [abonoId]);
      if (abonoRes.rows.length === 0) throw Object.assign(new Error('Abono no encontrado'), { statusCode: 404 });
      const abono = abonoRes.rows[0];
      if (abono.estado === 'ANULADO') throw new Error('No se puede editar un abono anulado');

      const ventaId = abono.venta_id;
      const rifaRes = await tx.query(
        `SELECT r.precio_boleta FROM ventas v JOIN rifas r ON r.id = v.rifa_id WHERE v.id = $1`,
        [ventaId]
      );
      const precioBoleta = Number(rifaRes.rows[0]?.precio_boleta || 0);

      const nuevoMonto = monto != null ? Number(monto) : Number(abono.monto);
      if (!(nuevoMonto > 0)) throw new Error('El monto debe ser mayor a 0');

      let medioFinal = abono.medio_pago_id;
      let gatewayFinal = abono.gateway_pago;
      if (medioPagoId) {
        medioFinal = medioPagoId;
        gatewayFinal = await this.getGatewayNombre(tx, medioPagoId);
      }

      // Comprobante: si se envía explícitamente (incluye '' para borrarlo), se actualiza.
      let referenciaFinal = abono.referencia;
      let cambioReferencia = false;
      if (referencia !== undefined) {
        const limpio = referencia === null ? null : String(referencia).trim() || null;
        if (limpio && (gatewayFinal || '').trim().toLowerCase() !== 'efectivo') {
          await this.verificarComprobanteUnico(tx, limpio, {
            excludeAbonoId: abonoId,
            excludeVentaId: ventaId,
            excludeVentaIdEnAbonos: ventaId,
          });
        }
        referenciaFinal = limpio;
        cambioReferencia = true;
      }

      const notaEdicion = ` | EDITADO por superadmin ${new Date().toISOString().slice(0, 10)}: monto ${abono.monto}->${nuevoMonto}${cambioReferencia ? `, comprobante ${abono.referencia || 'N/A'}->${referenciaFinal || 'N/A'}` : ''}`;

      // El trigger recalc_venta_abonos recalcula abono_total y estado_venta.
      await tx.query(
        `UPDATE abonos
         SET monto = $2, medio_pago_id = $3, gateway_pago = $4, referencia = $5,
             notas = COALESCE(notas, '') || $6
         WHERE id = $1`,
        [abonoId, nuevoMonto, medioFinal, gatewayFinal, referenciaFinal, notaEdicion]
      );

      // Reconciliar boletas según lo pagado.
      await this.reconciliarBoletasDeVenta(tx, ventaId, precioBoleta);

      await tx.commit();
      logger.info(`[superadmin] Abono ${abonoId} editado (monto=${nuevoMonto})`);
      return this.getVentaDetalle(ventaId);
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async anularAbono(abonoId, userId, motivo) {
    const tx = await beginTransaction({ usuarioId: userId, origen: 'superadmin.anularAbono' });
    try {
      const abonoRes = await tx.query(`SELECT * FROM abonos WHERE id = $1 FOR UPDATE`, [abonoId]);
      if (abonoRes.rows.length === 0) throw Object.assign(new Error('Abono no encontrado'), { statusCode: 404 });
      const abono = abonoRes.rows[0];
      if (abono.estado === 'ANULADO') throw new Error('El abono ya está anulado');

      const ventaId = abono.venta_id;
      const rifaRes = await tx.query(
        `SELECT r.precio_boleta FROM ventas v JOIN rifas r ON r.id = v.rifa_id WHERE v.id = $1`,
        [ventaId]
      );
      const precioBoleta = Number(rifaRes.rows[0]?.precio_boleta || 0);

      const nota = ` | ANULADO por superadmin ${new Date().toISOString().slice(0, 10)}${motivo ? ': ' + motivo : ''}`;
      // El trigger recalcula abono_total y estado_venta al pasar a ANULADO.
      await tx.query(
        `UPDATE abonos SET estado = 'ANULADO', notas = COALESCE(notas, '') || $2 WHERE id = $1`,
        [abonoId, nota]
      );

      await this.reconciliarBoletasDeVenta(tx, ventaId, precioBoleta);

      await tx.commit();
      logger.info(`[superadmin] Abono ${abonoId} anulado`);
      return this.getVentaDetalle(ventaId);
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async agregarAbono(ventaId, { monto, medioPagoId, boletaId, notas }, userId) {
    const tx = await beginTransaction({ usuarioId: userId, origen: 'superadmin.agregarAbono' });
    try {
      const ventaRes = await tx.query(
        `SELECT v.*, r.precio_boleta FROM ventas v JOIN rifas r ON r.id = v.rifa_id WHERE v.id = $1 FOR UPDATE`,
        [ventaId]
      );
      if (ventaRes.rows.length === 0) throw Object.assign(new Error('Venta no encontrada'), { statusCode: 404 });
      const venta = ventaRes.rows[0];
      const precioBoleta = Number(venta.precio_boleta || 0);

      const montoNum = Number(monto);
      if (!(montoNum > 0)) throw new Error('El monto debe ser mayor a 0');

      // Si se indica boleta, validar que pertenece a la venta.
      if (boletaId) {
        const b = await tx.query(`SELECT id FROM boletas WHERE id = $1 AND venta_id = $2`, [boletaId, ventaId]);
        if (b.rows.length === 0) throw new Error('La boleta no pertenece a esta venta');
      }

      const gateway = await this.getGatewayNombre(tx, medioPagoId);
      const nota = (notas || 'Abono agregado por superadmin');

      // El trigger recalcula abono_total y estado_venta.
      await tx.query(
        `INSERT INTO abonos (venta_id, boleta_id, monto, estado, medio_pago_id, gateway_pago, moneda, registrado_por, notas, created_at)
         VALUES ($1, $2, $3, 'CONFIRMADO', $4, $5, 'COP', $6, $7, CURRENT_TIMESTAMP)`,
        [ventaId, boletaId || null, montoNum, medioPagoId || null, gateway, userId, nota]
      );

      await this.reconciliarBoletasDeVenta(tx, ventaId, precioBoleta);

      await tx.commit();
      logger.info(`[superadmin] Abono agregado a venta ${ventaId} (monto=${montoNum})`);
      return this.getVentaDetalle(ventaId);
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Boletas
  // ─────────────────────────────────────────────────────────────

  /**
   * Liberar una boleta (aunque esté PAGADA/ABONADA): la devuelve a DISPONIBLE,
   * anula sus abonos ligados, recalcula monto_total y ajusta el contador de la rifa.
   */
  async liberarBoleta(boletaId, userId, motivo) {
    const tx = await beginTransaction({ usuarioId: userId, origen: 'superadmin.liberarBoleta' });
    try {
      const boletaRes = await tx.query(`SELECT * FROM boletas WHERE id = $1 FOR UPDATE`, [boletaId]);
      if (boletaRes.rows.length === 0) throw Object.assign(new Error('Boleta no encontrada'), { statusCode: 404 });
      const boleta = boletaRes.rows[0];
      const ventaId = boleta.venta_id;

      if (!ventaId) throw new Error('La boleta no está vinculada a ninguna venta');

      const rifaRes = await tx.query(
        `SELECT r.precio_boleta FROM ventas v JOIN rifas r ON r.id = v.rifa_id WHERE v.id = $1`,
        [ventaId]
      );
      const precioBoleta = Number(rifaRes.rows[0]?.precio_boleta || 0);

      // 1) Anular los abonos ligados a esta boleta (el trigger recalcula la venta).
      const nota = ` | ANULADO por liberar boleta #${boleta.numero} (superadmin) ${new Date().toISOString().slice(0, 10)}${motivo ? ': ' + motivo : ''}`;
      await tx.query(
        `UPDATE abonos SET estado = 'ANULADO', notas = COALESCE(notas, '') || $2
         WHERE boleta_id = $1 AND venta_id = $3 AND estado <> 'ANULADO'`,
        [boletaId, nota, ventaId]
      );

      // 2) Liberar la boleta.
      await tx.query(
        `UPDATE boletas
         SET estado = 'DISPONIBLE', cliente_id = NULL, venta_id = NULL, vendido_por = NULL,
             reserva_token = NULL, bloqueo_hasta = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [boletaId]
      );

      // 3) Ajustar contador de la rifa.
      await tx.query(
        `UPDATE rifas SET boletas_vendidas = GREATEST(boletas_vendidas - 1, 0), updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [boleta.rifa_id]
      );

      // 4) Recalcular monto_total y estado de la venta + reconciliar boletas restantes.
      await this.recalcularMontoYEstadoVenta(tx, ventaId, precioBoleta);
      await this.reconciliarBoletasDeVenta(tx, ventaId, precioBoleta);

      await tx.commit();
      logger.info(`[superadmin] Boleta #${boleta.numero} liberada de venta ${ventaId}`);
      return this.getVentaDetalle(ventaId);
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  /**
   * Agregar una boleta DISPONIBLE (de la misma rifa) a una venta existente.
   */
  async agregarBoleta(ventaId, boletaId, userId) {
    const tx = await beginTransaction({ usuarioId: userId, origen: 'superadmin.agregarBoleta' });
    try {
      const ventaRes = await tx.query(
        `SELECT v.*, r.precio_boleta FROM ventas v JOIN rifas r ON r.id = v.rifa_id WHERE v.id = $1 FOR UPDATE`,
        [ventaId]
      );
      if (ventaRes.rows.length === 0) throw Object.assign(new Error('Venta no encontrada'), { statusCode: 404 });
      const venta = ventaRes.rows[0];
      const precioBoleta = Number(venta.precio_boleta || 0);

      const boletaRes = await tx.query(`SELECT * FROM boletas WHERE id = $1 FOR UPDATE`, [boletaId]);
      if (boletaRes.rows.length === 0) throw Object.assign(new Error('Boleta no encontrada'), { statusCode: 404 });
      const boleta = boletaRes.rows[0];

      if (boleta.rifa_id !== venta.rifa_id) throw new Error('La boleta pertenece a otra rifa');
      if (boleta.estado !== 'DISPONIBLE' || boleta.venta_id) {
        throw new Error(`La boleta #${boleta.numero} no está disponible`);
      }

      await tx.query(
        `UPDATE boletas
         SET estado = 'RESERVADA', venta_id = $2, cliente_id = $3, vendido_por = $4, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [boletaId, ventaId, venta.cliente_id, userId]
      );

      await tx.query(
        `UPDATE rifas SET boletas_vendidas = boletas_vendidas + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [venta.rifa_id]
      );

      await this.recalcularMontoYEstadoVenta(tx, ventaId, precioBoleta);
      await this.reconciliarBoletasDeVenta(tx, ventaId, precioBoleta);

      await tx.commit();
      logger.info(`[superadmin] Boleta #${boleta.numero} agregada a venta ${ventaId}`);
      return this.getVentaDetalle(ventaId);
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Venta: método de pago, estado, cliente, eliminar
  // ─────────────────────────────────────────────────────────────

  async cambiarMedioPagoVenta(ventaId, medioPagoId, userId) {
    const tx = await beginTransaction({ usuarioId: userId, origen: 'superadmin.cambiarMedioPagoVenta' });
    try {
      const ventaRes = await tx.query(
        `SELECT id, rifa_id, cliente_id FROM ventas WHERE id = $1 FOR UPDATE`,
        [ventaId]
      );
      if (ventaRes.rows.length === 0) throw Object.assign(new Error('Venta no encontrada'), { statusCode: 404 });
      const venta = ventaRes.rows[0];

      const gateway = await this.getGatewayNombre(tx, medioPagoId);
      if (!gateway) throw new Error('Medio de pago inválido');

      // 1) Cabecera de la venta.
      await tx.query(
        `UPDATE ventas SET medio_pago_id = $2, gateway_pago = $3, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [ventaId, medioPagoId, gateway]
      );

      // 2) Propagar a los abonos NO anulados para que el cambio se refleje en
      //    el módulo de ventas, en boletas y en el historial (el trigger
      //    historial_abonos_upd registra cada cambio de medio automáticamente).
      const nota = ` | Método cambiado a ${gateway} por superadmin ${new Date().toISOString().slice(0, 10)}`;
      const updAbonos = await tx.query(
        `UPDATE abonos
         SET medio_pago_id = $2, gateway_pago = $3, notas = COALESCE(notas, '') || $4
         WHERE venta_id = $1 AND estado <> 'ANULADO'
           AND (medio_pago_id IS DISTINCT FROM $2 OR gateway_pago IS DISTINCT FROM $3)
         RETURNING id`,
        [ventaId, medioPagoId, gateway, nota]
      );

      // 3) Registrar el cambio a nivel de venta (el trigger de ventas solo
      //    registra cambios de estado, no de método de pago).
      await tx.query(
        `INSERT INTO historial_movimientos
           (entidad, accion, rifa_id, cliente_id, venta_id, usuario_id, medio_pago_id, origen, notas, metadata)
         VALUES ('VENTA', 'CAMBIO_MEDIO_PAGO', $1, $2, $3, historial_usuario_contexto(), $4,
                 historial_origen_contexto(), $5, $6::jsonb)`,
        [
          venta.rifa_id,
          venta.cliente_id,
          ventaId,
          medioPagoId,
          `Método de pago de la venta cambiado a ${gateway}`,
          JSON.stringify({ abonos_actualizados: updAbonos.rowCount, gateway_pago: gateway }),
        ]
      );

      await tx.commit();
      logger.info(`[superadmin] Medio de pago de venta ${ventaId} cambiado a ${gateway} (${updAbonos.rowCount} abonos actualizados)`);
      return this.getVentaDetalle(ventaId);
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  /**
   * Editar el número de comprobante (referencia_pago) de una venta.
   * Permite corregir errores de digitación o completar el dato si quedó vacío.
   * No aplica el gate de "efectivo no requiere comprobante": el superadmin puede
   * dejarlo vacío (null) en cualquier momento.
   */
  async editarComprobanteVenta(ventaId, referenciaPago, userId) {
    const tx = await beginTransaction({ usuarioId: userId, origen: 'superadmin.editarComprobanteVenta' });
    try {
      const ventaRes = await tx.query(`SELECT id, referencia_pago, rifa_id, cliente_id FROM ventas WHERE id = $1 FOR UPDATE`, [ventaId]);
      if (ventaRes.rows.length === 0) throw Object.assign(new Error('Venta no encontrada'), { statusCode: 404 });
      const venta = ventaRes.rows[0];

      const limpio = referenciaPago === null || referenciaPago === undefined
        ? null
        : String(referenciaPago).trim() || null;

      if (limpio) {
        await this.verificarComprobanteUnico(tx, limpio, {
          excludeVentaId: ventaId,
          excludeVentaIdEnAbonos: ventaId,
        });
      }

      await tx.query(
        `UPDATE ventas SET referencia_pago = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [ventaId, limpio]
      );

      await tx.query(
        `INSERT INTO historial_movimientos
           (entidad, accion, rifa_id, cliente_id, venta_id, usuario_id, origen, notas, metadata)
         VALUES ('VENTA', 'EDITAR_COMPROBANTE', $1, $2, $3, historial_usuario_contexto(), historial_origen_contexto(), $4, $5::jsonb)`,
        [
          venta.rifa_id,
          venta.cliente_id,
          ventaId,
          `Comprobante de la venta cambiado de "${venta.referencia_pago || 'N/A'}" a "${limpio || 'N/A'}"`,
          JSON.stringify({ anterior: venta.referencia_pago, nuevo: limpio }),
        ]
      );

      await tx.commit();
      logger.info(`[superadmin] Comprobante de venta ${ventaId} actualizado`);
      return this.getVentaDetalle(ventaId);
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  /**
   * Cambio manual de estado (override de superadmin). Reconciliar boletas de
   * forma coherente, ya que los triggers no lo hacen (venta_detalles vacía).
   */
  async cambiarEstadoVenta(ventaId, nuevoEstado, userId) {
    const ESTADOS_VALIDOS = ['PENDIENTE', 'ABONADA', 'PAGADA', 'CANCELADA'];
    if (!ESTADOS_VALIDOS.includes(nuevoEstado)) throw new Error('Estado no permitido');

    const tx = await beginTransaction({ usuarioId: userId, origen: 'superadmin.cambiarEstadoVenta' });
    try {
      const ventaRes = await tx.query(
        `SELECT v.*, r.precio_boleta FROM ventas v JOIN rifas r ON r.id = v.rifa_id WHERE v.id = $1 FOR UPDATE`,
        [ventaId]
      );
      if (ventaRes.rows.length === 0) throw Object.assign(new Error('Venta no encontrada'), { statusCode: 404 });
      const venta = ventaRes.rows[0];
      const precioBoleta = Number(venta.precio_boleta || 0);

      await tx.query(
        `UPDATE ventas SET estado_venta = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [ventaId, nuevoEstado]
      );

      if (nuevoEstado === 'CANCELADA') {
        // Anular abonos confirmados y liberar boletas.
        const nota = ` | Venta CANCELADA por superadmin ${new Date().toISOString().slice(0, 10)}`;
        await tx.query(
          `UPDATE abonos SET estado = 'ANULADO', notas = COALESCE(notas, '') || $2
           WHERE venta_id = $1 AND estado <> 'ANULADO'`,
          [ventaId, nota]
        );
        const boletasRes = await tx.query(`SELECT COUNT(*)::int AS n FROM boletas WHERE venta_id = $1`, [ventaId]);
        const n = boletasRes.rows[0].n;
        await tx.query(
          `UPDATE boletas
           SET estado = 'DISPONIBLE', cliente_id = NULL, venta_id = NULL, vendido_por = NULL,
               reserva_token = NULL, bloqueo_hasta = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE venta_id = $1`,
          [ventaId]
        );
        if (n > 0) {
          await tx.query(
            `UPDATE rifas SET boletas_vendidas = GREATEST(boletas_vendidas - $2, 0), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
            [venta.rifa_id, n]
          );
        }
      } else if (nuevoEstado === 'PAGADA') {
        await tx.query(
          `UPDATE boletas SET estado = 'PAGADA', updated_at = CURRENT_TIMESTAMP WHERE venta_id = $1`,
          [ventaId]
        );
      } else {
        // PENDIENTE / ABONADA: reconciliar según lo abonado.
        await this.reconciliarBoletasDeVenta(tx, ventaId, precioBoleta);
      }

      await tx.commit();
      logger.info(`[superadmin] Estado de venta ${ventaId} cambiado a ${nuevoEstado}`);
      return this.getVentaDetalle(ventaId);
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async reasignarCliente(ventaId, clienteId, userId) {
    const tx = await beginTransaction({ usuarioId: userId, origen: 'superadmin.reasignarCliente' });
    try {
      const ventaRes = await tx.query(`SELECT id FROM ventas WHERE id = $1 FOR UPDATE`, [ventaId]);
      if (ventaRes.rows.length === 0) throw Object.assign(new Error('Venta no encontrada'), { statusCode: 404 });

      const clienteRes = await tx.query(`SELECT id FROM clientes WHERE id = $1`, [clienteId]);
      if (clienteRes.rows.length === 0) throw new Error('Cliente destino no existe');

      await tx.query(
        `UPDATE ventas SET cliente_id = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
        [ventaId, clienteId]
      );
      await tx.query(
        `UPDATE boletas SET cliente_id = $2, updated_at = CURRENT_TIMESTAMP WHERE venta_id = $1`,
        [ventaId, clienteId]
      );

      await tx.commit();
      logger.info(`[superadmin] Venta ${ventaId} reasignada a cliente ${clienteId}`);
      return this.getVentaDetalle(ventaId);
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  /**
   * Eliminar por completo una venta: libera sus boletas, borra sus abonos y
   * la venta, y ajusta el contador de la rifa.
   */
  async eliminarVenta(ventaId, userId) {
    const tx = await beginTransaction({ usuarioId: userId, origen: 'superadmin.eliminarVenta' });
    try {
      const ventaRes = await tx.query(`SELECT * FROM ventas WHERE id = $1 FOR UPDATE`, [ventaId]);
      if (ventaRes.rows.length === 0) throw Object.assign(new Error('Venta no encontrada'), { statusCode: 404 });
      const venta = ventaRes.rows[0];

      const boletasRes = await tx.query(`SELECT COUNT(*)::int AS n FROM boletas WHERE venta_id = $1`, [ventaId]);
      const n = boletasRes.rows[0].n;

      // Liberar boletas.
      await tx.query(
        `UPDATE boletas
         SET estado = 'DISPONIBLE', cliente_id = NULL, venta_id = NULL, vendido_por = NULL,
             reserva_token = NULL, bloqueo_hasta = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE venta_id = $1`,
        [ventaId]
      );

      // Borrar abonos y la venta.
      await tx.query(`DELETE FROM abonos WHERE venta_id = $1`, [ventaId]);
      await tx.query(`DELETE FROM venta_detalles WHERE venta_id = $1`, [ventaId]);
      await tx.query(`DELETE FROM ventas WHERE id = $1`, [ventaId]);

      if (n > 0) {
        await tx.query(
          `UPDATE rifas SET boletas_vendidas = GREATEST(boletas_vendidas - $2, 0), updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [venta.rifa_id, n]
        );
      }

      await tx.commit();
      logger.info(`[superadmin] Venta ${ventaId} eliminada (${n} boletas liberadas)`);
      return { deleted: true, venta_id: ventaId, boletas_liberadas: n };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }
}

module.exports = new SuperadminVentasService();
