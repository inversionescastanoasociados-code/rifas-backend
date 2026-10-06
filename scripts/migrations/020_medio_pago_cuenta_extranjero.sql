-- Medio de pago: Cuenta extranjero (ventas y abonos internos)
INSERT INTO medios_pago (id, nombre, descripcion, activo)
SELECT
  'c8f4e2a1-9b3d-4e7f-8c6d-5a4b3c2d1e0f'::uuid,
  'Cuenta extranjero',
  'Transferencia desde cuenta bancaria en el exterior',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM medios_pago WHERE nombre = 'Cuenta extranjero'
);

UPDATE medios_pago
SET activo = true,
    descripcion = COALESCE(descripcion, 'Transferencia desde cuenta bancaria en el exterior')
WHERE nombre = 'Cuenta extranjero';
