# 🛒 API de Ventas Online — Documentación Completa para Frontend

> **Base URL**: `https://rifas-backend-production.up.railway.app`
> **Fecha**: Febrero 2026 (actualizado 26/02/2026)
> **Para**: Frontend de elgrancamion.com (página pública de compra)

---

## 📋 Índice

1. [Configuración Inicial](#1-configuración-inicial)
2. [Flujo Completo del Usuario](#2-flujo-completo-del-usuario)
3. [Endpoints Públicos (para el comprador)](#3-endpoints-públicos)
4. [Endpoints Admin (para el dashboard)](#4-endpoints-admin)
5. [Tipos TypeScript](#5-tipos-typescript)
6. [Manejo de Errores](#6-manejo-de-errores)
7. [Ejemplos de Integración](#7-ejemplos-de-integración)

---

## 1. Configuración Inicial

### Header requerido en TODOS los endpoints públicos:

```
x-api-key: pk_4f9a8c7e2d1b6a9f3c0d5e7f8a2b4c6d
```

### Rate Limits (por IP):

| Acción | Límite | Ventana |
|--------|--------|---------|
| Listar rifas/boletas | 60 requests | 1 minuto |
| Bloquear boletas | 10 intentos | 5 minutos |
| Crear reservas | 5 reservas | 1 hora |
| Consultar estado | 30 requests | 5 minutos |

---

## 2. Flujo Completo del Usuario

```
┌─────────────────────────────────────────────────────────┐
│  1. GET /api/ventas-online/rifas                        │
│     → Usuario ve las rifas activas                      │
├─────────────────────────────────────────────────────────┤
│  2. GET /api/ventas-online/rifas/{rifaId}/boletas       │
│     → Usuario ve boletas disponibles                    │
├─────────────────────────────────────────────────────────┤
│  3. POST /api/ventas-online/boletas/bloquear            │
│     → Bloquea las boletas seleccionadas (15 min)        │
│     → Recibe un TOKEN de reserva                        │
├─────────────────────────────────────────────────────────┤
│  4. GET /api/ventas-online/medios-pago                  │
│     → Lista medios de pago para el formulario           │
├─────────────────────────────────────────────────────────┤
│  5. POST /api/ventas-online/reservas                    │
│     → Envía datos del cliente + TOKEN                   │
│     → Backend busca cliente por tel/cédula o crea nuevo │
│     → Se crea la reserva formal (72h para pagar)        │
├─────────────────────────────────────────────────────────┤
│  6. GET /api/ventas-online/reservas/{token}/estado      │
│     → El cliente consulta su estado con el TOKEN        │
├─────────────────────────────────────────────────────────┤
│  ↓ ADMIN VE LA RESERVA EN SU DASHBOARD ↓               │
│  → Admin verifica comprobante → Aprueba o Rechaza       │
└─────────────────────────────────────────────────────────┘
```

---

## 3. Endpoints Públicos

### 3.1 `GET /api/ventas-online/rifas`

**Descripción**: Obtener todas las rifas activas con información de disponibilidad.

**Headers**:
```json
{
  "x-api-key": "pk_4f9a8c7e2d1b6a9f3c0d5e7f8a2b4c6d"
}
```

**Respuesta exitosa (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "a7ed3394-bc23-4646-8b75-473d18c3a0a1",
      "nombre": "rifan 2 prd",
      "precio_boleta": "120000.00",
      "fecha_sorteo": "2025-12-31T00:00:00.000Z",
      "descripcion": "Rifa de producción",
      "premio_principal": "Camioneta Toyota Hilux 2025",
      "imagen_url": null,
      "total_boletas": 10000,
      "boletas_vendidas": 0,
      "boletas_disponibles": "9998"
    }
  ],
  "count": 1
}
```

---

### 3.2 `GET /api/ventas-online/rifas/:rifaId/boletas`

**Descripción**: Obtener todas las boletas disponibles de una rifa específica.

**URL ejemplo**: `/api/ventas-online/rifas/a7ed3394-bc23-4646-8b75-473d18c3a0a1/boletas`

**Parámetros URL**:
| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `rifaId` | UUID | ✅ | ID de la rifa |

**Respuesta exitosa (200)**:
```json
{
  "success": true,
  "data": {
    "rifa": {
      "id": "a7ed3394-bc23-4646-8b75-473d18c3a0a1",
      "nombre": "rifan 2 prd",
      "precio_boleta": "120000.00",
      "total_boletas": 10000,
      "boletas_vendidas": 0,
      "estado": "ACTIVA"
    },
    "boletas": [
      {
        "id": "d992546f-365f-4935-bccf-df05091f4808",
        "numero": 0,
        "estado": "DISPONIBLE",
        "qr_url": "https://elgrancamion.com/verificar/a1b2c3d4...",
        "imagen_url": null
      },
      {
        "id": "2aef3263-ca85-4933-ab0a-32e3a714eae8",
        "numero": 1,
        "estado": "DISPONIBLE",
        "qr_url": "https://elgrancamion.com/verificar/e5f6g7h8...",
        "imagen_url": null
      }
    ],
    "total_disponibles": 9998
  }
}
```

**Error (404)**:
```json
{
  "success": false,
  "message": "Rifa no encontrada o no está activa"
}
```

---

### 3.3 `POST /api/ventas-online/boletas/bloquear`

**Descripción**: Bloquear boletas temporalmente mientras el usuario llena sus datos. Las boletas quedan reservadas por 15 minutos (configurable hasta 30 min). Si no se completa la reserva, se liberan automáticamente.

**Body (JSON)**:
```json
{
  "rifa_id": "a7ed3394-bc23-4646-8b75-473d18c3a0a1",
  "boleta_ids": [
    "d992546f-365f-4935-bccf-df05091f4808",
    "2aef3263-ca85-4933-ab0a-32e3a714eae8"
  ],
  "tiempo_bloqueo_minutos": 15
}
```

**Campos del body**:
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `rifa_id` | UUID | ✅ | ID de la rifa |
| `boleta_ids` | UUID[] | ✅ | Array de IDs de boletas (mín 1, máx 20) |
| `tiempo_bloqueo_minutos` | number | ❌ | Minutos de bloqueo (default: 15, máx: 30) |

**Respuesta exitosa (200)**:
```json
{
  "success": true,
  "message": "Boletas bloqueadas correctamente",
  "data": {
    "reserva_token": "9d2de04eb18e18bc5f7a3c2d1e9f8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f",
    "bloqueo_hasta": "2026-02-26T06:01:14.285Z",
    "tiempo_bloqueo_minutos": 15,
    "boletas": [
      { "id": "d992546f-365f-4935-bccf-df05091f4808", "numero": 0 },
      { "id": "2aef3263-ca85-4933-ab0a-32e3a714eae8", "numero": 1 }
    ]
  }
}
```

> ⚠️ **IMPORTANTE**: Guarda el `reserva_token`. Lo necesitas para crear la reserva y para consultar el estado.

**Errores posibles**:
| Status | Mensaje |
|--------|---------|
| 400 | `Rifa no encontrada o no está activa` |
| 400 | `Máximo 20 boletas por reserva` |
| 409 | `No se pudieron bloquear todas las boletas. Solicitadas: 2, Disponibles: 1. Alguna(s) ya estaba(n) reservada(s) o vendida(s).` |
| 429 | `Ha bloqueado demasiadas boletas. Intente en 5 minutos.` |

---

### 3.4 `POST /api/ventas-online/boletas/liberar`

**Descripción**: Liberar boletas que fueron bloqueadas (el usuario decide cancelar antes de completar la reserva).

**Body (JSON)**:
```json
{
  "reserva_token": "9d2de04eb18e18bc5f7a3c2d1e9f8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f"
}
```

**Campos del body**:
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `reserva_token` | string (hex, 64 chars) | ✅ | Token recibido al bloquear |

**Respuesta exitosa (200)**:
```json
{
  "success": true,
  "message": "Boletas liberadas correctamente",
  "data": {
    "boletas_liberadas": 2,
    "numeros": [0, 1]
  }
}
```

**Error (400)**:
```json
{
  "success": false,
  "message": "No se encontraron boletas con ese token o ya fueron liberadas"
}
```

---

### 3.5 `GET /api/ventas-online/medios-pago`

**Descripción**: Obtener los medios de pago activos para mostrar en el formulario de reserva.

**Respuesta exitosa (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "d397d917-c0d0-4c61-b2b3-2ebfab7deeb7",
      "nombre": "Efectivo",
      "descripcion": "Pago en efectivo físico",
      "activo": true
    },
    {
      "id": "af6e15fc-c52c-4491-abe1-20243af301c4",
      "nombre": "Nequi",
      "descripcion": "Transferencia Nequi",
      "activo": true
    },
    {
      "id": "db94562d-bb01-42a3-9414-6e369a1a70ba",
      "nombre": "PSE",
      "descripcion": "Pago Seguro en Línea",
      "activo": true
    },
    {
      "id": "57a2f560-b3d7-4fa8-91cf-24e6b2a6d7ff",
      "nombre": "Tarjeta Crédito",
      "descripcion": "Tarjeta de crédito",
      "activo": true
    }
  ],
  "count": 4
}
```

---

### 3.6 `POST /api/ventas-online/reservas`

**Descripción**: Crear una reserva formal. Convierte el bloqueo temporal en una reserva con datos del cliente. El administrador recibirá una notificación y deberá aprobar cuando reciba el comprobante de pago.

> 🔄 **Lógica de cliente (automática en el backend)**:
> El comprador siempre envía sus datos normalmente. El backend se encarga de:
> 1. **Buscar por teléfono** → si ya existe un cliente con ese teléfono, se reutiliza
> 2. **Buscar por cédula** → si no lo encontró por teléfono y envió cédula, busca por cédula
> 3. **Si encuentra** → asigna el cliente existente a la venta (no crea duplicados)
> 4. **Si NO encuentra** → crea un cliente nuevo con los datos enviados
>
> Esto es **transparente para el frontend** — siempre se envían los mismos campos.
> El beneficio es que si un cliente ya compró antes, sus ventas quedan vinculadas al mismo registro.

**Body (JSON)**:
```json
{
  "reserva_token": "9d2de04eb18e18bc5f7a3c2d1e9f8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f",
  "cliente": {
    "nombre": "Juan Carlos Pérez",
    "telefono": "3001234567",
    "email": "juan@email.com",
    "identificacion": "1234567890",
    "direccion": "Calle 123 #45-67, Medellín"
  },
  "medio_pago_id": "af6e15fc-c52c-4491-abe1-20243af301c4",
  "notas": "Pago por Nequi, envío comprobante por WhatsApp"
}
```

**Campos del body**:
| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `reserva_token` | string (hex, 64 chars) | ✅ | Token recibido al bloquear boletas |
| `cliente` | object | ✅ | Datos del cliente |
| `cliente.nombre` | string (2-255 chars) | ✅ | Nombre completo |
| `cliente.telefono` | string (7-20 chars, formato: `0-9+-() `) | ✅ | Teléfono de contacto |
| `cliente.email` | string (email válido) | ❌ | Correo electrónico |
| `cliente.identificacion` | string (4-50 chars) | ❌ | Cédula o documento |
| `cliente.direccion` | string (máx 500 chars) | ❌ | Dirección |
| `medio_pago_id` | UUID | ❌ | ID del medio de pago (de `/medios-pago`) |
| `notas` | string (máx 1000 chars) | ❌ | Notas adicionales |

**Respuesta exitosa (201)**:
```json
{
  "success": true,
  "message": "Reserva creada exitosamente",
  "data": {
    "reserva_token": "9d2de04eb18e18bc5f7a3c2d1e9f8b7a6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f",
    "venta_id": "87109e05-3ea6-4964-aa83-674bff326b18",
    "estado": "PENDIENTE",
    "monto_total": 240000,
    "boletas": [0, 1],
    "cantidad_boletas": 2,
    "rifa": "rifan 2 prd",
    "precio_boleta": 120000,
    "cliente_nombre": "Juan Carlos Pérez",
    "expires_at": "2026-03-01T05:32:56.894Z",
    "mensaje": "Reserva creada exitosamente. Tiene 72 horas para enviar su comprobante de pago. Un administrador revisará y aprobará su compra.",
    "instrucciones": [
      "Envíe su comprobante de pago al administrador.",
      "Su reserva será revisada y confirmada.",
      "Si no se confirma el pago en 72 horas, las boletas se liberarán automáticamente.",
      "Puede consultar el estado de su reserva con el token proporcionado."
    ]
  }
}
```

> 💡 **Nota**: `cliente_nombre` refleja el nombre enviado por el comprador. Si el cliente ya existía en la DB (encontrado por teléfono o cédula), la venta se vincula al registro existente. Si es nuevo, se crea automáticamente.

**Errores posibles**:
| Status | Mensaje |
|--------|---------|
| 400 | `Token de reserva inválido` |
| 400 | `Nombre y teléfono del cliente son obligatorios` |
| 400 | `Medio de pago no válido` |
| 404 | `No se encontraron boletas con ese token. Puede que hayan expirado o ya fueron reservadas.` |
| 409 | `La boleta #X ya tiene un cliente asignado.` |
| 410 | `La boleta #X ha expirado. Por favor vuelva a seleccionarla.` |
| 429 | `Ha creado demasiadas reservas. Intente más tarde.` |

---

### 3.7 `GET /api/ventas-online/reservas/:token/estado`

**Descripción**: El cliente consulta el estado de su reserva usando el token que recibió.

**URL ejemplo**: `/api/ventas-online/reservas/9d2de04eb18e18bc.../estado`

**Parámetros URL**:
| Parámetro | Tipo | Requerido | Descripción |
|-----------|------|-----------|-------------|
| `token` | string (hex, 64 chars) | ✅ | Token de reserva |

**Respuesta exitosa (200)**:
```json
{
  "success": true,
  "data": {
    "estado": "PENDIENTE",
    "monto_total": 240000,
    "abono_total": 0,
    "saldo_pendiente": 240000,
    "expires_at": "2026-03-01T05:32:56.894Z",
    "rifa": "rifan 2 prd",
    "premio": "Camioneta Toyota Hilux 2025",
    "fecha_sorteo": "2025-12-31T00:00:00.000Z",
    "cliente": "Juan Carlos Pérez",
    "boletas": [
      { "numero": 0, "estado": "RESERVADA" },
      { "numero": 1, "estado": "RESERVADA" }
    ],
    "created_at": "2026-02-26T05:32:56.894Z"
  }
}
```

**Estados posibles de `estado`**:
| Estado | Significado |
|--------|-------------|
| `PENDIENTE` | Esperando comprobante de pago |
| `ABONADA` | El admin confirmó un abono parcial |
| `PAGADA` | Pago completo confirmado ✅ |
| `CANCELADA` | Cancelada por el admin o por expiración |

**Error (404)**:
```json
{
  "success": false,
  "message": "Reserva no encontrada. Verifique el token."
}
```

---

## 4. Endpoints Admin (Dashboard)

> Estos endpoints requieren **JWT de admin** (login previo), NO api-key.

### Header requerido:
```json
{
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIs..."
}
```

### Login admin:
```
POST /api/auth/login
Body: { "email": "superadmin@rifas.com", "password": "admin123" }
```

---

### 4.1 `GET /api/admin/dashboard/ventas-publicas/pendientes`

**Descripción**: Listar todas las ventas online pendientes de aprobación.

**Respuesta (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "87109e05-3ea6-4964-aa83-674bff326b18",
      "rifa_id": "a7ed3394-bc23-4646-8b75-473d18c3a0a1",
      "cliente_id": "c1234567-...",
      "monto_total": "240000.00",
      "abono_total": "0.00",
      "saldo_pendiente": "240000.00",
      "estado_venta": "PENDIENTE",
      "medio_pago_id": "af6e15fc-...",
      "created_at": "2026-02-26T05:32:56.894Z",
      "cliente_nombre": "Juan Carlos Pérez",
      "cliente_telefono": "3001234567",
      "cliente_email": "juan@email.com",
      "cliente_identificacion": "1234567890",
      "rifa_nombre": "rifan 2 prd",
      "cantidad_boletas": 2
    }
  ],
  "count": 1
}
```

---

### 4.2 `GET /api/admin/dashboard/ventas-publicas`

**Descripción**: Listar TODAS las ventas online con filtros opcionales.

**Query params**:
| Parámetro | Tipo | Descripción |
|-----------|------|-------------|
| `estado` | string | Filtrar por estado: `PENDIENTE`, `ABONADA`, `PAGADA`, `CANCELADA` |
| `rifa_id` | UUID | Filtrar por rifa |
| `cliente_nombre` | string | Buscar por nombre de cliente (ILIKE) |

**Ejemplo**: `/api/admin/dashboard/ventas-publicas?estado=PENDIENTE&cliente_nombre=Juan`

---

### 4.3 `GET /api/admin/dashboard/ventas-publicas/:ventaId`

**Descripción**: Ver detalle completo de una venta con cliente, boletas y abonos.

**Respuesta (200)**:
```json
{
  "success": true,
  "data": {
    "id": "87109e05-3ea6-4964-aa83-674bff326b18",
    "rifa_id": "a7ed3394-...",
    "cliente_id": "c1234567-...",
    "monto_total": "240000.00",
    "abono_total": "0.00",
    "saldo_pendiente": "240000.00",
    "estado_venta": "PENDIENTE",
    "medio_pago_id": "af6e15fc-...",
    "created_at": "2026-02-26T05:32:56.894Z",
    "updated_at": "2026-02-26T05:32:56.894Z",
    "cliente_nombre": "Juan Carlos Pérez",
    "cliente_telefono": "3001234567",
    "cliente_email": "juan@email.com",
    "cliente_identificacion": "1234567890",
    "cliente_direccion": "Calle 123 #45-67, Medellín",
    "rifa_nombre": "rifan 2 prd",
    "precio_boleta": "120000.00",
    "medio_pago_nombre": "Nequi",
    "boletas": [
      { "boleta_id": "d992546f-...", "numero": 0, "estado": "RESERVADA" },
      { "boleta_id": "2aef3263-...", "numero": 1, "estado": "RESERVADA" }
    ],
    "abonos_pendientes": []
  }
}
```

---

### 4.4 `POST /api/admin/dashboard/abonos/:abonoId/confirmar`

**Descripción**: Confirmar un abono cuando el admin verifica el comprobante de pago.

**Body**: Vacío (no requiere body)

**Respuesta (200)**:
```json
{
  "success": true,
  "message": "Pago confirmado correctamente",
  "data": {
    "success": true,
    "message": "Pago confirmado correctamente",
    "abono_id": "abono-uuid-aqui",
    "venta_id": "87109e05-..."
  }
}
```

---

### 4.5 `POST /api/admin/dashboard/ventas-publicas/:ventaId/cancelar`

**Descripción**: Cancelar una venta y liberar todas sus boletas.

**Body (JSON)**:
```json
{
  "motivo": "Cliente no envió comprobante de pago"
}
```

**Respuesta (200)**:
```json
{
  "success": true,
  "message": "Venta cancelada exitosamente",
  "data": {
    "success": true,
    "message": "Venta cancelada y boletas liberadas",
    "venta_id": "87109e05-..."
  }
}
```

---

### 4.6 `GET /api/admin/dashboard/estadisticas`

**Respuesta (200)**:
```json
{
  "success": true,
  "data": {
    "total_ventas": "15",
    "ventas_pagadas": "5",
    "ventas_abonadas": "3",
    "ventas_pendientes": "7",
    "total_abonado": "1200000",
    "total_venta": "3600000",
    "saldo_pendiente_total": "2400000"
  }
}
```

---

### 4.7 `GET /api/admin/dashboard/estadisticas/por-rifa`

**Respuesta (200)**:
```json
{
  "success": true,
  "data": [
    {
      "id": "a7ed3394-...",
      "rifa_nombre": "rifan 2 prd",
      "total_ventas_publicas": "10",
      "total_abonado": "600000",
      "total_venta": "1200000",
      "clientes_unicos": "8"
    }
  ],
  "count": 1
}
```

---

## 5. Tipos TypeScript

```typescript
// ═══════════════════════════════════════
// TIPOS PARA EL FRONTEND PÚBLICO (elgrancamion.com)
// ═══════════════════════════════════════

/** Respuesta genérica de la API */
interface ApiResponse<T> {
  success: boolean
  message?: string
  data?: T
  count?: number
}

/** Rifa activa */
interface RifaPublica {
  id: string
  nombre: string
  precio_boleta: string    // "120000.00"
  fecha_sorteo: string     // ISO date
  descripcion: string | null
  premio_principal: string | null
  imagen_url: string | null
  total_boletas: number
  boletas_vendidas: number
  boletas_disponibles: string
}

/** Boleta disponible */
interface BoletaDisponible {
  id: string               // UUID — necesario para bloquear
  numero: number           // Número visible (0, 1, 2...)
  estado: string           // "DISPONIBLE"
  qr_url: string | null
  imagen_url: string | null
}

/** Info de rifa + sus boletas */
interface BoletasResponse {
  rifa: {
    id: string
    nombre: string
    precio_boleta: string
    total_boletas: number
    boletas_vendidas: number
    estado: string
  }
  boletas: BoletaDisponible[]
  total_disponibles: number
}

/** Resultado de bloquear boletas */
interface BloqueoResult {
  reserva_token: string    // ⚠️ GUARDAR — se necesita para todo
  bloqueo_hasta: string    // ISO date — cuándo expira el bloqueo
  tiempo_bloqueo_minutos: number
  boletas: {
    id: string
    numero: number
  }[]
}

/** Datos del cliente para el formulario */
interface ClienteInput {
  nombre: string           // Requerido (2-255 chars)
  telefono: string         // Requerido (7-20 chars, formato: 0-9+-() )
  email?: string           // Opcional
  identificacion?: string  // Opcional (cédula)
  direccion?: string       // Opcional
}

/** Medio de pago */
interface MedioPago {
  id: string
  nombre: string           // "Nequi", "PSE", "Efectivo", etc.
  descripcion: string
  activo: boolean
}

/** Body para crear reserva */
interface CrearReservaInput {
  reserva_token: string
  cliente: ClienteInput
  medio_pago_id?: string
  notas?: string
}

/** Resultado de crear reserva */
interface ReservaResult {
  reserva_token: string
  venta_id: string
  estado: string           // "PENDIENTE"
  monto_total: number
  boletas: number[]        // [0, 1, 2...]
  cantidad_boletas: number
  rifa: string
  precio_boleta: number
  cliente_nombre: string
  expires_at: string       // ISO date — 72h desde creación
  mensaje: string
  instrucciones: string[]
}

/** Estado de reserva (consulta del cliente) */
interface EstadoReserva {
  estado: 'PENDIENTE' | 'ABONADA' | 'PAGADA' | 'CANCELADA'
  monto_total: number
  abono_total: number
  saldo_pendiente: number
  expires_at: string
  rifa: string
  premio: string | null
  fecha_sorteo: string
  cliente: string
  boletas: {
    numero: number
    estado: string
  }[]
  created_at: string
}
```

---

## 6. Manejo de Errores

Todos los errores siguen este formato:
```json
{
  "success": false,
  "message": "Descripción del error en español"
}
```

### Códigos HTTP que debes manejar:

| Código | Significado | Qué hacer |
|--------|-------------|-----------|
| 200 | Éxito | Mostrar datos |
| 201 | Creado | Reserva creada exitosamente |
| 400 | Datos inválidos | Mostrar error al usuario |
| 401 | Sin API key | Verificar header x-api-key |
| 404 | No encontrado | Rifa/boleta/reserva no existe |
| 409 | Conflicto | Boleta ya está reservada, volver a seleccionar |
| 410 | Expirado | Bloqueo expiró, volver a paso de selección |
| 429 | Rate limit | Mostrar "intente en X minutos" |
| 500 | Error servidor | Mostrar error genérico, reintentar |

---

## 7. Ejemplos de Integración

### Ejemplo completo con fetch (JavaScript):

```javascript
const API_BASE = 'https://rifas-backend-production.up.railway.app';
const API_KEY = 'pk_4f9a8c7e2d1b6a9f3c0d5e7f8a2b4c6d';

const headers = {
  'Content-Type': 'application/json',
  'x-api-key': API_KEY
};

// ═══ PASO 1: Listar rifas ═══
async function listarRifas() {
  const res = await fetch(`${API_BASE}/api/ventas-online/rifas`, { headers });
  const data = await res.json();
  return data.data; // Array de rifas
}

// ═══ PASO 2: Listar boletas de una rifa ═══
async function listarBoletas(rifaId) {
  const res = await fetch(`${API_BASE}/api/ventas-online/rifas/${rifaId}/boletas`, { headers });
  const data = await res.json();
  return data.data; // { rifa, boletas, total_disponibles }
}

// ═══ PASO 3: Bloquear boletas seleccionadas ═══
async function bloquearBoletas(rifaId, boletaIds) {
  const res = await fetch(`${API_BASE}/api/ventas-online/boletas/bloquear`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      rifa_id: rifaId,
      boleta_ids: boletaIds,
      tiempo_bloqueo_minutos: 15
    })
  });
  const data = await res.json();
  
  if (!data.success) {
    throw new Error(data.message);
  }
  
  // ⚠️ GUARDAR este token en localStorage o estado
  const token = data.data.reserva_token;
  localStorage.setItem('reserva_token', token);
  
  return data.data;
}

