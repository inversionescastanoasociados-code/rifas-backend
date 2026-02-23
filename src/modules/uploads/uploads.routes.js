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

module.exports = router;
