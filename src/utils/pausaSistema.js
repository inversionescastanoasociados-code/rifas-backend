const { query } = require('../db/pool');
const logger = require('./logger');

// Caché en memoria para no consultar la DB en cada request.
// El sistema se considera "en pausa" si existe al menos una rifa en estado PAUSADA.
let cache = { value: false, ts: 0 };
const TTL_MS = 5000;

/**
 * Indica si el sistema está en pausa (alguna rifa en estado PAUSADA).
 * Usa caché de corta duración. Ante un error de DB hace fail-open
 * (devuelve false) para no bloquear las operaciones por un fallo transitorio.
 */
async function isSistemaPausado() {
  const now = Date.now();
  if (now - cache.ts < TTL_MS) return cache.value;

  try {
    const res = await query(
      `SELECT EXISTS(SELECT 1 FROM rifas WHERE estado = 'PAUSADA') AS pausado`
    );
    cache = { value: res.rows[0].pausado === true, ts: now };
    return cache.value;
  } catch (err) {
    logger.error('Error verificando pausa del sistema:', err.message);
    return false;
  }
}

/** Invalida la caché para que el próximo chequeo consulte la DB de inmediato. */
function invalidarCachePausa() {
  cache = { value: false, ts: 0 };
}

module.exports = { isSistemaPausado, invalidarCachePausa };
