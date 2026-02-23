const express = require('express');
const router = express.Router();
const controller = require('./reportes.controller');
const { authenticateToken } = require('../../middlewares/auth');

router.get(
  '/rifa/:rifaId',
  authenticateToken,
  controller.getReporteRifa
);

module.exports = router;
