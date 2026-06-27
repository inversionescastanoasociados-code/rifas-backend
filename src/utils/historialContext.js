/**
 * Opcional: enriquecer registros de historial desde la app (dentro de una transacción).
 *
 * await withHistorialContext(client, {
 *   origen: 'ventas.service.registrarAbono',
 *   usuarioId: req.user.id,
 * }, async () => { ... });
 */
async function withHistorialContext(client, { origen, usuarioId }, fn) {
  if (origen) {
    await client.query(
      `SELECT set_config('app.historial_origen', $1, true)`,
      [origen]
    );
  }
  if (usuarioId) {
    await client.query(
      `SELECT set_config('app.historial_usuario_id', $1, true)`,
      [String(usuarioId)]
    );
  }
  return fn();
}

module.exports = { withHistorialContext };
