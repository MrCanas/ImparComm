-- ImparComm · soporte para integraciones (calendario, firmas, Zoho, resumen semanal)
-- y tarjeta «Evento». Todo lo que escribe desde fuera de la sesión de un empleado
-- (crons, webhooks) lo hace con la service role a través de estas funciones.

-- ─────────────────────────────────────────────────────────────────────────────
-- Configuración
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO crm.config (clave, valor) VALUES
  ('dominios_internos', '["imparcapital.com"]'),
  ('evento_umbral_externos', '15')
ON CONFLICT (clave) DO NOTHING;

CREATE FUNCTION crm.dominios_internos() RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT COALESCE(
    (SELECT array_agg(lower(d)) FROM crm.config, jsonb_array_elements_text(valor) d
      WHERE clave = 'dominios_internos'),
    ARRAY['imparcapital.com']);
$$;

-- Dominios de correo personal: no identifican a una empresa.
CREATE FUNCTION crm.es_dominio_generico(p_dominio text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(p_dominio) IN (
    'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.es', 'outlook.com', 'outlook.es',
    'live.com', 'yahoo.com', 'yahoo.es', 'icloud.com', 'me.com', 'msn.com', 'protonmail.com');
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Microsoft Graph: suscripciones a cambios de calendario (caducan cada ~7 días)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE crm.graph_suscripciones (
  user_id         uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  buzon           text NOT NULL,
  subscription_id text NOT NULL UNIQUE,
  client_state    text NOT NULL,
  expira          timestamptz NOT NULL,
  updated_at      timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE crm.graph_suscripciones ENABLE ROW LEVEL SECURITY;
CREATE POLICY graph_suscripciones_admin ON crm.graph_suscripciones FOR SELECT TO authenticated
  USING (crm.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Zoho: estado de sincronización de cada «Contactado»
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE crm.hito_persona
  ADD COLUMN zoho_estado text CHECK (zoho_estado IN ('ok', 'error', 'desactivado')),
  ADD COLUMN zoho_error  text;

-- ─────────────────────────────────────────────────────────────────────────────
-- Resumen semanal: un envío por empleado y semana (los dos crons UTC no duplican)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE crm.envios_resumen (
  empleado_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  semana      date NOT NULL,
  pendientes  integer NOT NULL,
  vencidos    integer NOT NULL,
  enviado_en  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empleado_id, semana)
);
ALTER TABLE crm.envios_resumen ENABLE ROW LEVEL SECURITY;
CREATE POLICY envios_resumen_select ON crm.envios_resumen FOR SELECT TO authenticated
  USING (empleado_id = auth.uid() OR crm.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Captura de reuniones
-- ─────────────────────────────────────────────────────────────────────────────

-- Registra (o actualiza) un evento del calendario de un empleado con sus
-- asistentes externos: [{ "email": "...", "nombre": "..." }, …].
-- Crea personas por email, empresa por dominio, asistentes y la relación del
-- empleado (origen «calendario»). Solo una reunión ya celebrada mueve
-- `ultima_reunion` (y con ello reinicia el recordatorio). Un contacto archivado
-- no se desarchiva solo. Devuelve cuántas relaciones nuevas se crearon.
CREATE FUNCTION crm.registrar_reunion(
  p_empleado uuid,
  p_ical_uid text,
  p_fecha timestamptz,
  p_asunto text,
  p_externos jsonb
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE
  v_reunion uuid;
  v_ext jsonb;
  v_email text;
  v_nombre text;
  v_dominio text;
  v_empresa uuid;
  v_persona uuid;
  v_nuevas integer := 0;
  v_celebrada timestamptz := CASE WHEN p_fecha <= now() THEN p_fecha END;
  v_insertadas integer;
BEGIN
  INSERT INTO crm.reuniones (ical_uid, fecha, asunto, n_externos)
  VALUES (p_ical_uid, p_fecha, p_asunto, jsonb_array_length(p_externos))
  ON CONFLICT (ical_uid) DO UPDATE
    SET fecha = EXCLUDED.fecha, asunto = EXCLUDED.asunto,
        n_externos = GREATEST(crm.reuniones.n_externos, EXCLUDED.n_externos)
  RETURNING id INTO v_reunion;

  FOR v_ext IN SELECT * FROM jsonb_array_elements(p_externos) LOOP
    v_email := NULLIF(lower(trim(v_ext ->> 'email')), '');
    CONTINUE WHEN v_email IS NULL OR position('@' IN v_email) = 0;
    v_dominio := split_part(v_email, '@', 2);
    CONTINUE WHEN v_dominio = ANY (crm.dominios_internos());

    v_nombre := NULLIF(trim(v_ext ->> 'nombre'), '');
    IF v_nombre IS NULL OR lower(v_nombre) = v_email THEN
      v_nombre := initcap(replace(replace(split_part(v_email, '@', 1), '.', ' '), '_', ' '));
    END IF;

    v_empresa := NULL;
    IF NOT crm.es_dominio_generico(v_dominio) THEN
      SELECT id INTO v_empresa FROM crm.empresas WHERE dominio = v_dominio;
      IF v_empresa IS NULL THEN
        INSERT INTO crm.empresas (nombre, dominio)
        VALUES (initcap(split_part(v_dominio, '.', 1)), v_dominio)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_empresa;
        IF v_empresa IS NULL THEN
          SELECT id INTO v_empresa FROM crm.empresas
           WHERE dominio = v_dominio OR lower(nombre) = lower(initcap(split_part(v_dominio, '.', 1)));
        END IF;
      END IF;
    END IF;

    INSERT INTO crm.personas (nombre, email, empresa_id)
    VALUES (v_nombre, v_email, v_empresa)
    ON CONFLICT (email) WHERE email IS NOT NULL DO UPDATE
      SET empresa_id = COALESCE(crm.personas.empresa_id, EXCLUDED.empresa_id)
    RETURNING id INTO v_persona;

    INSERT INTO crm.asistentes (reunion_id, persona_id, empleados)
    VALUES (v_reunion, v_persona, ARRAY[p_empleado])
    ON CONFLICT (reunion_id, persona_id) DO UPDATE
      SET empleados = ARRAY(SELECT DISTINCT unnest(crm.asistentes.empleados || EXCLUDED.empleados));

    INSERT INTO crm.relaciones (empleado_id, persona_id, estado, origen, ultima_reunion)
    VALUES (p_empleado, v_persona, 'nueva', 'calendario', v_celebrada)
    ON CONFLICT (empleado_id, persona_id) DO NOTHING;
    GET DIAGNOSTICS v_insertadas = ROW_COUNT;

    IF v_insertadas > 0 THEN
      v_nuevas := v_nuevas + 1;
    ELSIF v_celebrada IS NOT NULL THEN
      UPDATE crm.relaciones
         SET ultima_reunion = v_celebrada
       WHERE empleado_id = p_empleado AND persona_id = v_persona
         AND (ultima_reunion IS NULL OR ultima_reunion < v_celebrada);
    END IF;
  END LOOP;

  RETURN v_nuevas;
END;
$$;

-- Minimización: si una reunión ya no existe en ningún calendario sincronizado
-- dentro de la ventana repasada, se borra su rastro (asistentes en cascada).
CREATE FUNCTION crm.borrar_reuniones_ausentes(p_desde timestamptz, p_hasta timestamptz, p_vistas text[])
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE v_borradas integer;
BEGIN
  DELETE FROM crm.reuniones
   WHERE fecha >= p_desde AND fecha < p_hasta
     AND NOT (ical_uid = ANY (p_vistas));
  GET DIAGNOSTICS v_borradas = ROW_COUNT;
  RETURN v_borradas;
END;
$$;

-- Personas nuevas de calendario sin cargo ni teléfono (candidatas a leer la firma).
CREATE FUNCTION crm.personas_sin_firma(p_empleado uuid, p_limite integer DEFAULT 20)
RETURNS TABLE (persona_id uuid, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT p.id, p.email
    FROM crm.relaciones r
    JOIN crm.personas p ON p.id = r.persona_id
   WHERE r.empleado_id = p_empleado
     AND r.origen = 'calendario'
     AND p.email IS NOT NULL
     AND (p.cargo IS NULL OR p.telefono IS NULL)
   ORDER BY r.created_at DESC
   LIMIT p_limite;
$$;

-- Estas funciones solo las usa el servidor (cron / webhook) con la service role.
REVOKE ALL ON FUNCTION crm.registrar_reunion(uuid, text, timestamptz, text, jsonb) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION crm.borrar_reuniones_ausentes(timestamptz, timestamptz, text[]) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION crm.personas_sin_firma(uuid, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION crm.registrar_reunion(uuid, text, timestamptz, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION crm.borrar_reuniones_ausentes(timestamptz, timestamptz, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION crm.personas_sin_firma(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION crm.dominios_internos() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION crm.es_dominio_generico(text) TO authenticated, service_role;

GRANT SELECT ON crm.graph_suscripciones, crm.envios_resumen TO authenticated;
GRANT ALL ON crm.graph_suscripciones, crm.envios_resumen TO service_role;

NOTIFY pgrst, 'reload schema';
