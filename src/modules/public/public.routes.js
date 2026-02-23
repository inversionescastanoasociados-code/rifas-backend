const express = require('express');
const router = express.Router();

const apiKeyAuth = require('../../middlewares/apiKeyAuth');
const publicController = require('./public.controller');

/**
 * 🔐 Middleware de autenticación via API Key
 * Header requerido: x-api-key
 */
router.use(apiKeyAuth);

/**
 * 🟢 GET /api/public/rifas
 * Obtener todas las rifas activas disponibles en la web pública
 */
router.get('/rifas', publicController.getRifasActivas);

/**
 * ✅ GET /api/public/rifas/:rifaId/boletas
 * Obtener boletas disponibles de una rifa específica
 */
router.get('/rifas/:rifaId/boletas', publicController.getBoletasRifa);

/**
 * 🔒 POST /api/public/boletas/:id/bloquear
 * Bloquear una boleta temporalmente (15 minutos por defecto)
 * Body: { tiempo_bloqueo_minutos?: number }
 */
router.post('/boletas/:id/bloquear', publicController.bloquearBoleta);

/**
 * 💾 POST /api/public/ventas
 * Crear una venta desde la web pública
 * Body: {
 *   rifa_id: string (UUID),
 *   cliente: { nombre, telefono, email?, identificacion?, direccion? },
 *   boletas: [{ id: string, reserva_token: string }],
 *   total_venta: number,
 *   total_pagado: number,
 *   metodo_pago_id?: string (UUID),
 *   notas?: string
 * }
 */
router.post('/ventas', publicController.crearVentaPublica);

module.exports = router;