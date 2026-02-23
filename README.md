# Rifas Backend API

Sistema de gestión de rifas con Node.js y PostgreSQL.

## Estructura del Proyecto

```
rifas-backend/
├── src/
│   ├── app.js              # Configuración de Express
│   ├── server.js           # Inicio del servidor
│   ├── db/
│   │   ├── pool.js         # Pool de conexiones a PostgreSQL
│   │   └── tx.js           # Manejo de transacciones
│   ├── config/
│   │   └── env.js          # Configuración de variables de entorno
│   ├── modules/
│   │   ├── rifas/          # Módulo de rifas
│   │   ├── boletas/        # Módulo de boletas
│   │   ├── ventas/         # Módulo de ventas
│   │   ├── pagos/          # Módulo de pagos
│   │   └── abonos/         # Módulo de abonos
│   ├── middlewares/
│   │   ├── auth.js         # Middleware de autenticación
│   │   ├── error.js        # Middleware de manejo de errores
│   │   └── validate.js     # Middleware de validación
│   └── utils/
│       ├── crypto.js       # Utilidades de criptografía
│       └── logger.js       # Configuración de logging
├── .env                    # Variables de entorno
├── package.json            # Dependencias del proyecto
└── README.md              # Este archivo
```

## Instalación

1. Clonar el repositorio
2. Instalar dependencias:
```bash
npm install
```

3. Configurar variables de entorno en el archivo `.env`:
```env
PORT=3000
NODE_ENV=development

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=rifas_db
DB_USER=postgres
DB_PASSWORD=password

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h

# Security
BCRYPT_ROUNDS=12
```

4. Crear la base de datos PostgreSQL con el esquema correspondiente

## Scripts Disponibles

- `npm start` - Iniciar el servidor en modo producción
- `npm run dev` - Iniciar el servidor en modo desarrollo con nodemon
- `npm test` - Ejecutar pruebas

## Endpoints de la API

### Rifas
- `GET /api/rifas` - Obtener todas las rifas
- `POST /api/rifas` - Crear nueva rifa
- `GET /api/rifas/:id` - Obtener rifa por ID
- `PUT /api/rifas/:id` - Actualizar rifa
- `DELETE /api/rifas/:id` - Eliminar rifa
- `GET /api/rifas/:id/stats` - Estadísticas de rifa

### Boletas
- `GET /api/boletas/rifa/:rifa_id` - Obtener boletas de una rifa
- `POST /api/boletas` - Crear boleta
- `POST /api/boletas/batch` - Crear boletas en lote
- `POST /api/boletas/:id/sell` - Vender boleta
- `GET /api/boletas/rifa/:rifa_id/available` - Boletas disponibles

### Ventas
- `GET /api/ventas` - Obtener todas las ventas
- `POST /api/ventas` - Crear nueva venta
- `GET /api/ventas/my` - Mis ventas
- `POST /api/ventas/:id/complete` - Completar venta
- `POST /api/ventas/:id/cancel` - Cancelar venta

### Pagos
- `GET /api/pagos` - Obtener todos los pagos
- `POST /api/pagos` - Crear nuevo pago
- `POST /api/pagos/:id/process` - Procesar pago
- `POST /api/pagos/:id/fail` - Marcar pago como fallido

### Abonos
- `GET /api/abonos` - Obtener todos los abonos
- `POST /api/abonos` - Crear nuevo abono
- `POST /api/abonos/:id/receive` - Recibir abono
- `POST /api/abonos/:id/cancel` - Cancelar abono

## Autenticación

La API utiliza tokens JWT para la autenticación. Incluir el token en el header:
```
Authorization: Bearer <token>
```

## Roles de Usuario

- `admin` - Acceso completo a todos los endpoints
- `vendedor` - Acceso limitado a operaciones de venta

## Manejo de Errores

La API devuelve respuestas consistentes con el siguiente formato:
```json
{
  "success": false,
  "message": "Error description",
  "error": "Detailed error message"
}
```

## Logging

La aplicación utiliza Winston para logging. Los logs se guardan en:
- `logs/error.log` - Errores
- `logs/combined.log` - Todos los logs

## Base de Datos

El sistema utiliza PostgreSQL como motor de base de datos. Asegúrate de tener el esquema creado antes de iniciar la aplicación.

## Desarrollo

Para desarrollo con recarga automática:
```bash
npm run dev
```

## Producción

Para producción:
```bash
npm start
```

## Contribuir

1. Fork del proyecto
2. Crear feature branch
3. Commit de cambios
4. Push al branch
5. Crear Pull Request
