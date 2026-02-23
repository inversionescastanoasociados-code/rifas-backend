-- =============================================
-- RIFAS BACKEND - SCRIPT DE CREACIÓN DE BASE DE DATOS
-- Generado automáticamente: 2026-02-17T18:50:13.566Z
-- =============================================

-- =============================================
-- EXTENSIONES
-- =============================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- ENUMS
-- =============================================
CREATE TYPE estado_abono AS ENUM ('REGISTRADO', 'CONFIRMADO', 'ANULADO');
CREATE TYPE estado_boleta AS ENUM ('DISPONIBLE', 'RESERVADA', 'ABONADA', 'PAGADA', 'TRANSFERIDA', 'ANULADA');
CREATE TYPE estado_pago AS ENUM ('PENDING', 'APPROVED', 'DECLINED', 'VOIDED', 'ERROR');
CREATE TYPE estado_rifa AS ENUM ('BORRADOR', 'ACTIVA', 'PAUSADA', 'TERMINADA', 'CANCELADA');
CREATE TYPE estado_venta AS ENUM ('PENDIENTE', 'ABONADA', 'PAGADA', 'CANCELADA', 'EXPIRADA');
CREATE TYPE rol_usuario AS ENUM ('SUPER_ADMIN', 'ADMIN', 'VENDEDOR');

-- =============================================
-- TABLAS
-- =============================================

