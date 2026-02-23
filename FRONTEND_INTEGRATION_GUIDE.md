# 🎯 Guía de Implementación Frontend - Web Pública

## 📍 Resumen de URLs

**Backend API:**
- Base URL: `https://tu-dominio.com/api`
- Public endpoints: `/api/public/*` (requiere API Key)
- Admin endpoints: `/api/admin/dashboard/*` (requiere JWT)

---

## 🔧 Configuración Inicial Frontend

### 1. Crear cliente HTTP con API Key

**JavaScript/Fetch:**
```javascript
const API_URL = 'https://tu-dominio.com/api';
const API_KEY = 'tu-api-key-publica';

const apiClient = {
  async get(endpoint) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
      }
    });
    return response.json();
  },

  async post(endpoint, data) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    return response.json();
  }
};
```

**React/Axios:**
```javascript
import axios from 'axios';

const apiClient = axios.create({
  baseURL: 'https://tu-dominio.com/api',
  headers: {
    'x-api-key': process.env.REACT_APP_API_KEY,
    'Content-Type': 'application/json'
  }
});
```

---

## 🛒 Flujo de Compra Completo

### Paso 1: Cargar Rifas Disponibles

```javascript
async function cargarRifas() {
  try {
    const response = await apiClient.get('/public/rifas');
    
    if (!response.success) {
      console.error('Error:', response.message);
      return;
    }

    // response.data contiene las rifas
    mostrarRifas(response.data);
  } catch (error) {
    console.error('Error obteniendo rifas:', error);
  }
}

function mostrarRifas(rifas) {
  const container = document.getElementById('rifas-container');
  
  rifas.forEach(rifa => {
    const card = `
      <div class="rifa-card" data-rifa-id="${rifa.id}">
        <img src="${rifa.imagen_url}" alt="${rifa.nombre}">
        <h3>${rifa.nombre}</h3>
        <p>${rifa.descripcion}</p>
        <p>💰 Precio boleta: $${rifa.precio_boleta}</p>
        <p>📅 Sorteo: ${new Date(rifa.fecha_sorteo).toLocaleDateString()}</p>
        <p>📊 Boletas: ${rifa.boletas_disponibles} disponibles</p>
        <button onclick="seleccionarRifa('${rifa.id}')">
          Comprar boletas
        </button>
      </div>
    `;
    container.innerHTML += card;
  });
}
```

---

### Paso 2: Ver Boletas Disponibles

```javascript
async function seleccionarRifa(rifaId) {
  try {
    const response = await apiClient.get(`/public/rifas/${rifaId}/boletas`);
    
    if (!response.success) {
      alert('Error al cargar boletas: ' + response.message);
      return;
    }

    mostrarBoletasDisponiblES(response.data, rifaId);
  } catch (error) {
    console.error('Error cargando boletas:', error);
  }
}

function mostrarBoletasDisponibles(boletas, rifaId) {
  // Guardar rifaId en contexto
  window.rifaActual = rifaId;
  
  const container = document.getElementById('boletas-container');
  container.innerHTML = '<h3>Selecciona boletas</h3>';
  
  const boletasList = `
    <div class="boletas-grid">
      ${boletas.map(boleta => `
        <div class="boleta-option">
          <input 
            type="checkbox" 
            class="boleta-checkbox"
            value="${boleta.id}"
            data-numero="${boleta.numero}"
            data-token=""
          >
          <label>#${boleta.numero}</label>
        </div>
      `).join('')}
    </div>
    <button onclick="confirmarBoletasSeleccionadas()">
      Confirmar selección
    </button>
  `;
  
  container.innerHTML += boletasList;
}
```

---

### Paso 3: Bloquear Boletas Seleccionadas

```javascript
async function confirmarBoletasSeleccionadas() {
  const checkboxes = document.querySelectorAll('.boleta-checkbox:checked');
  
  if (checkboxes.length === 0) {
    alert('Debes seleccionar al menos una boleta');
    return;
  }

  try {
    // Para CADA boleta seleccionada, bloquearla
    const boletasConToken = await Promise.all(
      Array.from(checkboxes).map(async (checkbox) => {
        const boletaId = checkbox.value;
        
        // Llamar al endpoint de bloqueo
        const response = await apiClient.post(
          `/public/boletas/${boletaId}/bloquear`,
          { tiempo_bloqueo_minutos: 15 }
        );

        if (!response.success) {
          throw new Error(`No se pudo bloquear boleta ${checkbox.dataset.numero}`);
        }

        // Guardar el token
        return {
          id: boletaId,
          numero: checkbox.dataset.numero,
          reserva_token: response.data.reserva_token,
          bloqueo_hasta: response.data.bloqueo_hasta
        };
      })
    );

    console.log('Boletas bloqueadas:', boletasConToken);
    
    // Guardar en estado global para luego usar en la venta
    window.boletasSeleccionadas = boletasConToken;
    
    // Mostrar formulario de cliente
    mostrarFormularioCliente(boletasConToken);
    
  } catch (error) {
    console.error('Error bloqueando boletas:', error);
    alert('Error: ' + error.message);
  }
}
```

