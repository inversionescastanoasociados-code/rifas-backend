-- =============================================================================
-- Migración 006: registrar usuario que realizó cada acción en historial_movimientos
-- Idempotente (CREATE OR REPLACE). No modifica datos existentes.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.registrar_historial_movimiento(
  p_entidad VARCHAR,
  p_accion VARCHAR,
  p_boleta_id UUID DEFAULT NULL,
  p_rifa_id UUID DEFAULT NULL,
  p_numero SMALLINT DEFAULT NULL,
  p_cliente_id UUID DEFAULT NULL,
  p_cliente_id_anterior UUID DEFAULT NULL,
  p_venta_id UUID DEFAULT NULL,
  p_abono_id UUID DEFAULT NULL,
  p_estado_anterior TEXT DEFAULT NULL,
  p_estado_nuevo TEXT DEFAULT NULL,
  p_monto NUMERIC DEFAULT NULL,
  p_medio_pago_id UUID DEFAULT NULL,
  p_notas TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb,
  p_usuario_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  INSERT INTO historial_movimientos (
    entidad,
    accion,
    boleta_id,
    rifa_id,
    numero,
    cliente_id,
    cliente_id_anterior,
    venta_id,
    abono_id,
    usuario_id,
    estado_anterior,
    estado_nuevo,
    monto,
    medio_pago_id,
    origen,
    notas,
    metadata
  ) VALUES (
    p_entidad,
    p_accion,
    p_boleta_id,
    p_rifa_id,
    p_numero,
    p_cliente_id,
    p_cliente_id_anterior,
    p_venta_id,
    p_abono_id,
    COALESCE(historial_usuario_contexto(), p_usuario_id),
    p_estado_anterior,
    p_estado_nuevo,
    p_monto,
    p_medio_pago_id,
    historial_origen_contexto(),
    p_notas,
    COALESCE(p_metadata, '{}'::jsonb)
  );
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'historial_movimientos no registrado (%/%): %',
    p_entidad, p_accion, SQLERRM;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_historial_boletas()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_accion VARCHAR(60);
  v_metadata JSONB;
  v_usuario UUID;
BEGIN
  v_usuario := COALESCE(
    historial_usuario_contexto(),
    NEW.vendido_por,
    CASE WHEN TG_OP = 'UPDATE' THEN OLD.vendido_por ELSE NULL END,
    (
      SELECT v.vendedor_id
      FROM ventas v
      WHERE v.id = COALESCE(NEW.venta_id, OLD.venta_id)
      LIMIT 1
    )
  );

  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'DISPONIBLE'::estado_boleta
       AND NEW.cliente_id IS NULL
       AND NEW.venta_id IS NULL THEN
      RETURN NEW;
    END IF;

    PERFORM registrar_historial_movimiento(
      'BOLETA',
      'CREAR_BOLETA',
      NEW.id,
      NEW.rifa_id,
      NEW.numero,
      NEW.cliente_id,
      NULL,
      NEW.venta_id,
      NULL,
      NULL,
      NEW.estado::text,
      NULL,
      NULL,
      NULL,
      jsonb_build_object(
        'vendido_por', NEW.vendido_por,
        'bloqueo_hasta', NEW.bloqueo_hasta
      ),
      v_usuario
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.estado IS NOT DISTINCT FROM NEW.estado
       AND OLD.cliente_id IS NOT DISTINCT FROM NEW.cliente_id
       AND OLD.venta_id IS NOT DISTINCT FROM NEW.venta_id
       AND OLD.vendido_por IS NOT DISTINCT FROM NEW.vendido_por
       AND OLD.bloqueo_hasta IS NOT DISTINCT FROM NEW.bloqueo_hasta
       AND OLD.reserva_token IS NOT DISTINCT FROM NEW.reserva_token
       AND OLD.nota IS NOT DISTINCT FROM NEW.nota THEN
      RETURN NEW;
    END IF;

    v_accion := inferir_accion_boleta(OLD, NEW);
    v_metadata := jsonb_strip_nulls(jsonb_build_object(
      'vendido_por_anterior', OLD.vendido_por,
      'vendido_por_nuevo', NEW.vendido_por,
      'bloqueo_hasta_anterior', OLD.bloqueo_hasta,
      'bloqueo_hasta_nuevo', NEW.bloqueo_hasta,
      'venta_id_anterior', OLD.venta_id,
      'venta_id_nuevo', NEW.venta_id,
      'reserva_token_cambiado', OLD.reserva_token IS DISTINCT FROM NEW.reserva_token,
      'nota_cambiada', OLD.nota IS DISTINCT FROM NEW.nota
    ));

    PERFORM registrar_historial_movimiento(
      'BOLETA',
      v_accion,
      NEW.id,
      NEW.rifa_id,
      NEW.numero,
      NEW.cliente_id,
      OLD.cliente_id,
      NEW.venta_id,
      NULL,
      OLD.estado::text,
      NEW.estado::text,
      NULL,
      NULL,
      NULL,
      v_metadata,
      v_usuario
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_historial_abonos()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_accion VARCHAR(60);
  v_numero SMALLINT;
  v_rifa_id UUID;
  v_cliente_id UUID;
BEGIN
  SELECT b.numero, b.rifa_id, b.cliente_id
  INTO v_numero, v_rifa_id, v_cliente_id
  FROM boletas b
  WHERE b.id = COALESCE(NEW.boleta_id, OLD.boleta_id);

  IF TG_OP = 'INSERT' THEN
    v_accion := CASE NEW.estado
      WHEN 'CONFIRMADO'::estado_abono THEN 'ABONO_CONFIRMADO'
      WHEN 'ANULADO'::estado_abono THEN 'ABONO_ANULADO'
      ELSE 'ABONO_REGISTRADO'
    END;

    PERFORM registrar_historial_movimiento(
      'ABONO',
      v_accion,
      NEW.boleta_id,
      v_rifa_id,
      v_numero,
      v_cliente_id,
      NULL,
      NEW.venta_id,
      NEW.id,
      NULL,
      NEW.estado::text,
      NEW.monto,
      NEW.medio_pago_id,
      NEW.notas,
      jsonb_build_object(
        'registrado_por', NEW.registrado_por,
        'gateway_pago', NEW.gateway_pago,
        'referencia', NEW.referencia,
        'moneda', NEW.moneda
      ),
      NEW.registrado_por
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.estado IS NOT DISTINCT FROM NEW.estado
       AND OLD.monto IS NOT DISTINCT FROM NEW.monto
       AND OLD.medio_pago_id IS NOT DISTINCT FROM NEW.medio_pago_id
       AND OLD.notas IS NOT DISTINCT FROM NEW.notas
       AND OLD.boleta_id IS NOT DISTINCT FROM NEW.boleta_id
       AND OLD.venta_id IS NOT DISTINCT FROM NEW.venta_id THEN
      RETURN NEW;
    END IF;

    IF OLD.estado IS DISTINCT FROM NEW.estado AND NEW.estado = 'ANULADO'::estado_abono THEN
      v_accion := 'ABONO_ANULADO';
    ELSIF OLD.estado IS DISTINCT FROM NEW.estado AND NEW.estado = 'CONFIRMADO'::estado_abono THEN
      v_accion := 'ABONO_CONFIRMADO';
    ELSIF OLD.monto IS DISTINCT FROM NEW.monto
       OR OLD.medio_pago_id IS DISTINCT FROM NEW.medio_pago_id THEN
      v_accion := 'ABONO_MODIFICADO';
    ELSE
      v_accion := 'ABONO_ACTUALIZADO';
    END IF;

    PERFORM registrar_historial_movimiento(
      'ABONO',
      v_accion,
      NEW.boleta_id,
      v_rifa_id,
      v_numero,
      v_cliente_id,
      NULL,
      NEW.venta_id,
      NEW.id,
      OLD.estado::text,
      NEW.estado::text,
      NEW.monto,
      NEW.medio_pago_id,
      NEW.notas,
      jsonb_build_object(
        'monto_anterior', OLD.monto,
        'medio_pago_id_anterior', OLD.medio_pago_id,
        'registrado_por', NEW.registrado_por,
        'gateway_pago', NEW.gateway_pago,
        'referencia', NEW.referencia
      ),
      COALESCE(historial_usuario_contexto(), NEW.registrado_por)
    );
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.trg_historial_ventas()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.estado_venta IS NOT DISTINCT FROM NEW.estado_venta THEN
      RETURN NEW;
    END IF;

    PERFORM registrar_historial_movimiento(
      'VENTA',
      'CAMBIO_ESTADO_VENTA',
      NULL,
      NEW.rifa_id,
      NULL,
      NEW.cliente_id,
      OLD.cliente_id,
      NEW.id,
      NULL,
      OLD.estado_venta::text,
      NEW.estado_venta::text,
      NEW.abono_total,
      NEW.medio_pago_id,
      NEW.notas_admin,
      jsonb_build_object(
        'monto_total', NEW.monto_total,
        'abono_total_anterior', OLD.abono_total,
        'abono_total_nuevo', NEW.abono_total,
        'vendedor_id', NEW.vendedor_id
      ),
      COALESCE(historial_usuario_contexto(), NEW.vendedor_id)
    );
  END IF;

  RETURN NEW;
END;
$function$;
