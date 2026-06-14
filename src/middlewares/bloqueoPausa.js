const { verifyToken } = require('../utils/crypto');
const { isSistemaPausado } = require('../utils/pausaSistema');
const logger = require('../utils/logger');

// Prefijos /api que NUNCA se bloquean aunque el sistema esté en pausa:
// - auth: para poder iniciar sesión
// - sistema: para que el frontend pueda consultar el estado de pausa
// - public / ventas-online / verificar: canales públicos (ya validan ACTIVA / API key)
const PREFIJOS_PERMITIDOS = [
  '/api/auth',
  '/api/sistema',
  '/api/public',
  '/api/ventas-online',
  '/api/verificar',
];

/**
 * Middleware global: cuando el sistema está en pausa, bloquea TODAS las acciones
 * de los roles ADMIN y VENDEDOR. El SUPER_ADMIN nunca se bloquea (debe poder
 * reactivar la rifa). Es defensivo: ante cualquier error deja pasar la request
 * para que la autenticación normal de cada ruta siga aplicando.
 */
const bloqueoPausa = async (req, res, next) => {
  try {
    // Solo afecta rutas de la API
    if (!req.path.startsWith('/api/')) return next();

    // Rutas siempre permitidas
    if (PREFIJOS_PERMITIDOS.some((p) => req.path.startsWith(p))) return next();

    // Identificar al usuario por su token (sin imponer auth: si no hay token
    // o es inválido, dejamos que el middleware de la ruta responda)
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return next();

    let rol;
    try {
      const decoded = verifyToken(token);
      rol = String(decoded.rol || '').toUpperCase();
    } catch {
      return next();
    }

    // SUPER_ADMIN nunca se bloquea
    if (rol === 'SUPER_ADMIN') return next();

    // Solo ADMIN y VENDEDOR se evalúan
    if (rol !== 'ADMIN' && rol !== 'VENDEDOR') return next();

    const pausado = await isSistemaPausado();
    if (!pausado) return next();

    return res.status(423).json({
      error: 'SISTEMA_EN_PAUSA',
      message: 'El sistema está en pausa. No es posible realizar ninguna acción en este momento.',
      pausado: true,
    });
  } catch (err) {
    logger.error('Error en middleware bloqueoPausa:', err.message);
    return next();
  }
};

module.exports = { bloqueoPausa };