---

### Paso 4: Formulario de Datos del Cliente

```html
<div id="formulario-cliente" style="display:none;">
  <h3>Completa tus datos</h3>
  
  <form id="form-cliente">
    <div>
      <label>Nombre completo *</label>
      <input type="text" id="cliente-nombre" required>
    </div>
    
    <div>
      <label>Teléfono *</label>
      <input type="tel" id="cliente-telefono" required>
    </div>
    
    <div>
      <label>Email</label>
      <input type="email" id="cliente-email">
    </div>
    
    <div>
      <label>Identificación (Cédula/Pasaporte)</label>
      <input type="text" id="cliente-identificacion">
    </div>
    
    <div>
      <label>Dirección</label>
      <input type="text" id="cliente-direccion">
    </div>

    <div>
      <label>Método de pago *</label>
      <select id="metodo-pago" required>
        <option value="">-- Selecciona --</option>
        <option value="nequi">Nequi</option>
        <option value="trasferencia">Transferencia bancaria</option>
        <option value="efectivo">Efectivo</option>
      </select>
    </div>

    <button type="submit">Continuar</button>
  </form>
</div>
```

```javascript
function mostrarFormularioCliente(boletas) {
  const formulario = document.getElementById('formulario-cliente');
  formulario.style.display = 'block';

  // Mostrar resumen de boletas seleccionadas
  const resumen = `
    <p>📌 Boletas seleccionadas: ${boletas.map(b => b.numero).join(', ')}</p>
    <p>⏱️ Bloqueo válido hasta: ${new Date(boletas[0].bloqueo_hasta).toLocaleTimeString()}</p>
  `;
  formulario.innerHTML = resumen + formulario.innerHTML;

  document.getElementById('form-cliente').addEventListener('submit', procesarCompra);
}
```

---

### Paso 5: Calcular Total y Procesar Compra

```javascript
async function procesarCompra(event) {
  event.preventDefault();

  // Obtener datos del cliente
  const cliente = {
    nombre: document.getElementById('cliente-nombre').value,
    telefono: document.getElementById('cliente-telefono').value,
    email: document.getElementById('cliente-email').value,
    identificacion: document.getElementById('cliente-identificacion').value,
    direccion: document.getElementById('cliente-direccion').value
  };

  const metodoPago = document.getElementById('metodo-pago').value;

  // Obtener boletas guardadas
  const boletas = window.boletasSeleccionadas;

  // Calcular total
  const precioUnitario = 50000; // Obtener de la rifa
  const cantidad = boletas.length;
  const totalVenta = precioUnitario * cantidad;

  // Preguntar al usuario qué tipo de compra desea
  const tipoPago = await preguntarTipoPago();

  let totalPagado = 0;
  switch (tipoPago) {
    case 'reserva':
      totalPagado = 0; // Solo reserva
      break;
    case 'abono':
      totalPagado = Math.floor(totalVenta / 2); // 50% de abono
      break;
    case 'completo':
      totalPagado = totalVenta; // Pago completo
      break;
  }

  try {
    // Enviar venta al backend
    const response = await apiClient.post('/public/ventas', {
      rifa_id: window.rifaActual,
      cliente,
      boletas: boletas.map(b => ({
        id: b.id,
        reserva_token: b.reserva_token
      })),
      total_venta: totalVenta,
      total_pagado: totalPagado,
      metodo_pago_id: metodoPago,
      notas: `Compra desde web pública - Método: ${metodoPago}`
    });

    if (!response.success) {
      alert('Error: ' + response.message);
      return;
    }

    console.log('Venta creada:', response.data);
    
    // Mostrar comprobante
    mostrarComprobante(response.data, cliente, boletas, totalVenta, totalPagado);
    
  } catch (error) {
    console.error('Error creando venta:', error);
    alert('Error procesando la compra');
  }
}

async function preguntarTipoPago() {
  return new Promise((resolve) => {
    const dialog = `
      <div class="modal">
        <h4>¿Cómo deseas pagar?</h4>
        <button onclick="resolverPago('reserva')">Solo Reservar</button>
        <button onclick="resolverPago('abono')">Abonar 50%</button>
        <button onclick="resolverPago('completo')">Pagar Completo</button>
      </div>
    `;
    document.body.innerHTML += dialog;
    
    window.resolverPago = function(tipo) {
      document.querySelector('.modal').remove();
      resolve(tipo);
    };
  });
}
```

