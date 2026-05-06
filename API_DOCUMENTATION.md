# 📚 Documentación API - Sistema Rifas Backend

## 🌐 Módulo Public (Web Externa - Sin autenticación)

### 🔐 Autenticación
Todos los endpoints del módulo `/api/public` requieren un **API Key** en el header:
```
x-api-key TU_API_KEY_PUBLIC
```

---

### 1️⃣ Obtener Rifas Activas
```
GET /api/public/rifas
```

**Respuesta (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-rifa-1",
      "nombre": "Rifa Vacacional 2026",
      "precio_boleta": 50000,
      "fecha_sorteo": "2026-03-15T00:00:00Z",
      "descripcion": "Viaje para 2 personas a Cartagena",
      "premio_principal": "Viaje Cartagena",
      "imagen_url": "https://...",
      "total_boletas": 1000,
      "boletas_vendidas": 245,
      "boletas_disponibles": 755
    }
  ],
  "count": 1
}
```

---

### 2️⃣ Obtener Boletas Disponibles de una Rifa
```
GET /api/public/rifas/:rifaId/boletas
```

**Parámetros:**
- `rifaId` (UUID): ID de la rifa

**Respuesta (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-boleta-1",
      "numero": 1,
      "estado": "DISPONIBLE",
      "bloqueo_hasta": null
    },
    {
      "id": "uuid-boleta-2",
      "numero": 2,
      "estado": "DISPONIBLE",
      "bloqueo_hasta": null
    }
  ],
  "count": 500
}
```

**Estados posibles de boleta:**
- `DISPONIBLE`: Libre para comprar
- `RESERVADA`: Bloqueada temporalmente
- `ABONADA`: Pago parcial realizado
- `PAGADA`: Pagada completamente
- `TRANSFERIDA`: Transferida a otro cliente
- `ANULADA`: Anulada

---

### 3️⃣ Bloquear una Boleta (Reserva)
```
POST /api/public/boletas/:id/bloquear
```

**Parámetros:**
- `id` (UUID): ID de la boleta

**Body (opcional):**
```json
{
  "tiempo_bloqueo_minutos": 15
}
```

**Respuesta (200):**
```json
{
  "success": true,
  "message": "Boleta bloqueada correctamente",
  "data": {
    "boleta_id": "uuid-boleta-1",
    "numero": 1,
    "reserva_token": "a1b2c3d4e5f6g7h8...",
    "bloqueo_hasta": "2026-02-21T14:30:00Z",
    "tiempo_bloqueo_minutos": 15
  }
}
```

**⚠️ Importante:**
- El `reserva_token` **DEBE guardarse** en el frontend
- Es necesario para crear la venta
- Expira en 15 minutos (configurable)
- Si expira sin crear venta, la boleta se libera automáticamente

---

### 4️⃣ Crear Venta desde Web Pública
```
POST /api/public/ventas
```

**Body obligatorio:**
```json
{
  "rifa_id": "uuid-rifa-1",
  "cliente": {
    "nombre": "Juan Pérez",
    "telefono": "3001234567",
    "email": "juan@example.com",
    "identificacion": "1087654321",
    "direccion": "Calle 10 #20-30"
  },
  "boletas": [
    {
      "id": "uuid-boleta-1",
      "reserva_token": "a1b2c3d4e5f6g7h8..."
    },
    {
      "id": "uuid-boleta-2",
      "reserva_token": "b2c3d4e5f6g7h8i9..."
    }
  ],
  "total_venta": 100000,
  "total_pagado": 50000,
  "metodo_pago_id": "uuid-metodo-pago",
  "notas": "Cliente solicita entrega a domicilio"
}
```

**Estados posibles (según total_pagado):**
- `PENDIENTE`: Si `total_pagado = 0` (solo reserva)
- `ABONADA`: Si `0 < total_pagado < total_venta`
- `PAGADA`: Si `total_pagado >= total_venta`

**Respuesta (201):**
```json
{
  "success": true,
  "message": "Venta registrada correctamente desde web pública",
  "data": {
    "venta_id": "uuid-venta-1",
    "estado": "ABONADA",
    "cliente_id": "uuid-cliente-1",
    "total_venta": 100000,
    "total_pagado": 50000,
    "saldo_pendiente": 50000,
    "boletas_bloqueadas": 2,
    "origen": "web_publica",
    "created_at": "2026-02-21T14:25:00Z"
  }
}
```

---

## 🛡️ Módulo Admin Dashboard (Gestión ventas públicas)

### 🔐 Autenticación
Todos los endpoints requieren **JWT Token** como Bearer:
```
Authorization: Bearer <tu_jwt_token>
```

⚠️ **Solo ADMIN y SUPER_ADMIN pueden acceder**

---

### 1️⃣ Listar Ventas Públicas
```
GET /api/admin/dashboard/ventas-publicas?estado=ABONADA&rifa_id=xxx&cliente_nombre=Juan
```