// ═══ PASO 4: Listar medios de pago ═══
async function listarMediosPago() {
  const res = await fetch(`${API_BASE}/api/ventas-online/medios-pago`, { headers });
  const data = await res.json();
  return data.data;
}

// ═══ PASO 5: Crear reserva formal ═══
async function crearReserva(token, clienteData, medioPagoId) {
  const res = await fetch(`${API_BASE}/api/ventas-online/reservas`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      reserva_token: token,
      cliente: {
        nombre: clienteData.nombre,       // Requerido
        telefono: clienteData.telefono,   // Requerido
        email: clienteData.email,         // Opcional
        identificacion: clienteData.cedula, // Opcional
        direccion: clienteData.direccion  // Opcional
      },
      medio_pago_id: medioPagoId,         // Opcional (UUID del medio de pago)
      notas: clienteData.notas            // Opcional
    })
  });
  const data = await res.json();
  
  if (!data.success) {
    throw new Error(data.message);
  }
  
  return data.data;
  // Resultado incluye: venta_id, estado, monto_total, boletas, instrucciones...
}

// ═══ PASO 6: Consultar estado de reserva ═══
async function consultarEstado(token) {
  const res = await fetch(`${API_BASE}/api/ventas-online/reservas/${token}/estado`, { headers });
  const data = await res.json();
  return data.data;
  // Resultado: estado, monto_total, abono_total, saldo_pendiente, boletas...
}