---

### Paso 6: Mostrar Comprobante

```javascript
function mostrarComprobante(venta, cliente, boletas, totalVenta, totalPagado) {
  const comprobante = `
    <div class="comprobante">
      <h2>✅ Compra Registrada Exitosamente</h2>
      
      <div class="seccion">
        <h3>Información de la Venta</h3>
        <p><strong>ID Venta:</strong> ${venta.venta_id}</p>
        <p><strong>Estado:</strong> ${venta.estado}</p>
        <p><strong>Fecha:</strong> ${new Date(venta.created_at).toLocaleString()}</p>
      </div>

      <div class="seccion">
        <h3>Datos del Cliente</h3>
        <p><strong>Nombre:</strong> ${cliente.nombre}</p>
        <p><strong>Teléfono:</strong> ${cliente.telefono}</p>
        <p><strong>Email:</strong> ${cliente.email || 'No proporcionado'}</p>
      </div>

      <div class="seccion">
        <h3>Boletas Seleccionadas</h3>
        <p>Números: ${boletas.map(b => b.numero).join(', ')}</p>
      </div>

      <div class="seccion resumen-pago">
        <h3>Resumen de Pago</h3>
        <p>
          <strong>Valor unitario:</strong> $${50000.toLocaleString('es-CO')}
        </p>
        <p>
          <strong>Cantidad boletas:</strong> ${boletas.length}
        </p>
        <p>
          <strong>Total:</strong> $${totalVenta.toLocaleString('es-CO')}
        </p>
        <p>
          <strong>Pagado hoy:</strong> $${totalPagado.toLocaleString('es-CO')}
        </p>
        ${totalPagado < totalVenta ? `
          <p style="color: red;">
            <strong>Saldo pendiente:</strong> $${(totalVenta - totalPagado).toLocaleString('es-CO')}
          </p>
        ` : ''}
      </div>

      ${venta.estado === 'ABONADA' ? `
        <div class="seccion" style="background-color: #fff3cd; padding: 10px; border-radius: 5px;">
          <h4>⚠️ Próximos pasos:</h4>
          <p>El administrador revisará tu compra.</p>
          <p>Te contactaremos al ${cliente.telefono} para confirmar el pago restante.</p>
        </div>
      ` : ''}

      ${venta.estado === 'PENDIENTE' ? `
        <div class="seccion" style="background-color: #d1ecf1; padding: 10px; border-radius: 5px;">
          <h4>ℹ️ Tu reserva está vigente</h4>
          <p>Tienes tiempo para completar el pago.</p>
          <p>Te contactaremos pronto para confirmar tu compra.</p>
        </div>
      ` : ''}

      <button onclick="descargarComprobante('${venta.venta_id}')">
        📄 Descargar Comprobante
      </button>
      
      <button onclick="location.reload()">
        Hacer otra compra
      </button>
    </div>
  `;

  document.body.innerHTML = comprobante;
}
```

---

## 📊 Panel Admin - Gestión de Ventas Públicas

### Obtener Ventas Pendientes

