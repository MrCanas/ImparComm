-- Etiquetas generales de serie y parámetros por defecto.

INSERT INTO crm.config (clave, valor) VALUES
  ('plazo_defecto_dias', '90'),
  ('puntos_por_bono', '50'),
  ('importe_bono', '100')
ON CONFLICT (clave) DO NOTHING;

INSERT INTO crm.etiquetas (nombre, tipo, plazo_dias) VALUES
  ('Potencial inversor', 'general', 30),
  ('Proveedor', 'general', 180),
  ('Banco', 'general', 90),
  ('Broker de venta', 'general', 90),
  ('Broker de compra', 'general', 90),
  ('Patrimonialista', 'general', 90),
  ('Fondo', 'general', 90),
  ('Potencial cliente', 'general', 90)
ON CONFLICT DO NOTHING;
