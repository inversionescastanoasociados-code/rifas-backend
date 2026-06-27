const { pool } = require('../../db/pool');
const sql = require('./historial.sql');

function parsePagination(query) {
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
  const offset = Math.max(parseInt(query.offset, 10) || 0, 0);
  return { limit, offset };
}

async function getByBoletaId(boletaId, query) {
  const { limit, offset } = parsePagination(query);
  const [rows, count] = await Promise.all([
    pool.query(sql.POR_BOLETA, [boletaId, limit, offset]),
    pool.query(sql.COUNT_POR_BOLETA, [boletaId]),
  ]);
  return {
    total: count.rows[0].total,
    limit,
    offset,
    movimientos: rows.rows,
  };
}

async function getByClienteId(clienteId, query) {
  const { limit, offset } = parsePagination(query);
  const [rows, count] = await Promise.all([
    pool.query(sql.POR_CLIENTE, [clienteId, limit, offset]),
    pool.query(sql.COUNT_POR_CLIENTE, [clienteId]),
  ]);
  return {
    total: count.rows[0].total,
    limit,
    offset,
    movimientos: rows.rows,
  };
}

async function getByVentaId(ventaId, query) {
  const { limit, offset } = parsePagination(query);
  const [rows, count] = await Promise.all([
    pool.query(sql.POR_VENTA, [ventaId, limit, offset]),
    pool.query(sql.COUNT_POR_VENTA, [ventaId]),
  ]);
  return {
    total: count.rows[0].total,
    limit,
    offset,
    movimientos: rows.rows,
  };
}

async function getRecientes(query) {
  const { limit, offset } = parsePagination(query);
  const entidad = query.entidad || null;
  const accion = query.accion || null;
  const rifaId = query.rifaId || null;

  const [rows, count] = await Promise.all([
    pool.query(sql.RECIENTES, [entidad, accion, rifaId, limit, offset]),
    pool.query(sql.COUNT_RECIENTES, [entidad, accion, rifaId]),
  ]);

  return {
    total: count.rows[0].total,
    limit,
    offset,
    movimientos: rows.rows,
  };
}

async function getByRifaNumero(rifaId, numero, query) {
  const { limit, offset } = parsePagination(query);
  const num = parseInt(numero, 10);
  if (Number.isNaN(num)) {
    const err = new Error('Número de boleta inválido');
    err.statusCode = 400;
    throw err;
  }
  const rows = await pool.query(sql.POR_NUMERO, [rifaId, num, limit, offset]);
  const count = await pool.query(
    `SELECT COUNT(*)::int AS total FROM historial_movimientos WHERE rifa_id = $1 AND numero = $2`,
    [rifaId, num]
  );
  return {
    total: count.rows[0].total,
    limit,
    offset,
    movimientos: rows.rows,
  };
}

module.exports = {
  getRecientes,
  getByBoletaId,
  getByClienteId,
  getByVentaId,
  getByRifaNumero,
};