**Query Parameters (opcionales):**
- `estado`: PENDIENTE, ABONADA, PAGADA
- `rifa_id`: Filtrar por rifa
- `cliente_nombre`: Filtrar por nombre client

**Respuesta (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-venta-1",
      "rifa_id": "uuid-rifa-1",
      "cliente_id": "uuid-cliente-1",
      "monto_total": 100000,
      "abono_total": 50000,
      "saldo_pendiente": 50000,
      "estado_venta": "ABONADA",
      "medio_pago_id": "uuid-metodo-1",
      "created_at": "2026-02-21T14:25:00Z",
      "cliente_nombre": "Juan Pérez",
      "cliente_telefono": "3001234567",
      "cliente_email": "juan@example.com",
      "cliente_identificacion": "1087654321",
      "rifa_nombre": "Rifa Vacacional 2026",
      "cantidad_boletas": 2
    }
  ],
  "count": 15
}
```

---

### 2️⃣ Listar SOLO Ventas Pendientes
```
GET /api/admin/dashboard/ventas-publicas/pendientes
```

**Respuesta (200):** 
Mismo formato que el anterior, pero filtrando solo ventas en estado `PENDIENTE` y `ABONADA`.

---

### 3️⃣ Obtener Detalles Completos de Venta
```
GET /api/admin/dashboard/ventas-publicas/:ventaId
```

**Parámetros:**
- `ventaId` (UUID): ID de la venta

**Respuesta (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid-venta-1",
    "rifa_id": "uuid-rifa-1",
    "cliente_id": "uuid-cliente-1",
    "monto_total": 100000,
    "abono_total": 50000,
    "saldo_pendiente": 50000,
    "estado_venta": "ABONADA",
    "medio_pago_id": "uuid-metodo-1",
    "created_at": "2026-02-21T14:25:00Z",
    "updated_at": "2026-02-21T14:30:00Z",
    "cliente_nombre": "Juan Pérez",
    "cliente_telefono": "3001234567",
    "cliente_email": "juan@example.com",
    "cliente_identificacion": "1087654321",
    "cliente_direccion": "Calle 10 #20-30",
    "rifa_nombre": "Rifa Vacacional 2026",
    "precio_boleta": 50000,
    "medio_pago_nombre": "Nequi",
    "boletas": [
      {
        "boleta_id": "uuid-boleta-1",
        "numero": 1,
        "estado": "ABONADA"
      },
      {
        "boleta_id": "uuid-boleta-2",
        "numero": 2,
        "estado": "ABONADA"
      }
    ],
    "abonos_pendientes": [
      {
        "id": "uuid-abono-1",
        "venta_id": "uuid-venta-1",
        "boleta_id": "uuid-boleta-1",
        "monto": 50000,
        "moneda": "COP",
        "estado": "REGISTRADO",
        "notas": "Venta desde web pública",
        "created_at": "2026-02-21T14:25:00Z",
        "boleta_numero": 1,
        "medio_pago_nombre": "Nequi"
      }
    ]
  }
}
```

---

### 4️⃣ Confirmar Pago Manual
```
POST /api/admin/dashboard/abonos/:abonoId/confirmar
```

**Parámetros:**
- `abonoId` (UUID): ID del abono a confirmarm

**Body:** (opcional)
```json
{}
```

**Respuesta (200):**
```json
{
  "success": true,
  "message": "Pago confirmado correctamente",
  "data": {
    "success": true,
    "message": "Pago confirmado correctamente",
    "abono_id": "uuid-abono-1",
    "venta_id": "uuid-venta-1"
  }
}
```

**🔄 Qué sucede al confirmar:**
1. El abono pasa de estado `REGISTRADO` → `CONFIRMADO`
2. Si el total abonado >= precio boleta, la boleta pasa a `PAGADA`
3. Si todas las boletas están `PAGADA`, la venta pasa a `PAGADA` automáticamente

---

### 5️⃣ Cancelar Venta Pública
```
POST /api/admin/dashboard/ventas-publicas/:ventaId/cancelar
```

**Parámetros:**
- `ventaId` (UUID): ID de la venta a cancelar

**Body (opcional):**
```json
{
  "motivo": "Cliente solicitó cancelación"
}
```

**Respuesta (200):**
```json
{
  "success": true,
  "message": "Venta cancelada exitosamente",
  "data": {
    "success": true,
    "message": "Venta cancelada y boletas liberadas",
    "venta_id": "uuid-venta-1"
  }
}
```

**🔄 Qué sucede al cancelar:**
1. La venta pasa a estado `CANCELADA`
2. Todas sus boletas vuelven a `DISPONIBLE`
3. Se liberan todas las reservas

---

### 6️⃣ Obtener Estadísticas Generales
```
GET /api/admin/dashboard/estadisticas
```

**Respuesta (200):**
```json
{
  "success": true,
  "data": {
    "total_ventas": 45,
    "ventas_pagadas": 20,
    "ventas_abonadas": 18,
    "ventas_pendientes": 7,
    "total_abonado": 1850000,
    "total_venta": 2250000,
    "saldo_pendiente_total": 400000
  }
}
```

