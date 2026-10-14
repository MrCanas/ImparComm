-- Hitos generales de serie y la etiqueta «Colaborador intermediario».
-- Los abre el superadministrador de la plataforma (el primero que exista).
-- Idempotente: no duplica un hito general con el mismo nombre.

INSERT INTO crm.etiquetas (nombre, tipo, plazo_dias)
VALUES ('Colaborador intermediario', 'general', 90)
ON CONFLICT DO NOTHING;

WITH admin AS (
  SELECT user_id FROM public.app_user_account
   WHERE is_platform_admin AND is_active IS DISTINCT FROM false
   ORDER BY updated_at NULLS LAST
   LIMIT 1
),
serie (nombre, tipo, etiquetas) AS (
  VALUES
    ('Levantamiento de capital', 'Levantamiento de capital', ARRAY['Potencial inversor', 'Patrimonialista', 'Fondo']),
    ('Evento', 'Evento', ARRAY[]::text[]),
    ('Comercialización', 'Comercialización', ARRAY['Potencial cliente', 'Broker de venta']),
    ('Newsletter / informe', 'Newsletter / informe', ARRAY[]::text[]),
    ('Broker', 'Relación', ARRAY['Broker de venta', 'Broker de compra']),
    ('Proveedor', 'Relación', ARRAY['Proveedor']),
    ('Banco', 'Relación', ARRAY['Banco']),
    ('Colaborador intermediario', 'Relación', ARRAY['Colaborador intermediario'])
)
INSERT INTO crm.hitos (nombre, tipo, ambito, abierto_por, etiquetas_filtro)
SELECT s.nombre, s.tipo, 'general', a.user_id,
       COALESCE((SELECT array_agg(e.id ORDER BY e.nombre) FROM crm.etiquetas e
                  WHERE e.tipo = 'general' AND e.nombre = ANY (s.etiquetas)), '{}')
  FROM serie s CROSS JOIN admin a
 WHERE NOT EXISTS (SELECT 1 FROM crm.hitos h WHERE h.ambito = 'general' AND lower(h.nombre) = lower(s.nombre));
