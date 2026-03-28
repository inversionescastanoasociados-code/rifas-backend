/**
 * Tests para la funcionalidad de Ganadores
 * Se mockan todas las dependencias de DB para no alterar la base de datos.
 */

const request = require('supertest');
const jwt = require('jsonwebtoken');

// ── Mock DB layer ──────────────────────────────────────────
const mockQuery = jest.fn();
const mockTx = {
  query: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn()
};

jest.mock('../../../db/pool', () => ({
  query: (...args) => mockQuery(...args)
}));

jest.mock('../../../db/tx', () => ({
  beginTransaction: jest.fn(() => Promise.resolve(mockTx))
}));

// ── Mock logger to suppress output ────────────────────────
jest.mock('../../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
}));

// ── Mock jobs ─────────────────────────────────────────────
jest.mock('../../../jobs/boletaExpirationJob', () => ({
  startBoletaExpirationJob: jest.fn()
}));

// ── Helpers ───────────────────────────────────────────────
const config = require('../../../config/env');
const app = require('../../../app');

function generateToken(role = 'SUPER_ADMIN') {
  return jwt.sign(
    { id: 'user-uuid-123', rol: role, nombre: 'Test User' },
    config.jwt.secret,
    { expiresIn: '1h' }
  );
}

const superAdminToken = generateToken('SUPER_ADMIN');
const adminToken = generateToken('ADMIN');
const vendedorToken = generateToken('VENDEDOR');

// ── Reset mocks between tests ─────────────────────────────
beforeEach(() => {
  jest.clearAllMocks();
});

afterAll(async () => {
  // Cleanup timers (rate limiter intervals, etc.)
  jest.useRealTimers();
  await new Promise(resolve => setTimeout(resolve, 100));
});

// ═══════════════════════════════════════════════════════════
// GET /api/ventas/ganadores/buscar-boleta
// ═══════════════════════════════════════════════════════════
describe('GET /api/ventas/ganadores/buscar-boleta', () => {

  // ── Auth & permissions ──────────────────────────────────
  test('should return 401 without token', async () => {
    const res = await request(app)
      .get('/api/ventas/ganadores/buscar-boleta?numero=100');
    expect(res.status).toBe(401);
  });

  test('should return 403 for ADMIN role', async () => {
    const res = await request(app)
      .get('/api/ventas/ganadores/buscar-boleta?numero=100')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  test('should return 403 for VENDEDOR role', async () => {
    const res = await request(app)
      .get('/api/ventas/ganadores/buscar-boleta?numero=100')
      .set('Authorization', `Bearer ${vendedorToken}`);
    expect(res.status).toBe(403);
  });

  // ── Validation ──────────────────────────────────────────
  test('should return 400 if numero is missing', async () => {
    const res = await request(app)
      .get('/api/ventas/ganadores/buscar-boleta')
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  // ── Boleta not found ────────────────────────────────────
  test('should return not found when boleta does not exist', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // boleta query

    const res = await request(app)
      .get('/api/ventas/ganadores/buscar-boleta?numero=9999')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.encontrada).toBe(false);
  });

  // ── Boleta DISPONIBLE ───────────────────────────────────
  test('should return available boleta with full info', async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: 'boleta-uuid-1',
        numero: 100,
        estado: 'DISPONIBLE',
        venta_id: null,
        cliente_id: null,
        rifa_id: 'rifa-uuid-1',
        rifa_nombre: 'Rifa Test',
        precio_boleta: '50000'
      }]
    });

    const res = await request(app)
      .get('/api/ventas/ganadores/buscar-boleta?numero=100')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.encontrada).toBe(true);
    expect(res.body.data.disponible).toBe(true);
    expect(res.body.data.boleta.numero).toBe(100);
    expect(res.body.data.boleta.precio_boleta).toBe(50000);
    expect(res.body.data.boleta.rifa_id).toBe('rifa-uuid-1');
  });

  // ── Boleta assigned — should NOT have QR, phone, cedula ─
  test('should return assigned boleta with only client name (sanitized)', async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [{
          id: 'boleta-uuid-2',
          numero: 200,
          estado: 'PAGADA',
          venta_id: 'venta-uuid-1',
          cliente_id: 'cliente-uuid-1',
          rifa_id: 'rifa-uuid-1',
          rifa_nombre: 'Rifa Test',
          precio_boleta: '50000',
          rifa_imagen_url: '/images/rifa.jpg',
          nota: 'Nota test'
        }]
      })
      .mockResolvedValueOnce({
        rows: [{ nombre: 'Juan Perez' }]
      })
      .mockResolvedValueOnce({
        rows: [{ monto_total: '50000', abono_total: '50000', saldo_pendiente: '0', estado_venta: 'PAGADA' }]
      });

    const res = await request(app)
      .get('/api/ventas/ganadores/buscar-boleta?numero=200')
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.encontrada).toBe(true);
    expect(res.body.data.disponible).toBe(false);
    expect(res.body.data.boleta.cliente_nombre).toBe('Juan Perez');
    expect(res.body.data.boleta.estado).toBe('PAGADA');
    expect(res.body.data.boleta.precio_boleta).toBe(50000);
    expect(res.body.data.boleta.rifa_imagen_url).toBe('/images/rifa.jpg');
    expect(res.body.data.boleta.nota).toBe('Nota test');
    // Venta financial info
    expect(res.body.data.boleta.venta).toBeDefined();
    expect(res.body.data.boleta.venta.monto_total).toBe(50000);
    expect(res.body.data.boleta.venta.abono_total).toBe(50000);
    expect(res.body.data.boleta.venta.saldo_pendiente).toBe(0);
    // Must NOT expose sensitive data
    expect(res.body.data.boleta).not.toHaveProperty('telefono');
    expect(res.body.data.boleta).not.toHaveProperty('cedula');
    expect(res.body.data.boleta).not.toHaveProperty('identificacion');
    expect(res.body.data.boleta).not.toHaveProperty('qr');
    expect(res.body.data.boleta).not.toHaveProperty('qr_code');
  });
});