---

### 7️⃣ Obtener Estadísticas por Rifa
```
GET /api/admin/dashboard/estadisticas/por-rifa
```

**Respuesta (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "uuid-rifa-1",
      "rifa_nombre": "Rifa Vacacional 2026",
      "total_ventas_publicas": 25,
      "total_abonado": 1200000,
      "total_venta": 1500000,
      "clientes_unicos": 20
    },
    {
      "id": "uuid-rifa-2",
      "rifa_nombre": "Rifa Electrónica 2026",
      "total_ventas_publicas": 20,
      "total_abonado": 650000,
      "total_venta": 750000,
      "clientes_unicos": 18
    }
  ],
  "count": 2
}
```

---

## 📱 Flujo Completo desde Frontend (Web Pública)

### Paso 1: Obtener rifas disponibles
```
GET /api/public/rifas
Headers: x-api-key: TU_API_KEY
```

### Paso 2: Mostrar boletas de rifa seleccionada
```
GET /api/public/rifas/{rifaId}/boletas
Headers: x-api-key: TU_API_KEY
```

### Paso 3: Cliente selecciona boletas y confirma
Para CADA boleta seleccionada:
```
POST /api/public/boletas/{boletaId}/bloquear
Headers: x-api-key: TU_API_KEY
Body: { "tiempo_bloqueo_minutos": 15 }
```
✅ **Guardar el `reserva_token` de cada respuesta**

### Paso 4: Cliente ingresa datos y selecciona forma de pago
(En el formulario del frontend)

### Paso 5: Crear venta
```
POST /api/public/ventas
Headers: x-api-key: TU_API_KEY
Body: {
  rifa_id,
  cliente: { nombre, telefono, email, identificacion, direccion },
  boletas: [ { id, reserva_token }, ... ],
  total_venta,
  total_pagado (0 si es reserva, parcial si es abono, total si es pago completo),
  metodo_pago_id,
  notas
}
```

---

## 📱 Flujo Completo desde Dashboard (Admin)

### Paso 1: Ver ventas públicas pendientes
```
GET /api/admin/dashboard/ventas-publicas/pendientes
Headers: Authorization: Bearer {jwt_token}
```

### Paso 2: Ver detalles de una venta
```
GET /api/admin/dashboard/ventas-publicas/{ventaId}
Headers: Authorization: Bearer {jwt_token}
```

### Paso 3: Verificar pago y confirmar
**Cuando el admin verifica que el cliente PAGÓ (ej: por Nequi):**
```
POST /api/admin/dashboard/abonos/{abonoId}/confirmar
Headers: Authorization: Bearer {jwt_token}
Body: {}
```

### Paso 4: (Alternativa) Cancelar si no se completa
```
POST /api/admin/dashboard/ventas-publicas/{ventaId}/cancelar
Headers: Authorization: Bearer {jwt_token}
Body: { "motivo": "..." }
```

---

## 🚨 Códigos de Error

| Código | Significado |
|--------|-------------|
| 200 | ✅ Éxito |
| 201 | ✅ Creado exitosamente |
| 400 | ❌ Error en datos enviados |
| 401 | ❌ API Key o JWT inválido |
| 404 | ❌ Recurso no encontrado |
| 500 | ❌ Error del servidor |

---

## 💾 Variables de Entorno Requeridas

```env
# Para módulo public
PUBLIC_API_KEY=tu_api_key_super_segura

# Para módulo admin dashboard
JWT_SECRET=tu_jwt_secret

# Base de datos
DATABASE_URL=postgresql://user:password@host:5432/rifas_db
```

---

## 📋 Resumen de Estados

### Estados de Boleta
- `DISPONIBLE` → Cliente puede comprar
- `RESERVADA` → Bloqueada por cliente durante 15 min
- `ABONADA` → Cliente hizo pago parcial
- `PAGADA` → Pago completo realizado
- `TRANSFERIDA` → Cliente la cedió a otro
- `ANULADA` → Cancelada por admin

### Estados de Venta
- `PENDIENTE` → Solo reserva, sin pago aún
- `ABONADA` → Pago parcial recibido
- `PAGADA` → Pago completo confirmado
- `CANCELADA` → Venta rechazada
- `EXPIRADA` → Vencimiento automático

### Estados de Abono
- `REGISTRADO` → Pendiente de confirmación del admin
- `CONFIRMADO` → Admin verificó y confirmó el pago
- `ANULADO` → Cancelado

---

## 🔒 Seguridad

1. **API Public:** Protegida solo con API Key (para web externa)
2. **Admin Dashboard:** Requiere JWT + estar logueado como ADMIN/SUPER_ADMIN
3. **Transacciones:** Usa database transactions (`FOR UPDATE`) para evitar race conditions
4. **Bloqueos:** Las boletas se bloquean temporalmente, no se eliminan
5. **Auditoría:** Todos los cambios quedan registrados con timestamps
