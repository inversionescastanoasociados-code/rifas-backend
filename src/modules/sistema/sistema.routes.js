const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../../middlewares/auth');
const { getEstadoSistema } = require('./sistema.controller');

// Estado de pausa del sistema. Cualquier usuario autenticado puede consultarlo
// (lo usa el frontend para mostrar la pantalla de bloqueo).
router.get('/estado', authenticateToken, getEstadoSistema);

module.exports = router;
