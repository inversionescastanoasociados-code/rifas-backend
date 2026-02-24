-- SQL para calcular total abonado y deuda de boletas ABONADAS
-- Total abonado: suma de abonos de boletas ABONADAS
-- Deuda: suma de (precio_boleta - total_abonado) para cada boleta ABONADA

SELECT
  COALESCE(SUM(a.monto), 0) AS abonado_abonadas
FROM abonos a
INNER JOIN boletas b ON b.id = a.boleta_id
INNER JOIN ventas v ON v.id = a.venta_id
WHERE v.rifa_id = $1
  AND b.estado = 'ABONADA'
  AND a.estado = 'CONFIRMADO';

SELECT
  COALESCE(SUM(r.precio_boleta - ab.total_abonado), 0) AS deuda_abonadas
FROM boletas b
INNER JOIN rifas r ON r.id = b.rifa_id
LEFT JOIN (
  SELECT boleta_id, SUM(monto) AS total_abonado
  FROM abonos
  WHERE estado = 'CONFIRMADO'
  GROUP BY boleta_id
) ab ON ab.boleta_id = b.id
WHERE b.rifa_id = $1
  AND b.estado = 'ABONADA';
