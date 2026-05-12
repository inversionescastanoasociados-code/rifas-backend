const { Client } = require('pg');
const cs = 'postgresql://postgres:iaciJSTYwwNzAHVXWsGdQCblXdvbcuDJ@crossover.proxy.rlwy.net:34599/railway';

(async () => {
  const c = new Client({ connectionString: cs });
  await c.connect();
  try {
    // Ver desglose de boletas ABONADAS por cliente con su total abonado por boleta
    // para los nombres que el usuario reporto sospechosos
    const nombres = [
      'CAROLINA DUQUE',
      'Rosmira gomez',
      'ANDRES MAURICIO URIBE',
      'Liliana restrepo',
      'jhon herrera',
    ];

    for (const n of nombres) {
      const r = await c.query(`
        SELECT cl.nombre, b.numero, b.estado,
               COALESCE(ab.total_abonado,0) AS total_abonado_boleta,
               r.nombre AS rifa
        FROM clientes cl
        JOIN boletas b ON b.cliente_id = cl.id
        JOIN rifas r ON r.id = b.rifa_id
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(a.monto) FILTER (WHERE a.estado='CONFIRMADO'),0) AS total_abonado
          FROM abonos a WHERE a.boleta_id = b.id
        ) ab ON true
        WHERE cl.nombre ILIKE $1
          AND b.estado = 'ABONADA'
        ORDER BY b.numero
      `, [n]);
      console.log(`\n=== ${n} ===`);
      console.table(r.rows);
    }

    // Conteo total con filtro NUEVO vs filtro VIEJO
    const compare = await c.query(`
      WITH per_boleta AS (
        SELECT b.cliente_id, b.id, b.estado,
               COALESCE(ab.total_abonado,0) AS total_abonado
        FROM boletas b
        LEFT JOIN LATERAL (
          SELECT COALESCE(SUM(a.monto) FILTER (WHERE a.estado='CONFIRMADO'),0) AS total_abonado
          FROM abonos a WHERE a.boleta_id = b.id
        ) ab ON true
        WHERE b.estado = 'ABONADA'
      )
      SELECT
        COUNT(DISTINCT cliente_id) FILTER (WHERE TRUE) AS clientes_filtro_viejo,
        COUNT(DISTINCT cliente_id) FILTER (WHERE total_abonado > 0 AND total_abonado < 90000) AS clientes_filtro_nuevo,
        COUNT(*) AS boletas_abonadas_total,
        COUNT(*) FILTER (WHERE total_abonado > 0 AND total_abonado < 90000) AS boletas_menos_90k,
        COUNT(*) FILTER (WHERE total_abonado >= 90000) AS boletas_90k_o_mas,
        COUNT(*) FILTER (WHERE total_abonado = 0) AS boletas_sin_abono
      FROM per_boleta
    `);
    console.log('\n=== COMPARATIVO ===');
    console.table(compare.rows);
  } finally {
    await c.end();
  }
})().catch(e => { console.error(e); process.exit(1); });
