-- ImparComm · CRM relacional por empleado
-- Esquema propio `crm` dentro del proyecto Supabase compartido con icam web dashboard.
-- Los empleados son auth.users; la baja se lee de public.app_user_account.is_active.

CREATE SCHEMA IF NOT EXISTS crm;  -- puede existir ya: scripts/migrate.ts crea crm.schema_migrations

-- ─────────────────────────────────────────────────────────────────────────────
-- Tablas
-- ─────────────────────────────────────────────────────────────────────────────

-- Permisos propios de ImparComm (no tocan las zonas de icam).
CREATE TABLE crm.permisos (
  user_id    uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  es_admin   boolean NOT NULL DEFAULT false,
  ve_bolsa   boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Parámetros editables desde el panel de administrador.
CREATE TABLE crm.config (
  clave      text PRIMARY KEY,
  valor      jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE crm.empresas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL,
  dominio    text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX empresas_nombre_uq ON crm.empresas (lower(nombre));

CREATE TABLE crm.personas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL,
  email      text CHECK (email IS NULL OR email = lower(email)),
  telefono   text,
  cargo      text,
  empresa_id uuid REFERENCES crm.empresas (id) ON DELETE SET NULL,
  zoho_id    text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT personas_contacto_ck CHECK (email IS NOT NULL OR telefono IS NOT NULL)
);
CREATE UNIQUE INDEX personas_email_uq ON crm.personas (email) WHERE email IS NOT NULL;
CREATE INDEX personas_empresa_idx ON crm.personas (empresa_id);

CREATE TABLE crm.relaciones (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id          uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  persona_id           uuid NOT NULL REFERENCES crm.personas (id) ON DELETE CASCADE,
  estado               text NOT NULL DEFAULT 'nueva'
                         CHECK (estado IN ('nueva', 'clasificada', 'archivada')),
  notas                text,
  ultima_reunion       timestamptz,
  proximo_recordatorio date,
  origen               text NOT NULL DEFAULT 'manual'
                         CHECK (origen IN ('calendario', 'manual', 'bolsa')),
  clasificada_en       timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (empleado_id, persona_id)
);
CREATE INDEX relaciones_persona_idx ON crm.relaciones (persona_id);
CREATE INDEX relaciones_empleado_estado_idx ON crm.relaciones (empleado_id, estado);

CREATE TABLE crm.reuniones (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ical_uid   text NOT NULL UNIQUE,
  fecha      timestamptz NOT NULL,
  asunto     text,
  n_externos integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE crm.asistentes (
  reunion_id uuid NOT NULL REFERENCES crm.reuniones (id) ON DELETE CASCADE,
  persona_id uuid NOT NULL REFERENCES crm.personas (id) ON DELETE CASCADE,
  empleados  uuid[] NOT NULL DEFAULT '{}',
  PRIMARY KEY (reunion_id, persona_id)
);
CREATE INDEX asistentes_persona_idx ON crm.asistentes (persona_id);

CREATE TABLE crm.etiquetas (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre     text NOT NULL,
  tipo       text NOT NULL CHECK (tipo IN ('general', 'personal')),
  creador    uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  plazo_dias integer NOT NULL DEFAULT 90 CHECK (plazo_dias > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX etiquetas_general_uq ON crm.etiquetas (lower(nombre)) WHERE tipo = 'general';
CREATE UNIQUE INDEX etiquetas_personal_uq ON crm.etiquetas (creador, lower(nombre)) WHERE tipo = 'personal';

CREATE TABLE crm.etiquetas_persona (
  persona_id  uuid NOT NULL REFERENCES crm.personas (id) ON DELETE CASCADE,
  etiqueta_id uuid NOT NULL REFERENCES crm.etiquetas (id) ON DELETE CASCADE,
  puesta_por  uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (persona_id, etiqueta_id)
);
CREATE INDEX etiquetas_persona_etiqueta_idx ON crm.etiquetas_persona (etiqueta_id);

CREATE TABLE crm.hitos (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre           text NOT NULL,
  tipo             text,
  ambito           text NOT NULL CHECK (ambito IN ('general', 'personal')),
  abierto_por      uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  etiquetas_filtro uuid[] NOT NULL DEFAULT '{}',
  fecha            date,
  zoho_campaign_id text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE crm.hito_persona (
  hito_id        uuid NOT NULL REFERENCES crm.hitos (id) ON DELETE CASCADE,
  persona_id     uuid NOT NULL REFERENCES crm.personas (id) ON DELETE CASCADE,
  incluida_por   uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  estado         text NOT NULL DEFAULT 'pte' CHECK (estado IN ('pte', 'contactado')),
  canal          text,
  contactado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  fecha_contacto timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hito_id, persona_id)
);
CREATE INDEX hito_persona_persona_idx ON crm.hito_persona (persona_id);

CREATE TABLE crm.puntos (
  id          bigserial PRIMARY KEY,
  empleado_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  persona_id  uuid REFERENCES crm.personas (id) ON DELETE SET NULL,
  accion      text NOT NULL CHECK (accion IN ('clasificar', 'archivar', 'deshacer')),
  delta       smallint NOT NULL CHECK (delta IN (-1, 1)),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX puntos_empleado_idx ON crm.puntos (empleado_id);

CREATE TABLE crm.bonos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  fecha       date NOT NULL DEFAULT current_date,
  importe     numeric(10, 2) NOT NULL DEFAULT 100,
  estado      text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'entregado')),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX bonos_empleado_idx ON crm.bonos (empleado_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Funciones de apoyo a RLS (SECURITY DEFINER para no recursar en las políticas)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION crm.is_admin() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT EXISTS (SELECT 1 FROM crm.permisos WHERE user_id = auth.uid() AND es_admin)
      OR EXISTS (SELECT 1 FROM public.app_user_account
                  WHERE user_id = auth.uid() AND is_platform_admin);
$$;

CREATE FUNCTION crm.puede_bolsa() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT crm.is_admin()
      OR EXISTS (SELECT 1 FROM crm.permisos WHERE user_id = auth.uid() AND ve_bolsa);
$$;

-- Sin fila en app_user_account = cuenta activa (mismo criterio que icam).
CREATE FUNCTION crm.empleado_activo(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT COALESCE(
    (SELECT is_active FROM public.app_user_account WHERE user_id = p_user), true);
$$;

CREATE FUNCTION crm.conoce_persona(p_persona uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT EXISTS (SELECT 1 FROM crm.relaciones
                  WHERE persona_id = p_persona AND empleado_id = auth.uid());
$$;

CREATE FUNCTION crm.en_bolsa(p_persona uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT EXISTS (SELECT 1 FROM crm.relaciones r
                  WHERE r.persona_id = p_persona
                    AND NOT crm.empleado_activo(r.empleado_id));
$$;

CREATE FUNCTION crm.etiqueta_visible(p_etiqueta uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT EXISTS (SELECT 1 FROM crm.etiquetas e
                  WHERE e.id = p_etiqueta
                    AND (e.tipo = 'general' OR e.creador = auth.uid()));
$$;

CREATE FUNCTION crm.hito_visible(p_hito uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT EXISTS (SELECT 1 FROM crm.hitos h
                  WHERE h.id = p_hito
                    AND (h.ambito = 'general' OR h.abierto_por = auth.uid()));
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Recordatorios: plazo más corto de las etiquetas que ve el empleado
-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION crm.recalcular_recordatorios(p_persona uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE
  v_defecto integer := COALESCE(
    (SELECT (valor #>> '{}')::integer FROM crm.config WHERE clave = 'plazo_defecto_dias'), 90);
BEGIN
  UPDATE crm.relaciones r
     SET proximo_recordatorio = CASE
           WHEN r.estado <> 'clasificada' THEN NULL
           ELSE (COALESCE(r.ultima_reunion, r.created_at))::date + COALESCE(
             (SELECT min(e.plazo_dias)
                FROM crm.etiquetas_persona ep
                JOIN crm.etiquetas e ON e.id = ep.etiqueta_id
               WHERE ep.persona_id = r.persona_id
                 AND (e.tipo = 'general' OR e.creador = r.empleado_id)),
             v_defecto)
         END
   WHERE r.persona_id = p_persona;
END;
$$;

CREATE FUNCTION crm.tg_etiquetas_persona_recalc() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
BEGIN
  PERFORM crm.recalcular_recordatorios(COALESCE(NEW.persona_id, OLD.persona_id));
  RETURN NULL;
END;
$$;
CREATE TRIGGER etiquetas_persona_recalc
  AFTER INSERT OR DELETE ON crm.etiquetas_persona
  FOR EACH ROW EXECUTE FUNCTION crm.tg_etiquetas_persona_recalc();

CREATE FUNCTION crm.tg_etiquetas_plazo_recalc() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE v_persona uuid;
BEGIN
  FOR v_persona IN SELECT persona_id FROM crm.etiquetas_persona WHERE etiqueta_id = NEW.id LOOP
    PERFORM crm.recalcular_recordatorios(v_persona);
  END LOOP;
  RETURN NULL;
END;
$$;
CREATE TRIGGER etiquetas_plazo_recalc
  AFTER UPDATE OF plazo_dias ON crm.etiquetas
  FOR EACH ROW EXECUTE FUNCTION crm.tg_etiquetas_plazo_recalc();

-- ─────────────────────────────────────────────────────────────────────────────
-- Relaciones: updated_at, puntos, bonos y recordatorio al cambiar de estado
-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION crm.tg_relaciones_before() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.estado = 'clasificada' AND OLD.estado IS DISTINCT FROM 'clasificada' THEN
    NEW.clasificada_en := now();
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER relaciones_before
  BEFORE UPDATE ON crm.relaciones
  FOR EACH ROW EXECUTE FUNCTION crm.tg_relaciones_before();

-- 1 punto al pasar de «nueva» a clasificada/archivada; −1 al deshacer (volver a «nueva»).
-- Cada `puntos_por_bono` puntos netos se genera un bono.
CREATE FUNCTION crm.tg_relaciones_puntos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE
  v_delta smallint;
  v_accion text;
  v_total integer;
  v_bonos integer;
  v_por_bono integer := COALESCE(
    (SELECT (valor #>> '{}')::integer FROM crm.config WHERE clave = 'puntos_por_bono'), 50);
  v_importe numeric := COALESCE(
    (SELECT (valor #>> '{}')::numeric FROM crm.config WHERE clave = 'importe_bono'), 100);
BEGIN
  IF current_setting('crm.sin_puntos', true) = 'on' THEN
    RETURN NULL;
  END IF;

  IF OLD.estado = 'nueva' AND NEW.estado IN ('clasificada', 'archivada') THEN
    v_delta := 1;
    v_accion := CASE NEW.estado WHEN 'clasificada' THEN 'clasificar' ELSE 'archivar' END;
  ELSIF OLD.estado IN ('clasificada', 'archivada') AND NEW.estado = 'nueva' THEN
    v_delta := -1;
    v_accion := 'deshacer';
  END IF;

  IF v_delta IS NOT NULL THEN
    INSERT INTO crm.puntos (empleado_id, persona_id, accion, delta)
    VALUES (NEW.empleado_id, NEW.persona_id, v_accion, v_delta);

    IF v_delta > 0 THEN
      SELECT COALESCE(sum(delta), 0) INTO v_total FROM crm.puntos WHERE empleado_id = NEW.empleado_id;
      SELECT count(*) INTO v_bonos FROM crm.bonos WHERE empleado_id = NEW.empleado_id;
      IF v_total / v_por_bono > v_bonos THEN
        INSERT INTO crm.bonos (empleado_id, importe) VALUES (NEW.empleado_id, v_importe);
      END IF;
    END IF;
  END IF;

  IF OLD.estado IS DISTINCT FROM NEW.estado
     OR OLD.ultima_reunion IS DISTINCT FROM NEW.ultima_reunion THEN
    PERFORM crm.recalcular_recordatorios(NEW.persona_id);
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER relaciones_puntos
  AFTER UPDATE ON crm.relaciones
  FOR EACH ROW EXECUTE FUNCTION crm.tg_relaciones_puntos();

CREATE FUNCTION crm.tg_touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER personas_touch
  BEFORE UPDATE ON crm.personas
  FOR EACH ROW EXECUTE FUNCTION crm.tg_touch_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- RPCs
-- ─────────────────────────────────────────────────────────────────────────────

-- Alta manual (comida fuera de calendario, contacto suelto…). Deduplica por email:
-- si la persona ya existe para otro empleado, solo se crea la relación.
CREATE FUNCTION crm.alta_manual(
  p_nombre text,
  p_email text,
  p_telefono text,
  p_cargo text,
  p_empresa text,
  p_notas text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := NULLIF(lower(trim(p_email)), '');
  v_tel text := NULLIF(trim(p_telefono), '');
  v_empresa_id uuid;
  v_persona_id uuid;
  v_dominio text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  IF NULLIF(trim(p_nombre), '') IS NULL THEN RAISE EXCEPTION 'El nombre es obligatorio'; END IF;
  IF v_email IS NULL AND v_tel IS NULL THEN
    RAISE EXCEPTION 'Indica al menos un email o un teléfono';
  END IF;

  IF NULLIF(trim(p_empresa), '') IS NOT NULL THEN
    SELECT id INTO v_empresa_id FROM crm.empresas WHERE lower(nombre) = lower(trim(p_empresa));
    IF v_empresa_id IS NULL THEN
      v_dominio := CASE
        WHEN v_email IS NOT NULL
         AND split_part(v_email, '@', 2) NOT IN
             ('gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com', 'live.com', 'yahoo.es', 'hotmail.es')
        THEN split_part(v_email, '@', 2) END;
      IF v_dominio IS NOT NULL AND EXISTS (SELECT 1 FROM crm.empresas WHERE dominio = v_dominio) THEN
        v_dominio := NULL;
      END IF;
      INSERT INTO crm.empresas (nombre, dominio) VALUES (trim(p_empresa), v_dominio)
      RETURNING id INTO v_empresa_id;
    END IF;
  END IF;

  IF v_email IS NOT NULL THEN
    SELECT id INTO v_persona_id FROM crm.personas WHERE email = v_email;
  END IF;

  IF v_persona_id IS NULL THEN
    INSERT INTO crm.personas (nombre, email, telefono, cargo, empresa_id)
    VALUES (trim(p_nombre), v_email, v_tel, NULLIF(trim(p_cargo), ''), v_empresa_id)
    RETURNING id INTO v_persona_id;
  ELSE
    UPDATE crm.personas
       SET telefono   = COALESCE(telefono, v_tel),
           cargo      = COALESCE(cargo, NULLIF(trim(p_cargo), '')),
           empresa_id = COALESCE(empresa_id, v_empresa_id)
     WHERE id = v_persona_id;
  END IF;

  INSERT INTO crm.relaciones (empleado_id, persona_id, estado, origen, notas)
  VALUES (v_uid, v_persona_id, 'nueva', 'manual', NULLIF(trim(p_notas), ''))
  ON CONFLICT (empleado_id, persona_id) DO UPDATE
    SET estado = CASE WHEN crm.relaciones.estado = 'archivada' THEN 'nueva' ELSE crm.relaciones.estado END;

  RETURN v_persona_id;
END;
$$;

-- Adoptar una relación de la bolsa común (empleado dado de baja).
CREATE FUNCTION crm.adoptar_relacion(p_relacion uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE
  v_uid uuid := auth.uid();
  r crm.relaciones;
BEGIN
  IF v_uid IS NULL OR NOT crm.puede_bolsa() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM crm.relaciones WHERE id = p_relacion;
  IF r.id IS NULL OR crm.empleado_activo(r.empleado_id) THEN
    RAISE EXCEPTION 'La relación no está en la bolsa común';
  END IF;

  IF EXISTS (SELECT 1 FROM crm.relaciones WHERE empleado_id = v_uid AND persona_id = r.persona_id) THEN
    DELETE FROM crm.relaciones WHERE id = r.id;
  ELSE
    -- Se adopta como «nueva» para que pase por el ritual del nuevo dueño
    -- (sin tocar los puntos del empleado que se fue).
    PERFORM set_config('crm.sin_puntos', 'on', true);
    UPDATE crm.relaciones
       SET empleado_id = v_uid, origen = 'bolsa', estado = 'nueva', proximo_recordatorio = NULL
     WHERE id = r.id;
    PERFORM set_config('crm.sin_puntos', 'off', true);
  END IF;
END;
$$;

-- Fusionar etiquetas duplicadas («Inversor» → «Inversores»). Solo administrador.
CREATE FUNCTION crm.fusionar_etiquetas(p_origen uuid, p_destino uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE v_persona uuid;
BEGIN
  IF NOT crm.is_admin() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  IF p_origen = p_destino THEN RETURN; END IF;

  INSERT INTO crm.etiquetas_persona (persona_id, etiqueta_id, puesta_por, created_at)
  SELECT persona_id, p_destino, puesta_por, created_at
    FROM crm.etiquetas_persona WHERE etiqueta_id = p_origen
  ON CONFLICT DO NOTHING;

  UPDATE crm.hitos
     SET etiquetas_filtro = array(SELECT DISTINCT unnest(array_replace(etiquetas_filtro, p_origen, p_destino)))
   WHERE p_origen = ANY (etiquetas_filtro);

  DELETE FROM crm.etiquetas WHERE id = p_origen;

  FOR v_persona IN SELECT persona_id FROM crm.etiquetas_persona WHERE etiqueta_id = p_destino LOOP
    PERFORM crm.recalcular_recordatorios(v_persona);
  END LOOP;
END;
$$;

-- Nombres de empleados (para «Contactado por X»). Solo id → nombre/email.
CREATE FUNCTION crm.empleados_display(p_ids uuid[]) RETURNS TABLE (id uuid, nombre text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = crm, public, auth AS $$
  SELECT u.id,
         COALESCE(NULLIF(u.raw_user_meta_data ->> 'name', ''),
                  NULLIF(u.raw_user_meta_data ->> 'full_name', ''),
                  split_part(u.email::text, '@', 1)),
         u.email::text
    FROM auth.users u
   WHERE u.id = ANY (p_ids) AND auth.uid() IS NOT NULL;
$$;

-- Bolsa común: relaciones de empleados dados de baja (con permiso).
CREATE FUNCTION crm.bolsa_comun() RETURNS TABLE (
  relacion_id uuid,
  persona_id uuid,
  persona_nombre text,
  persona_email text,
  empresa text,
  estado text,
  ultima_reunion timestamptz,
  empleado_nombre text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = crm, public, auth AS $$
BEGIN
  IF NOT crm.puede_bolsa() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  SELECT r.id, p.id, p.nombre, p.email, e.nombre, r.estado, r.ultima_reunion,
         COALESCE(NULLIF(u.raw_user_meta_data ->> 'name', ''), split_part(u.email::text, '@', 1))
    FROM crm.relaciones r
    JOIN crm.personas p ON p.id = r.persona_id
    LEFT JOIN crm.empresas e ON e.id = p.empresa_id
    JOIN auth.users u ON u.id = r.empleado_id
   WHERE NOT crm.empleado_activo(r.empleado_id)
   ORDER BY p.nombre;
END;
$$;

-- Vista consolidada por empleado para el panel del administrador.
CREATE FUNCTION crm.resumen_empleados() RETURNS TABLE (
  empleado_id uuid,
  nombre text,
  email text,
  activo boolean,
  nuevas bigint,
  clasificadas bigint,
  archivadas bigint,
  vencidas bigint,
  puntos bigint,
  bonos bigint,
  bonos_pendientes bigint
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = crm, public, auth AS $$
BEGIN
  IF NOT crm.is_admin() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  RETURN QUERY
  WITH emp AS (
    SELECT r.empleado_id AS uid FROM crm.relaciones r
    UNION SELECT p.empleado_id FROM crm.puntos p
  )
  SELECT e.uid,
         COALESCE(NULLIF(u.raw_user_meta_data ->> 'name', ''),
                  NULLIF(u.raw_user_meta_data ->> 'full_name', ''),
                  split_part(u.email::text, '@', 1)),
         u.email::text,
         crm.empleado_activo(e.uid),
         (SELECT count(*) FROM crm.relaciones r WHERE r.empleado_id = e.uid AND r.estado = 'nueva'),
         (SELECT count(*) FROM crm.relaciones r WHERE r.empleado_id = e.uid AND r.estado = 'clasificada'),
         (SELECT count(*) FROM crm.relaciones r WHERE r.empleado_id = e.uid AND r.estado = 'archivada'),
         (SELECT count(*) FROM crm.relaciones r WHERE r.empleado_id = e.uid
             AND r.estado = 'clasificada' AND r.proximo_recordatorio <= current_date),
         (SELECT COALESCE(sum(p.delta), 0) FROM crm.puntos p WHERE p.empleado_id = e.uid),
         (SELECT count(*) FROM crm.bonos b WHERE b.empleado_id = e.uid),
         (SELECT count(*) FROM crm.bonos b WHERE b.empleado_id = e.uid AND b.estado = 'pendiente')
    FROM emp e
    JOIN auth.users u ON u.id = e.uid
   ORDER BY 2;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE crm.permisos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.config            ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.empresas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.personas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.relaciones        ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.reuniones         ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.asistentes        ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.etiquetas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.etiquetas_persona ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.hitos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.hito_persona      ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.puntos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.bonos             ENABLE ROW LEVEL SECURITY;

-- permisos
CREATE POLICY permisos_select ON crm.permisos FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR crm.is_admin());
CREATE POLICY permisos_admin ON crm.permisos FOR ALL TO authenticated
  USING (crm.is_admin()) WITH CHECK (crm.is_admin());

-- config
CREATE POLICY config_select ON crm.config FOR SELECT TO authenticated USING (true);
CREATE POLICY config_admin ON crm.config FOR ALL TO authenticated
  USING (crm.is_admin()) WITH CHECK (crm.is_admin());

-- empresas: catálogo compartido
CREATE POLICY empresas_select ON crm.empresas FOR SELECT TO authenticated USING (true);
CREATE POLICY empresas_insert ON crm.empresas FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY empresas_update ON crm.empresas FOR UPDATE TO authenticated
  USING (crm.is_admin()) WITH CHECK (crm.is_admin());

-- personas: las que conoce el empleado, las de la bolsa (con permiso) o todas (admin)
CREATE POLICY personas_select ON crm.personas FOR SELECT TO authenticated
  USING (crm.is_admin() OR crm.conoce_persona(id) OR (crm.puede_bolsa() AND crm.en_bolsa(id)));
CREATE POLICY personas_update ON crm.personas FOR UPDATE TO authenticated
  USING (crm.is_admin() OR crm.conoce_persona(id))
  WITH CHECK (crm.is_admin() OR crm.conoce_persona(id));
CREATE POLICY personas_delete ON crm.personas FOR DELETE TO authenticated
  USING (crm.is_admin());

-- relaciones: las propias; la bolsa común con permiso; todas para admin
CREATE POLICY relaciones_select ON crm.relaciones FOR SELECT TO authenticated
  USING (empleado_id = auth.uid() OR crm.is_admin()
         OR (crm.puede_bolsa() AND NOT crm.empleado_activo(empleado_id)));
CREATE POLICY relaciones_insert ON crm.relaciones FOR INSERT TO authenticated
  WITH CHECK (empleado_id = auth.uid());
CREATE POLICY relaciones_update ON crm.relaciones FOR UPDATE TO authenticated
  USING (empleado_id = auth.uid() OR crm.is_admin())
  WITH CHECK (empleado_id = auth.uid() OR crm.is_admin());
CREATE POLICY relaciones_delete ON crm.relaciones FOR DELETE TO authenticated
  USING (crm.is_admin());

-- reuniones / asistentes: solo lectura de las que tocan a personas visibles
CREATE POLICY asistentes_select ON crm.asistentes FOR SELECT TO authenticated
  USING (crm.is_admin() OR crm.conoce_persona(persona_id));
CREATE POLICY reuniones_select ON crm.reuniones FOR SELECT TO authenticated
  USING (crm.is_admin() OR EXISTS (
    SELECT 1 FROM crm.asistentes a WHERE a.reunion_id = id AND crm.conoce_persona(a.persona_id)));

-- etiquetas
CREATE POLICY etiquetas_select ON crm.etiquetas FOR SELECT TO authenticated
  USING (tipo = 'general' OR creador = auth.uid() OR crm.is_admin());
CREATE POLICY etiquetas_insert ON crm.etiquetas FOR INSERT TO authenticated
  WITH CHECK (creador = auth.uid());
CREATE POLICY etiquetas_update ON crm.etiquetas FOR UPDATE TO authenticated
  USING (crm.is_admin() OR (tipo = 'personal' AND creador = auth.uid()))
  WITH CHECK (crm.is_admin() OR (tipo = 'personal' AND creador = auth.uid()));
CREATE POLICY etiquetas_delete ON crm.etiquetas FOR DELETE TO authenticated
  USING (crm.is_admin() OR (tipo = 'personal' AND creador = auth.uid()));

-- etiquetas_persona: las generales sobre personas visibles; las personales solo a su autor
CREATE POLICY etiquetas_persona_select ON crm.etiquetas_persona FOR SELECT TO authenticated
  USING (crm.etiqueta_visible(etiqueta_id) AND (crm.is_admin() OR crm.conoce_persona(persona_id)));
CREATE POLICY etiquetas_persona_insert ON crm.etiquetas_persona FOR INSERT TO authenticated
  WITH CHECK (puesta_por = auth.uid() AND crm.etiqueta_visible(etiqueta_id)
              AND (crm.is_admin() OR crm.conoce_persona(persona_id)));
CREATE POLICY etiquetas_persona_delete ON crm.etiquetas_persona FOR DELETE TO authenticated
  USING (crm.etiqueta_visible(etiqueta_id) AND (crm.is_admin() OR crm.conoce_persona(persona_id)));

-- hitos: generales para todos; personales solo para quien los abre
CREATE POLICY hitos_select ON crm.hitos FOR SELECT TO authenticated
  USING (ambito = 'general' OR abierto_por = auth.uid() OR crm.is_admin());
CREATE POLICY hitos_insert ON crm.hitos FOR INSERT TO authenticated
  WITH CHECK (abierto_por = auth.uid());
CREATE POLICY hitos_update ON crm.hitos FOR UPDATE TO authenticated
  USING (abierto_por = auth.uid() OR crm.is_admin())
  WITH CHECK (abierto_por = auth.uid() OR crm.is_admin());
CREATE POLICY hitos_delete ON crm.hitos FOR DELETE TO authenticated
  USING (abierto_por = auth.uid() OR crm.is_admin());

-- hito_persona: cada empleado ve y gestiona, dentro de los hitos que ve, a sus contactos
CREATE POLICY hito_persona_select ON crm.hito_persona FOR SELECT TO authenticated
  USING (crm.hito_visible(hito_id) AND (crm.is_admin() OR crm.conoce_persona(persona_id)));
CREATE POLICY hito_persona_insert ON crm.hito_persona FOR INSERT TO authenticated
  WITH CHECK (incluida_por = auth.uid() AND crm.hito_visible(hito_id) AND crm.conoce_persona(persona_id));
CREATE POLICY hito_persona_update ON crm.hito_persona FOR UPDATE TO authenticated
  USING (crm.hito_visible(hito_id) AND (crm.is_admin() OR crm.conoce_persona(persona_id)))
  WITH CHECK (crm.hito_visible(hito_id) AND (crm.is_admin() OR crm.conoce_persona(persona_id)));
CREATE POLICY hito_persona_delete ON crm.hito_persona FOR DELETE TO authenticated
  USING (crm.hito_visible(hito_id) AND (crm.is_admin() OR incluida_por = auth.uid()));

-- puntos y bonos: lectura propia o admin; los escribe el trigger
CREATE POLICY puntos_select ON crm.puntos FOR SELECT TO authenticated
  USING (empleado_id = auth.uid() OR crm.is_admin());
CREATE POLICY bonos_select ON crm.bonos FOR SELECT TO authenticated
  USING (empleado_id = auth.uid() OR crm.is_admin());
CREATE POLICY bonos_update ON crm.bonos FOR UPDATE TO authenticated
  USING (crm.is_admin()) WITH CHECK (crm.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Permisos de PostgREST
-- ─────────────────────────────────────────────────────────────────────────────

REVOKE ALL ON SCHEMA crm FROM anon, public;
GRANT USAGE ON SCHEMA crm TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA crm TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA crm TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA crm TO authenticated, service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA crm FROM public, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA crm TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
