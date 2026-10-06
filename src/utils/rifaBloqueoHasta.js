/**
 * Calcula bloqueo_hasta para reservas formales (vendedor, online, preasignaciones).
 * Proyecto 3: reserva válida hasta 23-dic-2026 23:59:59 hora Colombia.
 */

/** 23-dic-2026 23:59:59 COT = 24-dic-2026 04:59:59 UTC */
const PROYECTO_3_BLOQUEO_UTC = new Date(Date.UTC(2026, 11, 24, 4, 59, 59, 0));

function esRifaProyecto3(rifa) {
  if (!rifa) return false;
  if (process.env.RIFA_PROYECTO_3_ID && rifa.id === process.env.RIFA_PROYECTO_3_ID) {
    return true;
  }
  const nombre = String(rifa.nombre || rifa.titulo || '').toLowerCase();
  return (
    /proyecto\s*3/.test(nombre) ||
    /\brifa\s*n[°o.]?\s*3\b/.test(nombre) ||
    /^3[\s\-–—]/.test(nombre.trim())
  );
}

function bloqueoFinDiaSorteoColombia(fechaSorteo) {
  const sorteoUTC = new Date(fechaSorteo);
  const sorteoColombiaMs = sorteoUTC.getTime() - 5 * 60 * 60 * 1000;
  const sorteoColombia = new Date(sorteoColombiaMs);
  const year = sorteoColombia.getUTCFullYear();
  const month = sorteoColombia.getUTCMonth();
  const day = sorteoColombia.getUTCDate();
  return new Date(Date.UTC(year, month, day + 1, 4, 59, 59, 0));
}

/**
 * @param {object} rifa - { id, nombre, fecha_sorteo }
 * @param {{ dias_bloqueo?: number }} [options]
 * @returns {Date}
 */
function calcularBloqueoHastaReserva(rifa, options = {}) {
  const { dias_bloqueo = 3 } = options;

  if (esRifaProyecto3(rifa)) {
    return new Date(PROYECTO_3_BLOQUEO_UTC.getTime());
  }

  if (rifa?.fecha_sorteo) {
    return bloqueoFinDiaSorteoColombia(rifa.fecha_sorteo);
  }

  const bloqueoHasta = new Date();
  bloqueoHasta.setMinutes(bloqueoHasta.getMinutes() + dias_bloqueo * 24 * 60);
  return bloqueoHasta;
}

module.exports = {
  esRifaProyecto3,
  calcularBloqueoHastaReserva,
  bloqueoFinDiaSorteoColombia,
  PROYECTO_3_BLOQUEO_UTC,
};
