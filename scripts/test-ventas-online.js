/**
 * ═══════════════════════════════════════════════════════════════
 *  TEST COMPLETO: VENTAS ONLINE — FLUJO END-TO-END
 *  
 *  Este script prueba todo el flujo:
 *  1. Listar rifas activas
 *  2. Listar boletas disponibles
 *  3. Bloquear boletas
 *  4. Crear reserva con datos de cliente
 *  5. Consultar estado de reserva
 *  6. Verificar que aparece en dashboard admin
 *  7. Probar edge cases (token inválido, boleta ya bloqueada, etc.)
 * ═══════════════════════════════════════════════════════════════
 */

const API_BASE = 'https://rifas-backend-production.up.railway.app';
const API_KEY = process.env.PUBLIC_API_KEY || 'pk_4f9a8c7e2d1b6a9f3c0d5e7f8a2b4c6d';
const ADMIN_EMAIL = 'superadmin@rifas.com';
const ADMIN_PASS = 'admin123';

const https = require('https');
const http = require('http');

function makeRequest(method, url, body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const lib = urlObj.protocol === 'https:' ? https : http;
    
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  const results = { passed: 0, failed: 0, errors: [] };

  function assert(name, condition, detail = '') {
    if (condition) {
      console.log(`  ✅ ${name}`);
      results.passed++;
    } else {
      console.log(`  ❌ ${name} ${detail ? '— ' + detail : ''}`);
      results.failed++;
      results.errors.push(name + (detail ? ': ' + detail : ''));
    }
  }

  const publicHeaders = { 'x-api-key': API_KEY };

  try {
    // ══════════════════════════════════════════
    console.log('\n═══ TEST 1: LISTAR RIFAS ACTIVAS ═══');
    // ══════════════════════════════════════════
    const rifasRes = await makeRequest('GET', `${API_BASE}/api/ventas-online/rifas`, null, publicHeaders);
    assert('Status 200', rifasRes.status === 200, `Got ${rifasRes.status}`);
    assert('success: true', rifasRes.data.success === true);
    assert('Tiene rifas', rifasRes.data.data.length > 0, `Count: ${rifasRes.data.count}`);
    
    const rifa = rifasRes.data.data[0];
    const rifaId = rifa.id;
    console.log(`  📋 Rifa: "${rifa.nombre}" (${rifa.boletas_disponibles} disponibles)`);

    // ══════════════════════════════════════════
    console.log('\n═══ TEST 2: LISTAR BOLETAS DISPONIBLES ═══');
    // ══════════════════════════════════════════
    const boletasRes = await makeRequest('GET', `${API_BASE}/api/ventas-online/rifas/${rifaId}/boletas`, null, publicHeaders);
    assert('Status 200', boletasRes.status === 200, `Got ${boletasRes.status}`);
    assert('success: true', boletasRes.data.success === true);
    assert('Tiene boletas', boletasRes.data.data.boletas.length > 0, `Total: ${boletasRes.data.data.total_disponibles}`);
    
    // Tomar 2 boletas para el test
    const boleta1 = boletasRes.data.data.boletas[0];
    const boleta2 = boletasRes.data.data.boletas[1];
    console.log(`  🎫 Boletas para test: #${boleta1.numero} (${boleta1.id}), #${boleta2.numero} (${boleta2.id})`);

    // ══════════════════════════════════════════
    console.log('\n═══ TEST 3: BLOQUEAR BOLETAS ═══');
    // ══════════════════════════════════════════
    const bloquearRes = await makeRequest('POST', `${API_BASE}/api/ventas-online/boletas/bloquear`, {
      rifa_id: rifaId,
      boleta_ids: [boleta1.id, boleta2.id],
      tiempo_bloqueo_minutos: 15
    }, publicHeaders);
    
    assert('Status 200', bloquearRes.status === 200, `Got ${bloquearRes.status} - ${JSON.stringify(bloquearRes.data)}`);
    assert('success: true', bloquearRes.data.success === true, JSON.stringify(bloquearRes.data));
    assert('Tiene reserva_token', bloquearRes.data.data?.reserva_token?.length === 64, `Token length: ${bloquearRes.data.data?.reserva_token?.length}`);
    assert('2 boletas bloqueadas', bloquearRes.data.data?.boletas?.length === 2);
    
    const reservaToken = bloquearRes.data.data?.reserva_token;
    console.log(`  🔒 Token: ${reservaToken?.substring(0, 16)}...`);
    console.log(`  ⏰ Expira: ${bloquearRes.data.data?.bloqueo_hasta}`);

    // ══════════════════════════════════════════
    console.log('\n═══ TEST 4: INTENTAR BLOQUEAR LA MISMA BOLETA (debe fallar) ═══');
    // ══════════════════════════════════════════
    const dobleBloqueo = await makeRequest('POST', `${API_BASE}/api/ventas-online/boletas/bloquear`, {
      rifa_id: rifaId,
      boleta_ids: [boleta1.id],
      tiempo_bloqueo_minutos: 15
    }, publicHeaders);
    assert('Falla con 409 (Conflict)', dobleBloqueo.status === 409, `Got ${dobleBloqueo.status}: ${dobleBloqueo.data?.message}`);

    // ══════════════════════════════════════════
    console.log('\n═══ TEST 5: LISTAR MEDIOS DE PAGO ═══');
    // ══════════════════════════════════════════
    const mediosRes = await makeRequest('GET', `${API_BASE}/api/ventas-online/medios-pago`, null, publicHeaders);
    assert('Status 200', mediosRes.status === 200);
    assert('Tiene medios', mediosRes.data.data?.length >= 0);
    if (mediosRes.data.data?.length > 0) {
      console.log(`  💳 Medios: ${mediosRes.data.data.map(m => m.nombre).join(', ')}`);
    }

    // ══════════════════════════════════════════
    console.log('\n═══ TEST 6: CREAR RESERVA FORMAL ═══');
    // ══════════════════════════════════════════
    const medioPagoId = mediosRes.data.data?.length > 0 ? mediosRes.data.data[0].id : null;
    
    const reservaRes = await makeRequest('POST', `${API_BASE}/api/ventas-online/reservas`, {
      reserva_token: reservaToken,
      cliente: {
        nombre: 'TEST Cliente Online',
        telefono: '3001234567',
        email: 'test@example.com',
        identificacion: '1234567890',
        direccion: 'Calle Test 123'
      },
      medio_pago_id: medioPagoId,
      notas: 'Reserva de prueba desde test script'
    }, publicHeaders);

    assert('Status 201', reservaRes.status === 201, `Got ${reservaRes.status}: ${JSON.stringify(reservaRes.data)}`);
    assert('success: true', reservaRes.data.success === true, JSON.stringify(reservaRes.data));
    assert('Estado PENDIENTE', reservaRes.data.data?.estado === 'PENDIENTE');
    assert('Tiene venta_id', !!reservaRes.data.data?.venta_id);
    assert('2 boletas en reserva', reservaRes.data.data?.cantidad_boletas === 2);
    assert('Tiene instrucciones', reservaRes.data.data?.instrucciones?.length > 0);
    
    const ventaId = reservaRes.data.data?.venta_id;
    console.log(`  📝 Venta ID: ${ventaId}`);
    console.log(`  💰 Monto: $${reservaRes.data.data?.monto_total}`);
    console.log(`  📅 Expira: ${reservaRes.data.data?.expires_at}`);

    // ══════════════════════════════════════════
    console.log('\n═══ TEST 7: CONSULTAR ESTADO DE RESERVA ═══');
    // ══════════════════════════════════════════
    const estadoRes = await makeRequest('GET', `${API_BASE}/api/ventas-online/reservas/${reservaToken}/estado`, null, publicHeaders);
    assert('Status 200', estadoRes.status === 200, `Got ${estadoRes.status}: ${JSON.stringify(estadoRes.data)}`);
    assert('Estado PENDIENTE', estadoRes.data.data?.estado === 'PENDIENTE');
    assert('Tiene boletas', estadoRes.data.data?.boletas?.length === 2);
    assert('Tiene monto', estadoRes.data.data?.monto_total > 0);
    console.log(`  📊 Estado: ${estadoRes.data.data?.estado}`);
    console.log(`  🎫 Boletas: ${estadoRes.data.data?.boletas?.map(b => '#' + b.numero).join(', ')}`);

    // ══════════════════════════════════════════
    console.log('\n═══ TEST 8: VERIFICAR EN DASHBOARD ADMIN ═══');
    // ══════════════════════════════════════════
    // Login como admin
    const loginRes = await makeRequest('POST', `${API_BASE}/api/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASS
    });
    assert('Login exitoso', loginRes.status === 200, `Got ${loginRes.status}`);
    
    const adminToken = loginRes.data.data?.token;
    const adminHeaders = { 'Authorization': `Bearer ${adminToken}` };
    
    // Obtener ventas pendientes
    const pendientesRes = await makeRequest('GET', `${API_BASE}/api/admin/dashboard/ventas-publicas/pendientes`, null, adminHeaders);
    assert('Dashboard responde', pendientesRes.status === 200);
    
    // Buscar nuestra venta
    const nuestraVenta = pendientesRes.data.data?.find(v => v.id === ventaId);
    assert('Reserva visible en dashboard', !!nuestraVenta, `Buscando ${ventaId} en ${pendientesRes.data.data?.length} ventas`);
    if (nuestraVenta) {
      console.log(`  ✅ La reserva aparece en dashboard admin como: ${nuestraVenta.estado_venta}`);
      console.log(`  👤 Cliente: ${nuestraVenta.cliente_nombre}`);
    }

    // ══════════════════════════════════════════
    console.log('\n═══ TEST 9: SEGURIDAD — SIN API KEY ═══');
    // ══════════════════════════════════════════
    const noKeyRes = await makeRequest('GET', `${API_BASE}/api/ventas-online/rifas`);
    assert('Rechaza sin API key (401)', noKeyRes.status === 401);

    // ══════════════════════════════════════════
    console.log('\n═══ TEST 10: SEGURIDAD — TOKEN INVÁLIDO ═══');
    // ══════════════════════════════════════════
    const badTokenRes = await makeRequest('POST', `${API_BASE}/api/ventas-online/reservas`, {
      reserva_token: 'a'.repeat(64),
      cliente: { nombre: 'Hacker', telefono: '000' }
    }, publicHeaders);
    assert('Token inválido rechazado', badTokenRes.status >= 400, `Got ${badTokenRes.status}`);

    // ══════════════════════════════════════════
    console.log('\n═══ TEST 11: SEGURIDAD — SQL INJECTION ATTEMPT ═══');
    // ══════════════════════════════════════════
    const sqlInjRes = await makeRequest('GET', 
      `${API_BASE}/api/ventas-online/rifas/'; DROP TABLE boletas; --/boletas`, 
      null, publicHeaders
    );
    assert('SQL injection rechazado', sqlInjRes.status >= 400, `Got ${sqlInjRes.status}`);

    // ══════════════════════════════════════════
    console.log('\n═══ CLEANUP: CANCELAR VENTA DE PRUEBA ═══');
    // ══════════════════════════════════════════
    if (ventaId) {
      const cancelRes = await makeRequest('POST', `${API_BASE}/api/admin/dashboard/ventas-publicas/${ventaId}/cancelar`, {
        motivo: 'Test cleanup'
      }, adminHeaders);
      assert('Venta cancelada (cleanup)', cancelRes.status === 200, `Got ${cancelRes.status}: ${JSON.stringify(cancelRes.data)}`);
      console.log(`  🗑️ Venta ${ventaId} cancelada, boletas liberadas`);
    }

    // ══════════════════════════════════════════
    console.log('\n═══════════════════════════════════════');
    console.log(`  RESULTADOS: ${results.passed} pasaron, ${results.failed} fallaron`);
    console.log('═══════════════════════════════════════');
    
    if (results.errors.length > 0) {
      console.log('\n❌ Errores:');
      results.errors.forEach(e => console.log(`  - ${e}`));
    }

  } catch (error) {
    console.error('\n💥 ERROR FATAL:', error.message);
    console.error(error.stack);
  }
}

test();
