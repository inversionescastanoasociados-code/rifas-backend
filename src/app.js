const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config/env');
const logger = require('./utils/logger');
const { errorHandler } = require('./middlewares/error');
const { generalLimiter } = require('./middlewares/rateLimiter');
const { startBoletaExpirationJob } = require('./jobs/boletaExpirationJob');

const reportesRoutes = require('./modules/reportes/reportes.routes');
const authRoutes = require('./modules/auth/auth.routes');
const clientesRoutes = require('./modules/clientes/clientes.routes');
const rifasRoutes = require('./modules/rifas/rifas.routes');
const boletasRoutes = require('./modules/boletas/boletas.routes');
const ventasRoutes = require('./modules/ventas/ventas.routes');
const pagosRoutes = require('./modules/pagos/pagos.routes');
const abonosRoutes = require('./modules/abonos/abonos.routes');
const uploadsRoutes = require('./modules/uploads/uploads.routes');
const publicRoutes = require('./modules/public/public.routes');
const publicDashboardRoutes = require('./modules/public-dashboard/public-dashboard.routes');
const verificarRoutes = require('./modules/verificar/verificar.routes');
const ventasOnlineRoutes = require('./modules/ventas-online/ventas-online.routes');

const app = express();

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Aplicar rate limiting general a todas las rutas API
app.use('/api', generalLimiter);

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - ${req.ip}`);
  next();
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv
  });
});

app.get('/api', (req, res) => {
  res.json({
    message: 'Rifas Backend API',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      clientes: '/api/clientes',
      rifas: '/api/rifas',
      boletas: '/api/boletas',
      ventas: '/api/ventas',
      pagos: '/api/pagos',
      abonos: '/api/abonos',
      public: '/api/public (web pública)',
      ventas_online: '/api/ventas-online (ventas públicas seguras)',
      admin_dashboard: '/api/admin/dashboard (gestión ventas públicas)'
    }
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/rifas', rifasRoutes);
app.use('/api/boletas', boletasRoutes);
app.use('/api/ventas', ventasRoutes);
app.use('/api/pagos', pagosRoutes);
app.use('/api/abonos', abonosRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/uploads', uploadsRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/admin/dashboard', publicDashboardRoutes);
app.use('/api/ventas-online', ventasOnlineRoutes);
app.use('/api/verificar', verificarRoutes);
app.use('/storage', require('express').static('storage'));

// 🔹 Iniciar job de liberación de boletas expiradas (cada 5 minutos)
startBoletaExpirationJob(5 * 60 * 1000);

app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.originalUrl
  });
});

app.use(errorHandler);

module.exports = app;
