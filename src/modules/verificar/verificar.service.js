const { query } = require('../../db/pool');
const SQL_QUERIES = require('./verificar.sql');
const logger = require('../../utils/logger');
const crypto = require('crypto');
const config = require('../../config/env');

class VerificarService {
  /**
   * Genera un hash HMAC-SHA256 a partir del ID de la boleta.
   * Este hash es único, no reversible, y sirve como token de verificación.
   */
  static generateHash(boletaId) {
    const secret = config.verificacion?.secret || config.jwt.secret;
    return crypto
      .createHmac('sha256', secret)
      .update(boletaId)
      .digest('hex')
      .substring(0, 32); // 32 chars = suficientemente único y corto para QR
  }

  /**
   * Obtener datos completos de una boleta por su hash de verificación.
   * Retorna datos públicos seguros (sin IDs internos sensibles).
   */
  async getBoletaByHash(hash) {
    try {
      // Validar formato del hash
      if (!hash || !/^[a-f0-9]{32}$/.test(hash)) {
        return null;
      }

      const result = await query(SQL_QUERIES.GET_BOLETA_BY_HASH, [hash]);

      if (result.rows.length === 0) {
        logger.warn(`Verificación fallida — hash no encontrado: ${hash.substring(0, 8)}...`);
        return null;
      }

      const boleta = result.rows[0];

      // Obtener abonos si hay venta asociada
      let abonos = [];
      if (boleta.venta_info) {
        // Buscar abonos por boleta_id (no por venta_id) para historial per-boleta
        const boletaIdResult = await query(
          'SELECT id FROM boletas WHERE verificacion_hash = $1',
          [hash]
        );
        if (boletaIdResult.rows[0]?.id) {
          const abonosResult = await query(
            SQL_QUERIES.GET_ABONOS_BY_BOLETA,
            [boletaIdResult.rows[0].id]
          );
          abonos = abonosResult.rows;
        }
      }

      // Construir respuesta pública (sin exponer IDs internos)
      return {
        boleta: {
          numero: boleta.numero,
          estado: boleta.estado,
          barcode: boleta.barcode,
          fecha_compra: boleta.created_at,
        },
        rifa: {
          nombre: boleta.rifa_nombre,
          descripcion: boleta.rifa_descripcion,
          precio_boleta: parseFloat(boleta.precio_boleta),
          fecha_sorteo: boleta.fecha_sorteo,
          premio_principal: boleta.premio_principal,
          total_boletas: boleta.total_boletas,
          imagen_url: boleta.rifa_imagen_url,
          estado: boleta.rifa_estado,
          terminos_condiciones: boleta.terminos_condiciones,
        },
        cliente: boleta.cliente_info
          ? {
              nombre: boleta.cliente_info.nombre || '',
              // Enmascarar identificación por seguridad (mostrar solo últimos 4)
              identificacion: boleta.cliente_info.identificacion
                ? '****' + boleta.cliente_info.identificacion.slice(-4)
                : null,
            }
          : {
              nombre: null,
              identificacion: null,
            },
        financiero: boleta.venta_info
          ? {
              monto_total: parseFloat(boleta.venta_info.monto_total),
              abono_total: parseFloat(boleta.venta_info.abono_total),
              saldo_pendiente: parseFloat(boleta.venta_info.saldo_pendiente),
              estado: boleta.venta_info.estado,
              metodo_pago: boleta.venta_info.metodo_pago,
              porcentaje_pagado:
                parseFloat(boleta.venta_info.monto_total) > 0
                  ? Math.round(
                      (parseFloat(boleta.venta_info.abono_total) /
                        parseFloat(boleta.venta_info.monto_total)) *
                        100
                    )
                  : 0,
            }
          : {
              monto_total: 0,
              abono_total: 0,
              saldo_pendiente: 0,
              estado: null,
              metodo_pago: null,
              porcentaje_pagado: 0,
            },
        abonos: abonos.map((a) => ({
          monto: parseFloat(a.monto),
          moneda: a.moneda,
          estado: a.estado,
          referencia: a.referencia,
          metodo_pago: a.metodo_pago,
          fecha: a.created_at,
          observaciones: a.notas,
        })),
        verificado_en: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Error en verificación de boleta:', error);
      throw error;
    }
  }
}

module.exports = new VerificarService();
module.exports.VerificarService = VerificarService;
