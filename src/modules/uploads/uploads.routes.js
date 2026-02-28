const express = require('express');
const router = express.Router();
const uploadsController = require('./uploads.controller');
const upload = require('./uploads.service');
const { authenticateToken } = require('../../middlewares/auth');

// POST /api/uploads/imagen
router.post('/imagen',
	authenticateToken,
	upload.single('imagen'),
	uploadsController.subirImagen
);

// POST /api/uploads/sync — sincronizar imágenes del filesystem a la DB
router.post('/sync',
	authenticateToken,
	uploadsController.sincronizarManual
);

// POST /api/uploads/restore — restaurar una imagen con nombre específico
// Body: { filename: "rifa-xxx.jpeg" }, File: imagen
router.post('/restore',
	authenticateToken,
	upload.single('imagen'),
	uploadsController.restaurarImagen
);

module.exports = router;