// ═══ CANCELAR: Si el usuario quiere cancelar ═══
async function cancelarBloqueo(token) {
  const res = await fetch(`${API_BASE}/api/ventas-online/boletas/liberar`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ reserva_token: token })
  });
  return await res.json();
}
```

### Ejemplo con React (hook personalizado):

```jsx
import { useState, useCallback } from 'react';

const API_BASE = 'https://rifas-backend-production.up.railway.app';
const API_KEY = 'pk_4f9a8c7e2d1b6a9f3c0d5e7f8a2b4c6d';

function useVentasOnline() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const apiCall = useCallback(async (endpoint, options = {}) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': API_KEY,
          ...options.headers
        }
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message);
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    getRifas: () => apiCall('/api/ventas-online/rifas'),
    getBoletas: (rifaId) => apiCall(`/api/ventas-online/rifas/${rifaId}/boletas`),
    bloquear: (rifaId, boletaIds) => apiCall('/api/ventas-online/boletas/bloquear', {
      method: 'POST',
      body: JSON.stringify({ rifa_id: rifaId, boleta_ids: boletaIds })
    }),
    liberar: (token) => apiCall('/api/ventas-online/boletas/liberar', {
      method: 'POST',
      body: JSON.stringify({ reserva_token: token })
    }),
    getMediosPago: () => apiCall('/api/ventas-online/medios-pago'),
    reservar: (body) => apiCall('/api/ventas-online/reservas', {
      method: 'POST',
      body: JSON.stringify(body)
    }),
    getEstado: (token) => apiCall(`/api/ventas-online/reservas/${token}/estado`)
  };
}

