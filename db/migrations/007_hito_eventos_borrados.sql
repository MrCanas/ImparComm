-- Al borrar una persona (o un hito), el CASCADE borra sus filas de hito_persona
-- y el trigger intentaba registrar un «quitar» que apunta a la fila que se está
-- borrando: violaba la FK y abortaba el borrado. Solo se registra el «quitar»
-- cuando el hito y la persona siguen existiendo.
CREATE OR REPLACE FUNCTION crm.tg_hito_persona_eventos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO crm.hito_eventos (hito_id, persona_id, empleado_id, accion)
    VALUES (NEW.hito_id, NEW.persona_id, COALESCE(auth.uid(), NEW.incluida_por), 'incluir');
  ELSIF TG_OP = 'DELETE' THEN
    IF EXISTS (SELECT 1 FROM crm.hitos WHERE id = OLD.hito_id)
       AND EXISTS (SELECT 1 FROM crm.personas WHERE id = OLD.persona_id) THEN
      INSERT INTO crm.hito_eventos (hito_id, persona_id, empleado_id, accion)
      VALUES (OLD.hito_id, OLD.persona_id, auth.uid(), 'quitar');
    END IF;
  ELSIF OLD.estado IS DISTINCT FROM NEW.estado THEN
    INSERT INTO crm.hito_eventos (hito_id, persona_id, empleado_id, accion, canal)
    VALUES (NEW.hito_id, NEW.persona_id,
            COALESCE(auth.uid(), NEW.contactado_por),
            CASE NEW.estado WHEN 'contactado' THEN 'contactar' ELSE 'volver_pte' END,
            NEW.canal);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION crm.tg_hito_persona_eventos() FROM public, anon;