-- Tabla: USUARIOS
CREATE TABLE usuarios (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  nombre VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  rol rol_usuario NOT NULL DEFAULT 'ADMIN'::rol_usuario,
  telefono VARCHAR(20),
  activo BOOLEAN DEFAULT true,
  ultimo_login TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: CLIENTES
CREATE TABLE clientes (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  nombre VARCHAR(255) NOT NULL,
  telefono VARCHAR(20),
  email VARCHAR(255),
  identificacion VARCHAR(50),
  direccion TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: MEDIOS_PAGO
CREATE TABLE medios_pago (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: RIFAS
CREATE TABLE rifas (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  nombre VARCHAR(255) NOT NULL,
  slug VARCHAR(255),
  descripcion TEXT,
  estado estado_rifa NOT NULL DEFAULT 'BORRADOR'::estado_rifa,
  precio_boleta NUMERIC NOT NULL DEFAULT 10000,
  fecha_inicio TIMESTAMPTZ,
  fecha_fin TIMESTAMPTZ,
  fecha_sorteo TIMESTAMPTZ,
  premio_principal VARCHAR(255),
  total_boletas INTEGER NOT NULL DEFAULT 10000,
  boletas_vendidas INTEGER NOT NULL DEFAULT 0,
  boletas_disponibles INTEGER,
  imagen_url VARCHAR(500),
  terminos_condiciones TEXT,
  creado_por UUID,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: VENTAS
CREATE TABLE ventas (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  rifa_id UUID NOT NULL,
  cliente_id UUID NOT NULL,
  vendedor_id UUID,
  monto_total NUMERIC NOT NULL DEFAULT 0,
  abono_total NUMERIC NOT NULL DEFAULT 0,
  saldo_pendiente NUMERIC,
  estado_venta estado_venta NOT NULL DEFAULT 'PENDIENTE'::estado_venta,
  medio_pago_id UUID,
  es_venta_admin BOOLEAN DEFAULT false,
  es_venta_online BOOLEAN DEFAULT false,
  referencia_pago VARCHAR(255),
  gateway_pago VARCHAR(50),
  notas_admin TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: BOLETAS
CREATE TABLE boletas (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  rifa_id UUID NOT NULL,
  numero SMALLINT NOT NULL,
  estado estado_boleta NOT NULL DEFAULT 'DISPONIBLE'::estado_boleta,
  qr_url VARCHAR(500),
  barcode VARCHAR(100),
  cliente_id UUID,
  vendido_por UUID,
  venta_id UUID,
  reserva_token TEXT,
  bloqueo_hasta TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  imagen_url VARCHAR(500)
);

-- Tabla: VENTA_DETALLES
CREATE TABLE venta_detalles (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  venta_id UUID NOT NULL,
  boleta_id UUID NOT NULL,
  precio_unitario NUMERIC NOT NULL,
  abono NUMERIC NOT NULL DEFAULT 0,
  saldo_pendiente NUMERIC,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: ABONOS
CREATE TABLE abonos (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  venta_id UUID NOT NULL,
  registrado_por UUID,
  boleta_id UUID,
  medio_pago_id UUID,
  gateway_pago VARCHAR(50),
  referencia VARCHAR(255),
  monto NUMERIC NOT NULL,
  moneda VARCHAR(10) NOT NULL DEFAULT 'COP'::character varying,
  estado estado_abono NOT NULL DEFAULT 'CONFIRMADO'::estado_abono,
  notas TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: PAGOS
CREATE TABLE pagos (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  venta_id UUID NOT NULL,
  gateway VARCHAR(50) NOT NULL DEFAULT 'WOMPI'::character varying,
  reference VARCHAR(255) NOT NULL,
  transaction_id VARCHAR(255),
  status estado_pago NOT NULL DEFAULT 'PENDING'::estado_pago,
  amount NUMERIC NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'COP'::character varying,
  raw_webhook JSONB,
  raw_response JSONB,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  confirmed_at TIMESTAMPTZ
);

-- Tabla: TRANSFERENCIAS
CREATE TABLE transferencias (
  id UUID NOT NULL DEFAULT uuid_generate_v4(),
  boleta_id UUID NOT NULL,
  cliente_origen_id UUID NOT NULL,
  cliente_destino_id UUID NOT NULL,
  motivo TEXT,
  created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- =============================================
-- PRIMARY KEYS
-- =============================================
ALTER TABLE usuarios ADD PRIMARY KEY (id);
ALTER TABLE clientes ADD PRIMARY KEY (id);
ALTER TABLE medios_pago ADD PRIMARY KEY (id);
ALTER TABLE rifas ADD PRIMARY KEY (id);
ALTER TABLE ventas ADD PRIMARY KEY (id);
ALTER TABLE boletas ADD PRIMARY KEY (id);
ALTER TABLE venta_detalles ADD PRIMARY KEY (id);
ALTER TABLE abonos ADD PRIMARY KEY (id);
ALTER TABLE pagos ADD PRIMARY KEY (id);
ALTER TABLE transferencias ADD PRIMARY KEY (id);

-- =============================================
-- UNIQUE CONSTRAINTS
-- =============================================
ALTER TABLE boletas ADD CONSTRAINT boletas_rifa_id_numero_key UNIQUE (numero, rifa_id);
ALTER TABLE clientes ADD CONSTRAINT clientes_email_key UNIQUE (email);
ALTER TABLE clientes ADD CONSTRAINT clientes_identificacion_key UNIQUE (identificacion);
ALTER TABLE clientes ADD CONSTRAINT clientes_telefono_key UNIQUE (telefono);
ALTER TABLE medios_pago ADD CONSTRAINT medios_pago_nombre_key UNIQUE (nombre);
ALTER TABLE rifas ADD CONSTRAINT rifas_slug_key UNIQUE (slug);
ALTER TABLE usuarios ADD CONSTRAINT usuarios_email_key UNIQUE (email);
ALTER TABLE venta_detalles ADD CONSTRAINT venta_detalles_venta_id_boleta_id_key UNIQUE (venta_id, boleta_id);

-- =============================================
-- FOREIGN KEYS
-- =============================================
ALTER TABLE abonos ADD CONSTRAINT abonos_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE;
ALTER TABLE abonos ADD CONSTRAINT abonos_medio_pago_id_fkey FOREIGN KEY (medio_pago_id) REFERENCES medios_pago(id) ON DELETE SET NULL;
ALTER TABLE abonos ADD CONSTRAINT abonos_boleta_id_fkey FOREIGN KEY (boleta_id) REFERENCES boletas(id) ON DELETE SET NULL;
ALTER TABLE abonos ADD CONSTRAINT abonos_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE boletas ADD CONSTRAINT boletas_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE SET NULL;
ALTER TABLE boletas ADD CONSTRAINT boletas_rifa_id_fkey FOREIGN KEY (rifa_id) REFERENCES rifas(id) ON DELETE CASCADE;
ALTER TABLE boletas ADD CONSTRAINT boletas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE SET NULL;
ALTER TABLE boletas ADD CONSTRAINT boletas_vendido_por_fkey FOREIGN KEY (vendido_por) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE pagos ADD CONSTRAINT pagos_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE;
ALTER TABLE rifas ADD CONSTRAINT rifas_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE RESTRICT;
ALTER TABLE transferencias ADD CONSTRAINT transferencias_cliente_origen_id_fkey FOREIGN KEY (cliente_origen_id) REFERENCES clientes(id) ON DELETE RESTRICT;
ALTER TABLE transferencias ADD CONSTRAINT transferencias_cliente_destino_id_fkey FOREIGN KEY (cliente_destino_id) REFERENCES clientes(id) ON DELETE RESTRICT;
ALTER TABLE transferencias ADD CONSTRAINT transferencias_boleta_id_fkey FOREIGN KEY (boleta_id) REFERENCES boletas(id) ON DELETE RESTRICT;
ALTER TABLE venta_detalles ADD CONSTRAINT venta_detalles_boleta_id_fkey FOREIGN KEY (boleta_id) REFERENCES boletas(id) ON DELETE RESTRICT;
ALTER TABLE venta_detalles ADD CONSTRAINT venta_detalles_venta_id_fkey FOREIGN KEY (venta_id) REFERENCES ventas(id) ON DELETE CASCADE;
ALTER TABLE ventas ADD CONSTRAINT ventas_medio_pago_id_fkey FOREIGN KEY (medio_pago_id) REFERENCES medios_pago(id);
ALTER TABLE ventas ADD CONSTRAINT ventas_vendedor_id_fkey FOREIGN KEY (vendedor_id) REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE ventas ADD CONSTRAINT ventas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE RESTRICT;
ALTER TABLE ventas ADD CONSTRAINT ventas_rifa_id_fkey FOREIGN KEY (rifa_id) REFERENCES rifas(id) ON DELETE CASCADE;

-- =============================================
-- ÍNDICES
-- =============================================
CREATE INDEX idx_abonos_created ON public.abonos USING btree (created_at);
CREATE INDEX idx_abonos_estado ON public.abonos USING btree (estado);
CREATE INDEX idx_abonos_registrado_por ON public.abonos USING btree (registrado_por);
CREATE INDEX idx_abonos_venta ON public.abonos USING btree (venta_id);
CREATE INDEX idx_boletas_bloqueo ON public.boletas USING btree (bloqueo_hasta) WHERE (bloqueo_hasta IS NOT NULL);
CREATE INDEX idx_boletas_cliente ON public.boletas USING btree (cliente_id);
CREATE INDEX idx_boletas_disponibles ON public.boletas USING btree (rifa_id, numero) WHERE (estado = 'DISPONIBLE'::estado_boleta);
CREATE INDEX idx_boletas_estado ON public.boletas USING btree (estado);
CREATE INDEX idx_boletas_numero ON public.boletas USING btree (numero);
CREATE INDEX idx_boletas_rifa ON public.boletas USING btree (rifa_id);
CREATE INDEX idx_boletas_vendedor ON public.boletas USING btree (vendido_por);
CREATE INDEX idx_clientes_identificacion ON public.clientes USING btree (identificacion);
CREATE INDEX idx_clientes_nombre ON public.clientes USING gin (nombre gin_trgm_ops);
CREATE INDEX idx_clientes_telefono ON public.clientes USING btree (telefono);
CREATE INDEX idx_pagos_created ON public.pagos USING btree (created_at);
CREATE INDEX idx_pagos_status ON public.pagos USING btree (status);
CREATE INDEX idx_pagos_venta ON public.pagos USING btree (venta_id);
CREATE INDEX idx_rifas_activas ON public.rifas USING btree (estado) WHERE (estado = 'ACTIVA'::estado_rifa);
CREATE INDEX idx_rifas_creado_por ON public.rifas USING btree (creado_por);
CREATE INDEX idx_rifas_estado ON public.rifas USING btree (estado);
CREATE INDEX idx_rifas_fecha_sorteo ON public.rifas USING btree (fecha_sorteo);
CREATE INDEX idx_transferencias_boleta ON public.transferencias USING btree (boleta_id);
CREATE INDEX idx_transferencias_destino ON public.transferencias USING btree (cliente_destino_id);
CREATE INDEX idx_transferencias_origen ON public.transferencias USING btree (cliente_origen_id);
CREATE INDEX idx_usuarios_activo ON public.usuarios USING btree (activo);
CREATE INDEX idx_usuarios_email ON public.usuarios USING btree (email);
CREATE INDEX idx_usuarios_rol ON public.usuarios USING btree (rol);
CREATE INDEX idx_venta_detalles_boleta ON public.venta_detalles USING btree (boleta_id);
CREATE INDEX idx_venta_detalles_venta ON public.venta_detalles USING btree (venta_id);
CREATE INDEX idx_ventas_cliente ON public.ventas USING btree (cliente_id);
CREATE INDEX idx_ventas_estado ON public.ventas USING btree (estado_venta);
CREATE INDEX idx_ventas_expires ON public.ventas USING btree (expires_at) WHERE (expires_at IS NOT NULL);
CREATE INDEX idx_ventas_fecha ON public.ventas USING btree (created_at);
CREATE INDEX idx_ventas_online ON public.ventas USING btree (es_venta_online);
CREATE INDEX idx_ventas_rifa ON public.ventas USING btree (rifa_id);
CREATE INDEX idx_ventas_vendedor ON public.ventas USING btree (vendedor_id);

-- =============================================
-- FUNCIONES
-- =============================================
CREATE OR REPLACE FUNCTION public.uuid_nil()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_nil$function$
;

CREATE OR REPLACE FUNCTION public.uuid_ns_dns()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_dns$function$
;

CREATE OR REPLACE FUNCTION public.uuid_ns_url()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_url$function$
;

CREATE OR REPLACE FUNCTION public.uuid_ns_oid()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_oid$function$
;

CREATE OR REPLACE FUNCTION public.uuid_ns_x500()
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_ns_x500$function$
;

CREATE OR REPLACE FUNCTION public.uuid_generate_v1()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v1$function$
;

CREATE OR REPLACE FUNCTION public.uuid_generate_v1mc()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v1mc$function$
;

CREATE OR REPLACE FUNCTION public.uuid_generate_v3(namespace uuid, name text)
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v3$function$
;

CREATE OR REPLACE FUNCTION public.uuid_generate_v4()
 RETURNS uuid
 LANGUAGE c
 PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v4$function$
;

CREATE OR REPLACE FUNCTION public.uuid_generate_v5(namespace uuid, name text)
 RETURNS uuid
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/uuid-ossp', $function$uuid_generate_v5$function$
;

CREATE OR REPLACE FUNCTION public.set_limit(real)
 RETURNS real
 LANGUAGE c
 STRICT
AS '$libdir/pg_trgm', $function$set_limit$function$
;

CREATE OR REPLACE FUNCTION public.show_limit()
 RETURNS real
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_limit$function$
;

CREATE OR REPLACE FUNCTION public.show_trgm(text)
 RETURNS text[]
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$show_trgm$function$
;

CREATE OR REPLACE FUNCTION public.similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity$function$
;

CREATE OR REPLACE FUNCTION public.similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_op$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_op$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.similarity_dist(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$similarity_dist$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_op$function$
;

CREATE OR REPLACE FUNCTION public.word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$word_similarity_dist_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_in(cstring)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_in$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_out(gtrgm)
 RETURNS cstring
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_out$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_consistent(internal, text, smallint, oid, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_distance(internal, text, smallint, oid, internal)
 RETURNS double precision
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_distance$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_compress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_compress$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_decompress(internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_decompress$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_penalty(internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_penalty$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_picksplit(internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_picksplit$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_union(internal, internal)
 RETURNS gtrgm
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_union$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_same(gtrgm, gtrgm, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gtrgm_same$function$
;

CREATE OR REPLACE FUNCTION public.gin_extract_value_trgm(text, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_value_trgm$function$
;

CREATE OR REPLACE FUNCTION public.gin_extract_query_trgm(text, internal, smallint, internal, internal, internal, internal)
 RETURNS internal
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_extract_query_trgm$function$
;

CREATE OR REPLACE FUNCTION public.gin_trgm_consistent(internal, smallint, text, integer, internal, internal, internal, internal)
 RETURNS boolean
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_consistent$function$
;

CREATE OR REPLACE FUNCTION public.gin_trgm_triconsistent(internal, smallint, text, integer, internal, internal, internal)
 RETURNS "char"
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$gin_trgm_triconsistent$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_op$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_commutator_op(text, text)
 RETURNS boolean
 LANGUAGE c
 STABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_op$function$
;

CREATE OR REPLACE FUNCTION public.strict_word_similarity_dist_commutator_op(text, text)
 RETURNS real
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE STRICT
AS '$libdir/pg_trgm', $function$strict_word_similarity_dist_commutator_op$function$
;

CREATE OR REPLACE FUNCTION public.gtrgm_options(internal)
 RETURNS void
 LANGUAGE c
 IMMUTABLE PARALLEL SAFE
AS '$libdir/pg_trgm', $function$gtrgm_options$function$
;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_enforce_boleta_venta()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  b_venta UUID;
BEGIN
  SELECT venta_id INTO b_venta
  FROM boletas
  WHERE id = NEW.boleta_id
  FOR UPDATE;

  -- Si la boleta ya tiene otra venta asignada, rechazar
  IF b_venta IS NOT NULL AND b_venta <> NEW.venta_id THEN
    RAISE EXCEPTION 'Boleta % ya pertenece a otra venta activa: %', NEW.boleta_id, b_venta;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_recalc_venta_abonos()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_id UUID;
  total_abonos NUMERIC(12,2);
  monto_total NUMERIC(12,2);
  estado_actual estado_venta;
BEGIN
  v_id := COALESCE(NEW.venta_id, OLD.venta_id);

  SELECT COALESCE(SUM(monto),0)
  INTO total_abonos
  FROM abonos
  WHERE venta_id = v_id
    AND estado <> 'ANULADO'::estado_abono;

  SELECT v.monto_total, v.estado_venta
  INTO monto_total, estado_actual
  FROM ventas v
  WHERE v.id = v_id
  FOR UPDATE;

  UPDATE ventas
  SET abono_total = total_abonos
  WHERE id = v_id;

  IF estado_actual NOT IN ('CANCELADA'::estado_venta, 'EXPIRADA'::estado_venta) THEN
    IF total_abonos >= monto_total AND monto_total > 0 THEN
      UPDATE ventas SET estado_venta = 'PAGADA'::estado_venta WHERE id = v_id;
    ELSIF total_abonos > 0 AND total_abonos < monto_total THEN
      UPDATE ventas SET estado_venta = 'ABONADA'::estado_venta WHERE id = v_id;
    ELSE
      UPDATE ventas SET estado_venta = 'PENDIENTE'::estado_venta WHERE id = v_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_on_venta_estado_change()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  qty INT;
BEGIN
  -- cantidad de boletas en esa venta
  SELECT COUNT(*) INTO qty FROM venta_detalles WHERE venta_id = NEW.id;

  -- Transición A PAGADA
  IF (OLD.estado_venta IS DISTINCT FROM 'PAGADA'::estado_venta)
     AND (NEW.estado_venta = 'PAGADA'::estado_venta) THEN

    -- Marcar boletas como PAGADA y asignar cliente_id si no estaba
    UPDATE boletas b
    SET
      estado = 'PAGADA',
      cliente_id = COALESCE(b.cliente_id, NEW.cliente_id),
      bloqueo_hasta = NULL,
      reserva_token = NULL
    WHERE b.id IN (SELECT boleta_id FROM venta_detalles WHERE venta_id = NEW.id);

    -- Incrementar contador en rifa (por cantidad de boletas)
    UPDATE rifas
    SET boletas_vendidas = boletas_vendidas + qty
    WHERE id = NEW.rifa_id;

  -- Transición DESDE PAGADA a otro estado (caso raro: reverso/anulación)
  ELSIF (OLD.estado_venta = 'PAGADA'::estado_venta)
        AND (NEW.estado_venta IS DISTINCT FROM 'PAGADA'::estado_venta) THEN

    -- Revertir boletas a DISPONIBLE (o ANULADA si prefieres)
    UPDATE boletas b
    SET
      estado = 'DISPONIBLE',
      cliente_id = NULL,
      venta_id = NULL
    WHERE b.id IN (SELECT boleta_id FROM venta_detalles WHERE venta_id = NEW.id);

    UPDATE rifas
    SET boletas_vendidas = GREATEST(boletas_vendidas - qty, 0)
    WHERE id = NEW.rifa_id;
  END IF;

  RETURN NEW;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.expirar_ventas_y_liberar_boletas()
 RETURNS void
 LANGUAGE plpgsql
AS $function$
BEGIN
  -- Marcar ventas vencidas como EXPIRADA (solo si aún estaban pendientes)
  UPDATE ventas
  SET estado_venta = 'EXPIRADA'
  WHERE estado_venta = 'PENDIENTE'
    AND expires_at IS NOT NULL
    AND expires_at < NOW();

  -- Liberar boletas vencidas (si están RESERVADAS y su bloqueo ya pasó)
  UPDATE boletas
  SET
    estado = 'DISPONIBLE',
    venta_id = NULL,
    reserva_token = NULL,
    bloqueo_hasta = NULL,
    cliente_id = NULL
  WHERE estado = 'RESERVADA'
    AND bloqueo_hasta IS NOT NULL
    AND bloqueo_hasta < NOW();
END;
$function$
;

CREATE OR REPLACE FUNCTION public.repartir_abonos_a_detalles(p_venta uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
DECLARE
  total_confirmado NUMERIC(12,2);
  restante NUMERIC(12,2);
  d RECORD;
BEGIN
  SELECT COALESCE(SUM(monto),0)
  INTO total_confirmado
  FROM abonos
  WHERE venta_id = p_venta
    AND estado <> 'ANULADO'::estado_abono;

  UPDATE venta_detalles
  SET abono = 0
  WHERE venta_id = p_venta;

  restante := total_confirmado;

  FOR d IN
    SELECT vd.id, vd.precio_unitario
    FROM venta_detalles vd
    WHERE vd.venta_id = p_venta
    ORDER BY vd.created_at, vd.id
  LOOP
    EXIT WHEN restante <= 0;

    IF restante >= d.precio_unitario THEN
      UPDATE venta_detalles SET abono = d.precio_unitario WHERE id = d.id;
      restante := restante - d.precio_unitario;
    ELSE
      UPDATE venta_detalles SET abono = restante WHERE id = d.id;
      restante := 0;
    END IF;
  END LOOP;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.trg_repartir_abonos_detalles()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_id UUID;
BEGIN
  v_id := COALESCE(NEW.venta_id, OLD.venta_id);
  PERFORM repartir_abonos_a_detalles(v_id);
  RETURN COALESCE(NEW, OLD);
END;
$function$
;


-- =============================================
-- TRIGGERS
-- =============================================
CREATE TRIGGER update_usuarios_updated_at BEFORE UPDATE ON usuarios FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_rifas_updated_at BEFORE UPDATE ON rifas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON clientes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_ventas_updated_at BEFORE UPDATE ON ventas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_boletas_updated_at BEFORE UPDATE ON boletas FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER enforce_boleta_venta_on_detalle BEFORE INSERT ON venta_detalles FOR EACH ROW EXECUTE FUNCTION trg_enforce_boleta_venta();
CREATE TRIGGER on_venta_estado_change AFTER UPDATE ON ventas FOR EACH ROW EXECUTE FUNCTION trg_on_venta_estado_change();
CREATE TRIGGER recalc_venta_abonos_ins AFTER INSERT ON abonos FOR EACH ROW EXECUTE FUNCTION trg_recalc_venta_abonos();
CREATE TRIGGER recalc_venta_abonos_upd AFTER UPDATE ON abonos FOR EACH ROW EXECUTE FUNCTION trg_recalc_venta_abonos();
CREATE TRIGGER recalc_venta_abonos_del AFTER DELETE ON abonos FOR EACH ROW EXECUTE FUNCTION trg_recalc_venta_abonos();
CREATE TRIGGER repartir_abonos_detalles_ins AFTER INSERT ON abonos FOR EACH ROW EXECUTE FUNCTION trg_repartir_abonos_detalles();
CREATE TRIGGER repartir_abonos_detalles_upd AFTER UPDATE ON abonos FOR EACH ROW EXECUTE FUNCTION trg_repartir_abonos_detalles();
CREATE TRIGGER repartir_abonos_detalles_del AFTER DELETE ON abonos FOR EACH ROW EXECUTE FUNCTION trg_repartir_abonos_detalles();
