const boletaService = require('../modules/boletas/boletas.service');
const logger = require('../utils/logger');

/**
 * JOB: Liberar boletas con bloqueo expirado
 * Ejecuta cada 5 minutos automáticamente
 * 
 * Diferencia entre:
 * - Bloqueos simples (sin cliente): Se liberan a DISPONIBLE + limpiar tokens
 * - Reservas formales (con cliente): Se liberan a DISPONIBLE + desvincular cliente + limpiar tokens
 */

let jobInterval = null;

const startBoletaExpirationJob = (intervalMs = 5 * 60 * 1000) => {
  if (jobInterval) {
    logger.warn('Boleta expiration job already running');
    return;
  }

  logger.info(
    `[JOBS] Starting boletaExpirationJob (runs every ${intervalMs / 1000}s)`
  );

  // Ejecutar inmediatamente al iniciar
  executeLiberation();

  // Luego cada X minutos
  jobInterval = setInterval(executeLiberation, intervalMs);
};

const executeLiberation = async () => {
  try {
    const result = await boletaService.liberarBoletasExpiradas();

    if (result.total > 0) {
      logger.info('[JOB RESULT] Boleta expiration check:', {
        bloqueos_liberados: result.liberadas_bloqueos,
        reservas_liberadas: result.liberadas_reservas,
        total: result.total
      });
    }
  } catch (error) {
    logger.error('[JOB ERROR] Boleta expiration job failed:', error);
  }
};

const stopBoletaExpirationJob = () => {
  if (jobInterval) {
    clearInterval(jobInterval);
    jobInterval = null;
    logger.info('[JOBS] Boleta expiration job stopped');
  }
};

module.exports = {
  startBoletaExpirationJob,
  stopBoletaExpirationJob,
  executeLiberation
};