// ═══════════════════════════════════════════════════════════
// POST /api/ventas/ganadores/asignar
// ═══════════════════════════════════════════════════════════
describe('POST /api/ventas/ganadores/asignar', () => {

  const validPayload = {
    rifa_id: '11111111-1111-1111-1111-111111111111',
    boleta_id: '22222222-2222-2222-2222-222222222222',
    cliente: {
      nombre: 'Maria Lopez',
      telefono: '3001234567'
    },
    monto_abono: 50000,
    medio_pago_id: '33333333-3333-3333-3333-333333333333'
  };

  // ── Auth & permissions ──────────────────────────────────
  test('should return 401 without token', async () => {
    const res = await request(app)
      .post('/api/ventas/ganadores/asignar')
      .send(validPayload);
    expect(res.status).toBe(401);
  });

  test('should return 403 for ADMIN role', async () => {
    const res = await request(app)
      .post('/api/ventas/ganadores/asignar')
      .send(validPayload)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(403);
  });

  test('should return 403 for VENDEDOR role', async () => {
    const res = await request(app)
      .post('/api/ventas/ganadores/asignar')
      .send(validPayload)
      .set('Authorization', `Bearer ${vendedorToken}`);
    expect(res.status).toBe(403);
  });

  // ── Validation ──────────────────────────────────────────
  test('should return 400 if rifa_id is missing', async () => {
    const { rifa_id, ...payload } = validPayload;
    const res = await request(app)
      .post('/api/ventas/ganadores/asignar')
      .send(payload)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(400);
  });

  test('should return 400 if boleta_id is missing', async () => {
    const { boleta_id, ...payload } = validPayload;
    const res = await request(app)
      .post('/api/ventas/ganadores/asignar')
      .send(payload)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(400);
  });

  test('should return 400 if cliente.nombre is missing', async () => {
    const payload = { ...validPayload, cliente: { telefono: '300123' } };
    const res = await request(app)
      .post('/api/ventas/ganadores/asignar')
      .send(payload)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(400);
  });

  test('should return 400 if monto_abono is missing', async () => {
    const { monto_abono, ...payload } = validPayload;
    const res = await request(app)
      .post('/api/ventas/ganadores/asignar')
      .send(payload)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(400);
  });

  test('should return 400 if medio_pago_id is not UUID', async () => {
    const payload = { ...validPayload, medio_pago_id: 'not-uuid' };
    const res = await request(app)
      .post('/api/ventas/ganadores/asignar')
      .send(payload)
      .set('Authorization', `Bearer ${superAdminToken}`);
    expect(res.status).toBe(400);
  });

  // ── Successful assignment (full payment) ────────────────
  test('should assign ganador successfully with full payment', async () => {
    // Mock tx.query calls in order:
    // 1. Boleta check (FOR UPDATE)
    mockTx.query
      .mockResolvedValueOnce({ rows: [{ id: validPayload.boleta_id, estado: 'DISPONIBLE', numero: 100 }] })
      // 2. Get precio boleta
      .mockResolvedValueOnce({ rows: [{ precio_boleta: '50000' }] })
      // 3. Create client (no identificacion → skip lookup)
      .mockResolvedValueOnce({ rows: [{ id: 'new-client-uuid' }] })
      // 4. Get medio pago nombre
      .mockResolvedValueOnce({ rows: [{ nombre: 'Efectivo' }] })
      // 5. Create venta
      .mockResolvedValueOnce({ rows: [{ id: 'new-venta-uuid' }] })
      // 6. Update boleta
      .mockResolvedValueOnce({ rowCount: 1 })
      // 7. Create abono
      .mockResolvedValueOnce({ rowCount: 1 });

    mockTx.commit.mockResolvedValueOnce();

    const res = await request(app)
      .post('/api/ventas/ganadores/asignar')
      .send(validPayload)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.boleta_numero).toBe(100);
    expect(res.body.data.estado_venta).toBe('PAGADA');
    expect(res.body.data.estado_boleta).toBe('PAGADA');
    expect(mockTx.commit).toHaveBeenCalled();
    expect(mockTx.rollback).not.toHaveBeenCalled();
  });

  // ── Successful assignment (partial payment) ─────────────
  test('should assign ganador with partial payment (ABONADA)', async () => {
    mockTx.query
      .mockResolvedValueOnce({ rows: [{ id: validPayload.boleta_id, estado: 'DISPONIBLE', numero: 500 }] })
      .mockResolvedValueOnce({ rows: [{ precio_boleta: '100000' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'new-client-uuid' }] })
      .mockResolvedValueOnce({ rows: [{ nombre: 'Nequi' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'venta-uuid-2' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 });

    mockTx.commit.mockResolvedValueOnce();

    const payload = { ...validPayload, monto_abono: 30000 };
    const res = await request(app)
      .post('/api/ventas/ganadores/asignar')
      .send(payload)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(201);
    expect(res.body.data.estado_venta).toBe('ABONADA');
    expect(res.body.data.estado_boleta).toBe('ABONADA');
    expect(res.body.data.monto_abono).toBe(30000);
  });

  // ── Boleta not found → 400 ──────────────────────────────
  test('should return 400 if boleta not found in DB', async () => {
    mockTx.query.mockResolvedValueOnce({ rows: [] }); // boleta not found
    mockTx.rollback.mockResolvedValueOnce();

    const res = await request(app)
      .post('/api/ventas/ganadores/asignar')
      .send(validPayload)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('no encontrada');
    expect(mockTx.rollback).toHaveBeenCalled();
  });

  // ── Boleta already taken → 400 ──────────────────────────
  test('should return 400 if boleta already assigned', async () => {
    mockTx.query.mockResolvedValueOnce({ rows: [{ id: validPayload.boleta_id, estado: 'PAGADA', numero: 100 }] });
    mockTx.rollback.mockResolvedValueOnce();

    const res = await request(app)
      .post('/api/ventas/ganadores/asignar')
      .send(validPayload)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain('no está disponible');
    expect(mockTx.rollback).toHaveBeenCalled();
  });

  // ── Transaction rollback on unexpected error ────────────
  test('should rollback on unexpected error', async () => {
    mockTx.query
      .mockResolvedValueOnce({ rows: [{ id: validPayload.boleta_id, estado: 'DISPONIBLE', numero: 100 }] })
      .mockResolvedValueOnce({ rows: [{ precio_boleta: '50000' }] })
      .mockRejectedValueOnce(new Error('DB connection lost'));
    mockTx.rollback.mockResolvedValueOnce();

    const res = await request(app)
      .post('/api/ventas/ganadores/asignar')
      .send(validPayload)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(500);
    expect(mockTx.rollback).toHaveBeenCalled();
    expect(mockTx.commit).not.toHaveBeenCalled();
  });

  // ── Uses existing client if identificacion matches ──────
  test('should use existing client when identificacion matches', async () => {
    const payloadWithId = {
      ...validPayload,
      cliente: { ...validPayload.cliente, identificacion: '12345678' }
    };

    mockTx.query
      .mockResolvedValueOnce({ rows: [{ id: validPayload.boleta_id, estado: 'DISPONIBLE', numero: 300 }] })
      .mockResolvedValueOnce({ rows: [{ precio_boleta: '50000' }] })
      // Existing client found by identificacion
      .mockResolvedValueOnce({ rows: [{ id: 'existing-client-uuid' }] })
      .mockResolvedValueOnce({ rows: [{ nombre: 'Efectivo' }] })
      .mockResolvedValueOnce({ rows: [{ id: 'venta-uuid-3' }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 });

    mockTx.commit.mockResolvedValueOnce();

    const res = await request(app)
      .post('/api/ventas/ganadores/asignar')
      .send(payloadWithId)
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(201);
    // Verify it did NOT call INSERT INTO clientes (the 3rd query returned existing)
    // The 4th call should be medios_pago, not INSERT INTO clientes
    const fourthCall = mockTx.query.mock.calls[3];
    expect(fourthCall[0]).toContain('medios_pago');
  });
});

// ═══════════════════════════════════════════════════════════
// Route structure tests
// ═══════════════════════════════════════════════════════════
describe('Route structure', () => {
  test('/ganadores/buscar-boleta should not collide with /:id', async () => {
    // If routes were in wrong order, 'ganadores' would match /:id param
    // and fail because it's not a valid ID. The 200 from our mock proves correct routing.
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app)
      .get('/api/ventas/ganadores/buscar-boleta?numero=1')
      .set('Authorization', `Bearer ${superAdminToken}`);

    // Should reach our handler (200), not the /:id handler (400 invalid id)
    expect(res.status).toBe(200);
  });

  test('/ganadores/asignar should not collide with /:id routes', async () => {
    // Missing body fields → Joi validation 400, proving it reached our route
    const res = await request(app)
      .post('/api/ventas/ganadores/asignar')
      .send({})
      .set('Authorization', `Bearer ${superAdminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation Error');
  });
});