export default useVentasOnline;
```

---

## 🔐 Notas de Seguridad

1. **El `reserva_token` es SECRETO** — es el "ticket" del cliente. No lo expongas en URLs públicas visibles.
2. **El bloqueo expira en 15 minutos** — si el usuario no completa, las boletas se liberan solas.
3. **La reserva expira en 72 horas** — si no se confirma el pago, el sistema libera las boletas automáticamente.
4. **No se pueden bloquear más de 20 boletas** a la vez.
5. **El rate limiter es por IP** — si un usuario hace muchas requests, se bloquea temporalmente.
6. **Los IDs de boleta son UUID** — necesarios para el bloqueo. Se obtienen del endpoint de listar boletas.

---

## 🧑‍💼 Gestión de Clientes (Automática)

Cuando un comprador crea una reserva en elgrancamion.com, el backend gestiona automáticamente los clientes:

```
┌──────────────────────────────────────────────────────────────┐
│  Comprador envía: nombre, teléfono, email, cédula, dirección│
├──────────────────────────────────────────────────────────────┤
│  1. ¿Existe cliente con ese TELÉFONO en la DB?              │
│     → SÍ: Usar ese cliente existente para la venta          │
│     → NO: Ir al paso 2                                       │
├──────────────────────────────────────────────────────────────┤
│  2. ¿Envió CÉDULA y existe cliente con esa cédula?          │
│     → SÍ: Usar ese cliente existente para la venta          │
│     → NO: Ir al paso 3                                       │
├──────────────────────────────────────────────────────────────┤
│  3. Crear cliente NUEVO con todos los datos enviados         │
│     → Se asigna a la venta automáticamente                   │
└──────────────────────────────────────────────────────────────┘
```

**Beneficios para el admin:**
- Si un cliente ya compró antes, todas sus ventas quedan vinculadas al mismo registro
- El admin puede ver el historial de compras de un cliente desde el dashboard
- No se crean duplicados innecesarios

**Para el frontend:** No cambia nada. El formulario siempre pide los mismos datos (nombre, teléfono, etc.) y el backend se encarga de la lógica internamente.

---

## 🔄 Flujo visual resumido para la UI:

```
[Página de Compra]
   │
   ├─ Paso 1: Seleccionar rifa (GET /rifas)
   │
   ├─ Paso 2: Seleccionar boletas (GET /rifas/:id/boletas)
   │    └─ Muestra grid con números disponibles
   │
   ├─ Paso 3: Clic "Reservar" → bloquea (POST /boletas/bloquear)
   │    └─ ⏱️ Timer de 15 min visible
   │    └─ Guarda token
   │
   ├─ Paso 4: Formulario de datos (GET /medios-pago + formulario)
   │    ├─ Nombre *
   │    ├─ Teléfono *
   │    ├─ Email
   │    ├─ Cédula
   │    ├─ Dirección
   │    ├─ Medio de pago (dropdown)
   │    └─ Notas
   │
   ├─ Paso 5: Confirmar → crea reserva (POST /reservas)
   │    └─ Backend: busca cliente existente (tel/cédula) o crea nuevo
   │    └─ Muestra: resumen + instrucciones + token
   │
   └─ Paso 6: Página de estado (GET /reservas/:token/estado)
        └─ El cliente puede volver aquí para ver si fue aprobado
```
