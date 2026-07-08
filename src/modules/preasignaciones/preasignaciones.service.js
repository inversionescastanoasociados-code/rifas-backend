const crypto = require('crypto');
const { query } = require('../../db/pool');
const { beginTransaction } = require('../../db/tx');
const logger = require('../../utils/logger');
const SQL = require('./preasignaciones.sql');

function esViolacionUnicidadNumero(error) {
  return error?.code === '23505' && String(error?.constraint || '').includes('numero');
}

class PreasignacionesService {
  async listar(q) {
    const termino = q && String(q).trim().length > 0 ? String(q).trim() : null;
    const result = await query(SQL.LISTAR, [termino]);
    return result.rows;
  }

  async crear({ clienteId, numeroBoleta, notas, creadoPor }) {
    const clienteRes = await query(SQL.CLIENTE_EXISTE, [clienteId]);
    if (clienteRes.rows.length === 0) {
      const err = new Error('El cliente indicado no existe');
      err.statusCode = 404;
      throw err;
    }

    try {
      const result = await query(SQL.CREAR, [clienteId, numeroBoleta, notas || null, creadoPor]);
      logger.info(`[preasignaciones] Nueva preasignación: boleta #${numeroBoleta} -> cliente ${clienteId}`);
      return result.rows[0];
    } catch (error) {
      if (esViolacionUnicidadNumero(error)) {
        const existente = await query(SQL.GET_BY_NUMERO, [numeroBoleta]);
        const err = new Error(
          `El número #${String(numeroBoleta).padStart(4, '0')} ya está preasignado a otro cliente. Edítalo o elimínalo primero.`
        );
        err.statusCode = 409;
        throw err;
      }
      throw error;
    }
  }

  async actualizar(id, { clienteId, numeroBoleta, notas }) {
    const actual = await query(SQL.GET_BY_ID, [id]);
    if (actual.rows.length === 0) {
      const err = new Error('Preasignación no encontrada');
      err.statusCode = 404;
      throw err;
    }

    if (clienteId) {
      const clienteRes = await query(SQL.CLIENTE_EXISTE, [clienteId]);
      if (clienteRes.rows.length === 0) {
        const err = new Error('El cliente indicado no existe');
        err.statusCode = 404;
        throw err;
      }
    }

    try {
      const result = await query(SQL.ACTUALIZAR, [
        id,
        clienteId || null,
        numeroBoleta ?? null,
        notas === undefined ? null : notas,
      ]);
      return result.rows[0];
    } catch (error) {
      if (esViolacionUnicidadNumero(error)) {
        const err = new Error(
          `El número #${String(numeroBoleta).padStart(4, '0')} ya está preasignado a otro cliente.`
        );
        err.statusCode = 409;
        throw err;
      }
      throw error;
    }
  }

  async eliminar(id) {
    const result = await query(SQL.ELIMINAR, [id]);
    if (result.rows.length === 0) {
      const err = new Error('Preasignación no encontrada');
      err.statusCode = 404;
      throw err;
    }
    return result.rows[0];
  }

  /**
   * Aplica TODAS las preasignaciones activas a una rifa concreta.
   * Por cada preasignación: si la boleta con ese número existe en la rifa
   * y está DISPONIBLE, crea una reserva formal (venta PENDIENTE + boleta
   * RESERVADA) exactamente igual que una reserva manual normal.
   * Si la boleta ya está vendida/reservada/no existe, se OMITE sin tocarla.
   * Todo corre en una sola transacción con locks fila por fila (FOR UPDATE).
   */
  async aplicarARifa(rifaId, usuarioId) {
    const tx = await beginTransaction({
      usuarioId,
      origen: 'preasignaciones.aplicarARifa',
    });

    try {
      const rifaRes = await tx.query(SQL.GET_RIFA_FOR_UPDATE, [rifaId]);
      if (rifaRes.rows.length === 0) {
        const err = new Error('Rifa no encontrada');
        err.statusCode = 404;
        throw err;
      }
      const rifa = rifaRes.rows[0];

      if (['TERMINADA', 'CANCELADA'].includes(rifa.estado)) {
        const err = new Error(
          `No se puede aplicar a una rifa en estado ${rifa.estado}. Selecciona una rifa vigente.`
        );
        err.statusCode = 400;
        throw err;
      }

      let bloqueoHasta = null;
      if (rifa.fecha_sorteo) {
        const sorteoUTC = new Date(rifa.fecha_sorteo);
        const sorteoColombiaMs = sorteoUTC.getTime() - 5 * 60 * 60 * 1000;
        const sorteoColombia = new Date(sorteoColombiaMs);
        const year = sorteoColombia.getUTCFullYear();
        const month = sorteoColombia.getUTCMonth();
        const day = sorteoColombia.getUTCDate();
        bloqueoHasta = new Date(Date.UTC(year, month, day + 1, 4, 59, 59, 0));
      }

      const preasignaciones = await tx.query(SQL.LISTAR_TODAS_PARA_APLICAR);

      const asignadas = [];
      const omitidas = [];

      for (const pref of preasignaciones.rows) {
        const boletaRes = await tx.query(SQL.GET_BOLETA_RIFA_FOR_UPDATE, [
          rifaId,
          pref.numero_boleta,
        ]);

        if (boletaRes.rows.length === 0) {
          omitidas.push({
            numero_boleta: pref.numero_boleta,
            cliente_nombre: pref.cliente_nombre,
            motivo: 'No existe una boleta con ese número en esta rifa (¿ya generaste las boletas?)',
          });
          continue;
        }

        const boleta = boletaRes.rows[0];
        if (boleta.estado !== 'DISPONIBLE') {
          omitidas.push({
            numero_boleta: pref.numero_boleta,
            cliente_nombre: pref.cliente_nombre,
            motivo: `La boleta ya está en estado ${boleta.estado}, no se modificó`,
          });
          continue;
        }

        const notasVenta = `Reserva creada automáticamente desde Boletas Preasignadas (preferencia de cliente).`;
        const ventaRes = await tx.query(SQL.CREAR_VENTA_RESERVA, [
          rifaId,
          pref.cliente_id,
          rifa.precio_boleta,
          notasVenta,
          usuarioId,
        ]);
        const venta = ventaRes.rows[0];

        const reservaToken = crypto.randomBytes(32).toString('hex');
        await tx.query(SQL.MARCAR_BOLETA_RESERVADA, [
          venta.id,
          pref.cliente_id,
          usuarioId,
          reservaToken,
          bloqueoHasta,
          boleta.id,
        ]);

        await tx.query(SQL.MARCAR_APLICADA, [pref.id, rifaId, venta.id]);

        asignadas.push({
          numero_boleta: pref.numero_boleta,
          cliente_nombre: pref.cliente_nombre,
          venta_id: venta.id,
        });
      }

      await tx.commit();

      logger.info(
        `[preasignaciones] Aplicadas ${asignadas.length}/${preasignaciones.rows.length} a rifa ${rifaId} (omitidas: ${omitidas.length})`
      );

      return {
        rifa_id: rifaId,
        rifa_nombre: rifa.nombre,
        total_preasignaciones: preasignaciones.rows.length,
        asignadas,
        omitidas,
      };
    } catch (error) {
      await tx.rollback();
      logger.error('[preasignaciones] Error aplicando a rifa:', error);
      throw error;
    }
  }
}

module.exports = new PreasignacionesService();
