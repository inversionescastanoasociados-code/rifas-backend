const service = require('./reportes.service');

const ROLES_PERMITIDOS_FILTRO = ['ADMIN', 'VENDEDOR', 'SUPER_ADMIN', 'ADMINS'];
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Solo SUPER_ADMIN puede usar los filtros vendedorId / filtroRol.
 * Para cualquier otro rol se ignoran (se devuelven null).
 *
 * filtroRol:
 *   - 'ADMINS'      → agrupa todas las ventas de usuarios ADMIN + SUPER_ADMIN
 *   - 'ADMIN'       → solo rol ADMIN
 *   - 'SUPER_ADMIN' → solo SUPER_ADMIN
 *   - 'VENDEDOR'    → solo VENDEDOR
 * Internamente se traduce a una lista separada por comas para la query.
 */
const extraerFiltrosUsuario = (req) => {
  const rol = String(req.user && req.user.rol || '').toUpperCase();
  if (rol !== 'SUPER_ADMIN') return { vendedorId: null, filtroRol: null };

  const rawVendedor = req.query.vendedorId;
  const rawRol = req.query.filtroRol;

  const vendedorId = rawVendedor && UUID_REGEX.test(String(rawVendedor)) ? String(rawVendedor) : null;
  const rolUpper = rawRol ? String(rawRol).toUpperCase() : null;

  let filtroRol = null;
  if (rolUpper && ROLES_PERMITIDOS_FILTRO.includes(rolUpper)) {
    if (rolUpper === 'ADMINS') {
      filtroRol = 'ADMIN,SUPER_ADMIN';
    } else {
      filtroRol = rolUpper;
    }
  }

  // No se permiten ambos a la vez (vendedor concreto gana)
  if (vendedorId && filtroRol) return { vendedorId, filtroRol: null };
  return { vendedorId, filtroRol };
};

const getReporteRifa = async (req, res) => {
  try {
    const { rifaId } = req.params;
    const { fechaInicio, fechaFin } = req.query;
    const { vendedorId, filtroRol } = extraerFiltrosUsuario(req);
    const data = await service.getReporteRifa(
      rifaId,
      fechaInicio || null,
      fechaFin || null,
      vendedorId,
      filtroRol
    );
    res.json(data);
  } catch (error) {
    console.error('[REPORTES ERROR]', error);
    res.status(500).json({
      message: error.message || 'Error generando reporte'
    });
  }
};

const getVentasGeneral = async (req, res) => {
  try {
    const { rifaId } = req.params;
    const { fechaInicio, fechaFin, page = 1, limit = 50 } = req.query;
    const { vendedorId, filtroRol } = extraerFiltrosUsuario(req);
    const data = await service.getVentasGeneral(
      rifaId,
      fechaInicio || null,
      fechaFin || null,
      Number(page),
      Number(limit),
      vendedorId,
      filtroRol
    );
    res.json({
      success: true,
      ...data
    });
  } catch (error) {
    console.error('[VENTAS GENERAL ERROR]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error obteniendo ventas'
    });
  }
};

/**
 * Reporte limitado a las ventas del usuario autenticado (ADMIN / VENDEDOR / SUPER_ADMIN).
 * Se toma el vendedor desde el JWT, no desde el query param, para evitar manipulación.
 */
const getMisReportesRifa = async (req, res) => {
  try {
    const { rifaId } = req.params;
    const { fechaInicio, fechaFin } = req.query;
    const vendedorId = req.user && req.user.id;
    if (!vendedorId) {
      return res.status(401).json({ message: 'Usuario no identificado' });
    }
    const data = await service.getReporteRifa(
      rifaId,
      fechaInicio || null,
      fechaFin || null,
      vendedorId
    );
    res.json(data);
  } catch (error) {
    console.error('[MIS REPORTES ERROR]', error);
    res.status(500).json({
      message: error.message || 'Error generando reporte personal'
    });
  }
};

const getMisVentasGeneral = async (req, res) => {
  try {
    const { rifaId } = req.params;
    const { fechaInicio, fechaFin, page = 1, limit = 50 } = req.query;
    const vendedorId = req.user && req.user.id;
    if (!vendedorId) {
      return res.status(401).json({ success: false, message: 'Usuario no identificado' });
    }
    const data = await service.getVentasGeneral(
      rifaId,
      fechaInicio || null,
      fechaFin || null,
      Number(page),
      Number(limit),
      vendedorId
    );
    res.json({
      success: true,
      ...data
    });
  } catch (error) {
    console.error('[MIS VENTAS GENERAL ERROR]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error obteniendo ventas personales'
    });
  }
};

const getSeguimientoClientes = async (req, res) => {  try {
    const page         = Math.max(1, parseInt(req.query.page  || '1',  10));
    const limit        = Math.min(50, Math.max(1, parseInt(req.query.limit || '20', 10)));
    const search       = (req.query.search       || '').trim().substring(0, 100);
    const estadoBoleta = (req.query.estadoBoleta || 'todas').trim();
    const notificado   = (req.query.notificado   || 'todos').trim();
    const rifaId       = req.query.rifaId && UUID_REGEX.test(req.query.rifaId)
      ? req.query.rifaId : null;

    // filtro de rango de abono (solo válido cuando estadoBoleta === 'ABONADA')
    const rawMin = parseFloat(req.query.abonoMin);
    const rawMax = parseFloat(req.query.abonoMax);
    const abonoMin = estadoBoleta === 'ABONADA' && !isNaN(rawMin) && rawMin >= 0 ? rawMin : null;
    const abonoMax = estadoBoleta === 'ABONADA' && !isNaN(rawMax) && rawMax >= 0 ? rawMax : null;

    const ESTADOS_VALIDOS   = ['todas', 'RESERVADA', 'ABONADA', 'PAGADA'];
    const NOTIFICADO_VALIDO = ['todos', 'si', 'no'];

    if (!ESTADOS_VALIDOS.includes(estadoBoleta)) {
      return res.status(400).json({ success: false, message: 'estadoBoleta inválido' });
    }
    if (!NOTIFICADO_VALIDO.includes(notificado)) {
      return res.status(400).json({ success: false, message: 'notificado inválido' });
    }

    const data = await service.getSeguimientoClientes({
      page, limit, search, estadoBoleta, notificado, rifaId, abonoMin, abonoMax,
    });

    res.json({ success: true, ...data });
  } catch (error) {
    console.error('[SEGUIMIENTO CLIENTES ERROR]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error obteniendo seguimiento de clientes'
    });
  }
};

const registrarContactoSeguimiento = async (req, res) => {
  try {
    const { clienteId } = req.params;
    if (!clienteId || !UUID_REGEX.test(clienteId)) {
      return res.status(400).json({ success: false, message: 'clienteId inválido' });
    }
    const nota = req.body && req.body.nota
      ? String(req.body.nota).trim().substring(0, 500)
      : null;
    const registradoPor = req.user && req.user.id ? req.user.id : null;

    const data = await service.registrarContactoSeguimiento({ clienteId, registradoPor, nota });
    res.json({ success: true, ...data });
  } catch (error) {
    console.error('[REGISTRAR CONTACTO ERROR]', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error registrando contacto'
    });
  }
};

module.exports = {
  getReporteRifa,
  getVentasGeneral,
  getMisReportesRifa,
  getMisVentasGeneral,
  getSeguimientoClientes,
  registrarContactoSeguimiento,
};