```javascript
const API_ADMIN = axios.create({
  baseURL: 'https://tu-dominio.com/api/admin/dashboard',
  headers: {
    'Authorization': `Bearer ${localStorage.getItem('jwt_token')}`,
    'Content-Type': 'application/json'
  }
});

async function cargarVentasPendientes() {
  try {
    const response = await API_ADMIN.get('/ventas-publicas/pendientes');
    
    mostrarVentasPendientes(response.data.data);
  } catch (error) {
    console.error('Error:', error);
  }
}

function mostrarVentasPendientes(ventas) {
  const tabla = `
    <table>
      <thead>
        <tr>
          <th>ID Venta</th>
          <th>Cliente</th>
          <th>Teléfono</th>
          <th>Rifa</th>
          <th>Total</th>
          <th>Pagado</th>
          <th>Estado</th>
          <th>Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${ventas.map(venta => `
          <tr>
            <td>${venta.id.substring(0, 8)}</td>
            <td>${venta.cliente_nombre}</td>
            <td>${venta.cliente_telefono}</td>
            <td>${venta.rifa_nombre}</td>
            <td>$${venta.monto_total.toLocaleString()}</td>
            <td>$${venta.abono_total.toLocaleString()}</td>
            <td>${venta.estado_venta}</td>
            <td>
              <button onclick="verDetalles('${venta.id}')">Ver</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  
  document.getElementById('ventas-container').innerHTML = tabla;
}
```

### Ver Detalles y Confirmar Pago

```javascript
async function verDetalles(ventaId) {
  try {
    const response = await API_ADMIN.get(`/ventas-publicas/${ventaId}`);
    const venta = response.data.data;

    const detalles = `
      <div class="modal-detalles">
        <h3>Detalles de Venta</h3>
        
        <h4>Cliente</h4>
        <p>${venta.cliente_nombre} | ${venta.cliente_telefono}</p>
        
        <h4>Boletas</h4>
        <p>${venta.boletas.map(b => b.numero).join(', ')}</p>
        
        <h4>Montos</h4>
        <p>Total: $${venta.monto_total.toLocaleString()}</p>
        <p>Pagado: $${venta.abono_total.toLocaleString()}</p>
        <p>Saldo: $${venta.saldo_pendiente.toLocaleString()}</p>

        <h4>Abonos Pendientes</h4>
        ${venta.abonos_pendientes.map(abono => `
          <div style="border: 1px solid #ccc; padding: 10px; margin: 10px 0;">
            <p>Boleta #${abono.boleta_numero} - $${abono.monto.toLocaleString()}</p>
            <p>Método: ${abono.medio_pago_nombre}</p>
            <p>Estado: <strong>${abono.estado}</strong></p>
            ${abono.estado === 'REGISTRADO' ? `
              <button onclick="confirmarPago('${abono.id}')">
                ✅ Confirmar pago
              </button>
            ` : ''}
          </div>
        `).join('')}

        <button onclick="cancelarVenta('${ventaId}')">
          ❌ Cancelar venta
        </button>
      </div>
    `;

    document.body.innerHTML += detalles;
  } catch (error) {
    console.error('Error:', error);
  }
}

async function confirmarPago(abonoId) {
  try {
    const response = await API_ADMIN.post(`/abonos/${abonoId}/confirmar`);
    
    alert('✅ Pago confirmado');
    location.reload();
  } catch (error) {
    alert('Error: ' + error.response.data.message);
  }
}
```

---

## 🎨 Estilos CSS Sugeridos

```css
.rifa-card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 15px;
  margin: 10px;
  text-align: center;
  cursor: pointer;
  transition: transform 0.2s;
}

.rifa-card:hover {
  transform: translateY(-5px);
  box-shadow: 0 4px 8px rgba(0,0,0,0.2);
}

.boletas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
  gap: 10px;
  margin: 20px 0;
}

.boleta-option {
  border: 2px solid #ddd;
  padding: 10px;
  border-radius: 5px;
  text-align: center;
  cursor: pointer;
}

.boleta-option input:checked + label {
  background-color: #28a745;
  color: white;
  font-weight: bold;
}

.comprobante {
  background-color: #f8f9fa;
  padding: 20px;
  border-radius: 8px;
  margin-top: 20px;
}

.seccion {
  margin: 20px 0;
  padding: 15px;
  border: 1px solid #dee2e6;
  border-radius: 5px;
}

.resumen-pago {
  background-color: #e7f3ff;
  font-weight: bold;
}
```

---

## 🔐 Manejo de Errores

```javascript
async function manejarError(error) {
  console.error('Error:', error);

  if (error.response) {
    // Error del servidor
    const { status, data } = error.response;

    switch (status) {
      case 400:
        alert('Error: ' + (data.message || 'Datos inválidos'));
        break;
      case 401:
        alert('Tu sesión expiró. Por favor inicia sesión nuevamente.');
        redirectToLogin();
        break;
      case 404:
        alert('Recurso no encontrado');
        break;
      case 500:
        alert('Error del servidor. Intenta más tarde.');
        break;
      default:
        alert('Error: ' + (data.message || 'Intenta nuevamente'));
    }
  } else {
    alert('Error de conexión. Verifica tu internet.');
  }
}
```

---

## ✅ Checklist de Implementación

- [ ] Configurar cliente HTTP con API Key
- [ ] Página de lista de rifas
- [ ] Página de selección de boletas
- [ ] Formulario de datos del cliente
- [ ] Cálculo de totales y tipos de pago
- [ ] Integración con endpoint POST /ventas
- [ ] Página de comprobante
- [ ] Panel admin para gestionar ventas
- [ ] Confirmación manual de pagos
- [ ] Estadísticas por rifa
- [ ] Pruebas end-to-end
- [ ] Deploy a producción

