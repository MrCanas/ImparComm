-- Seguridad y estabilidad (fase 0 de la auditoría)
-- 1) Fechas en hora de Madrid (antes ::date y current_date iban en UTC).
-- 2) El empleado solo actualiza las columnas que le corresponden; quién y cuándo
--    contactó lo fija la base, no el cliente.
-- 3) Puntos: solo clasificar puntúa, y cada contacto vale como mucho 1 punto.
-- 4) Bonos anulables; parámetros enteros; aviso antes de purgar dominios.
-- 5) RPCs que agregan en SQL para no depender del tope de 1000 filas de la API.

-- ─────────────────────────────────────────────────────────────────────────────
-- Hora de Madrid
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION crm.hoy() RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Europe/Madrid')::date $$;

CREATE FUNCTION crm.ahora_madrid() RETURNS timestamp
LANGUAGE sql STABLE AS $$ SELECT now() AT TIME ZONE 'Europe/Madrid' $$;

CREATE FUNCTION crm.local_madrid(p timestamptz) RETURNS timestamp
LANGUAGE sql STABLE AS $$ SELECT p AT TIME ZONE 'Europe/Madrid' $$;

CREATE FUNCTION crm.dia_madrid(p timestamptz) RETURNS date
LANGUAGE sql STABLE AS $$ SELECT (p AT TIME ZONE 'Europe/Madrid')::date $$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Columnas que puede tocar el empleado. El resto (persona_id, empleado_id,
-- contactado_por, fecha_contacto, incluida_por, zoho_*) las fija la base o el
-- servidor. Las altas de relaciones van siempre por RPC (alta_manual,
-- registrar_reunion, adoptar_relacion).
-- ─────────────────────────────────────────────────────────────────────────────
REVOKE INSERT, UPDATE ON crm.relaciones FROM authenticated;
GRANT UPDATE (estado, notas) ON crm.relaciones TO authenticated;

REVOKE INSERT, UPDATE ON crm.hito_persona FROM authenticated;
GRANT INSERT (hito_id, persona_id, incluida_por) ON crm.hito_persona TO authenticated;
GRANT UPDATE (estado, canal) ON crm.hito_persona TO authenticated;

CREATE FUNCTION crm.tg_hito_persona_before() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE v_empleado boolean := auth.role() = 'authenticated';
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF v_empleado THEN
      NEW.incluida_por := auth.uid();
      NEW.estado := 'pte';
      NEW.contactado_por := NULL;
      NEW.fecha_contacto := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.estado = 'contactado' AND OLD.estado <> 'contactado' THEN
    NEW.contactado_por := COALESCE(auth.uid(), NEW.contactado_por);
    NEW.fecha_contacto := now();
  ELSIF NEW.estado = 'pte' AND OLD.estado = 'contactado' THEN
    IF v_empleado AND OLD.contactado_por IS DISTINCT FROM auth.uid() AND NOT crm.is_admin() THEN
      RAISE EXCEPTION 'Solo quien lo marcó como contactado (o un administrador) puede revertirlo'
        USING ERRCODE = '42501';
    END IF;
    NEW.contactado_por := NULL;
    NEW.fecha_contacto := NULL;
    NEW.canal := NULL;
  ELSIF v_empleado AND NEW.estado = 'contactado' THEN
    -- Ya estaba contactado: se conserva quién y cuándo.
    NEW.contactado_por := OLD.contactado_por;
    NEW.fecha_contacto := OLD.fecha_contacto;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER hito_persona_before
  BEFORE INSERT OR UPDATE ON crm.hito_persona
  FOR EACH ROW EXECUTE FUNCTION crm.tg_hito_persona_before();

-- ─────────────────────────────────────────────────────────────────────────────
-- Puntos: solo clasificar puntúa (+1) y deshacerlo resta (−1). Archivar, uno a
-- uno o en bloque, no puntúa. Cada contacto vale como mucho 1 punto neto por
-- empleado: archivar, volver a dar de alta y reclasificar no acumula.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.tg_relaciones_puntos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE
  v_delta smallint;
  v_accion text;
  v_neto integer;
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

  IF OLD.estado IS DISTINCT FROM NEW.estado THEN
    SELECT COALESCE(sum(delta), 0) INTO v_neto
      FROM crm.puntos WHERE empleado_id = NEW.empleado_id AND persona_id = NEW.persona_id;
    IF OLD.estado IN ('nueva', 'archivada') AND NEW.estado = 'clasificada' AND v_neto <= 0 THEN
      v_delta := 1;
      v_accion := 'clasificar';
    ELSIF OLD.estado = 'clasificada' AND NEW.estado = 'nueva' AND v_neto >= 1 THEN
      v_delta := -1;
      v_accion := 'deshacer';
    END IF;
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

-- ─────────────────────────────────────────────────────────────────────────────
-- Bonos anulables por el administrador (siguen contando para no reemitirlos).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE crm.bonos ADD COLUMN anulado_en timestamptz, ADD COLUMN anulado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL;
DO $$
DECLARE v_nombre text;
BEGIN
  SELECT conname INTO v_nombre FROM pg_constraint
   WHERE conrelid = 'crm.bonos'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) LIKE '%estado%';
  IF v_nombre IS NOT NULL THEN EXECUTE format('ALTER TABLE crm.bonos DROP CONSTRAINT %I', v_nombre); END IF;
END $$;
ALTER TABLE crm.bonos ADD CONSTRAINT bonos_estado_ck CHECK (estado IN ('pendiente', 'entregado', 'anulado'));

CREATE FUNCTION crm.tg_bonos_anulado() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.estado = 'anulado' AND OLD.estado <> 'anulado' THEN
    NEW.anulado_en := now();
    NEW.anulado_por := auth.uid();
  ELSIF NEW.estado <> 'anulado' THEN
    NEW.anulado_en := NULL;
    NEW.anulado_por := NULL;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bonos_anulado BEFORE UPDATE OF estado ON crm.bonos
  FOR EACH ROW EXECUTE FUNCTION crm.tg_bonos_anulado();

-- ─────────────────────────────────────────────────────────────────────────────
-- Parámetros: enteros positivos (un decimal rompía el trigger de puntos y, con
-- él, todo cambio de estado). Cambiar el plazo por defecto recalcula recordatorios.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE crm.config ADD CONSTRAINT config_valor_ck CHECK (
  CASE clave
    WHEN 'dominios_internos' THEN jsonb_typeof(valor) = 'array'
    WHEN 'importe_bono' THEN jsonb_typeof(valor) = 'number' AND (valor #>> '{}')::numeric > 0
    WHEN 'plazo_defecto_dias' THEN jsonb_typeof(valor) = 'number' AND (valor #>> '{}')::numeric > 0 AND (valor #>> '{}')::numeric = floor((valor #>> '{}')::numeric)
    WHEN 'puntos_por_bono' THEN jsonb_typeof(valor) = 'number' AND (valor #>> '{}')::numeric > 0 AND (valor #>> '{}')::numeric = floor((valor #>> '{}')::numeric)
    WHEN 'evento_umbral_externos' THEN jsonb_typeof(valor) = 'number' AND (valor #>> '{}')::numeric > 0 AND (valor #>> '{}')::numeric = floor((valor #>> '{}')::numeric)
    ELSE true
  END
);

CREATE FUNCTION crm.tg_config_plazo() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE v_persona uuid;
BEGIN
  IF NEW.clave = 'plazo_defecto_dias' AND (TG_OP = 'INSERT' OR OLD.valor IS DISTINCT FROM NEW.valor) THEN
    FOR v_persona IN SELECT DISTINCT persona_id FROM crm.relaciones WHERE estado = 'clasificada' LOOP
      PERFORM crm.recalcular_recordatorios(v_persona);
    END LOOP;
  END IF;
  RETURN NULL;
END;
$$;
CREATE TRIGGER config_plazo AFTER INSERT OR UPDATE ON crm.config
  FOR EACH ROW EXECUTE FUNCTION crm.tg_config_plazo();

-- ─────────────────────────────────────────────────────────────────────────────
-- Nombres de empleados: solo de quienes participan en el CRM, no de cualquier
-- usuario de icam.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION crm.es_empleado_crm(p_user uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT EXISTS (SELECT 1 FROM crm.relaciones WHERE empleado_id = p_user)
      OR EXISTS (SELECT 1 FROM crm.hitos WHERE abierto_por = p_user)
      OR EXISTS (SELECT 1 FROM crm.puntos WHERE empleado_id = p_user)
      OR EXISTS (SELECT 1 FROM crm.permisos WHERE user_id = p_user)
      OR EXISTS (SELECT 1 FROM crm.hito_persona WHERE incluida_por = p_user OR contactado_por = p_user)
      OR EXISTS (SELECT 1 FROM crm.hito_eventos WHERE empleado_id = p_user);
$$;

CREATE OR REPLACE FUNCTION crm.empleados_display(p_ids uuid[]) RETURNS TABLE (id uuid, nombre text, email text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = crm, public, auth AS $$
  SELECT u.id,
         COALESCE(NULLIF(u.raw_user_meta_data ->> 'name', ''),
                  NULLIF(u.raw_user_meta_data ->> 'full_name', ''),
                  split_part(u.email::text, '@', 1)),
         u.email::text
    FROM auth.users u
   WHERE u.id = ANY (p_ids) AND auth.uid() IS NOT NULL AND crm.es_empleado_crm(u.id);
$$;

-- Helpers internos que no deben poder llamarse desde la API.
REVOKE EXECUTE ON FUNCTION crm.recalcular_recordatorios(uuid), crm.es_empleado_crm(uuid),
  crm.nombre_empresa_de_dominio(text) FROM authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Dominios internos: cuántos contactos se borrarían, y nunca dominios de correo
-- personal (gmail.com borraría media agenda).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION crm.contar_purga_dominios(p_dominios text[]) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE v_n integer;
BEGIN
  IF NOT crm.is_admin() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_dominios) d WHERE crm.es_dominio_generico(d)) THEN
    RAISE EXCEPTION 'Un dominio de correo personal (gmail, hotmail…) no puede ser interno';
  END IF;
  SELECT count(*) INTO v_n
    FROM crm.relaciones r
    JOIN crm.personas p ON p.id = r.persona_id
   WHERE r.origen = 'calendario'
     AND p.zoho_id IS NULL
     AND split_part(p.email, '@', 2) = ANY (p_dominios);
  RETURN v_n;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Agregados en SQL (la API corta las listas a 1000 filas).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION crm.mis_puntos() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT jsonb_build_object(
    'total', (SELECT COALESCE(sum(delta), 0) FROM crm.puntos WHERE empleado_id = auth.uid()),
    'por_bono', COALESCE((SELECT (valor #>> '{}')::integer FROM crm.config WHERE clave = 'puntos_por_bono'), 50),
    'importe_bono', COALESCE((SELECT (valor #>> '{}')::numeric FROM crm.config WHERE clave = 'importe_bono'), 100),
    'bonos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', id, 'fecha', fecha, 'importe', importe, 'estado', estado) ORDER BY fecha DESC)
        FROM crm.bonos WHERE empleado_id = auth.uid()), '[]'::jsonb)
  );
$$;

-- Lo que necesita la cabecera en cada carga: pendientes del ritual y días con
-- actividad (para la racha), en fechas de Madrid.
CREATE FUNCTION crm.cabecera() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = crm, public AS $$
  SELECT jsonb_build_object(
    'pendientes', (SELECT count(*) FROM crm.relaciones WHERE empleado_id = auth.uid() AND estado = 'nueva'),
    'dias_activos', COALESCE((
      SELECT jsonb_agg(DISTINCT d) FROM (
        SELECT crm.dia_madrid(created_at) AS d FROM crm.hito_eventos
         WHERE empleado_id = auth.uid() AND accion IN ('contactar', 'incluir') AND created_at > now() - interval '120 days'
        UNION
        SELECT crm.dia_madrid(created_at) FROM crm.puntos
         WHERE empleado_id = auth.uid() AND delta > 0 AND created_at > now() - interval '120 days'
      ) x), '[]'::jsonb)
  );
$$;


-- ─────────────────────────────────────────────────────────────────────────────
-- Funciones existentes, ahora en hora de Madrid
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.recalcular_recordatorios(p_persona uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE
  v_defecto integer := COALESCE(
    (SELECT (valor #>> '{}')::integer FROM crm.config WHERE clave = 'plazo_defecto_dias'), 90);
BEGIN
  UPDATE crm.relaciones r
     SET proximo_recordatorio = CASE
           WHEN r.estado <> 'clasificada' THEN NULL
           ELSE crm.dia_madrid(COALESCE(r.ultima_reunion, r.created_at)) + COALESCE(
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

CREATE OR REPLACE FUNCTION crm.resumen_empleados() RETURNS TABLE (
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
             AND r.estado = 'clasificada' AND r.proximo_recordatorio <= crm.hoy()),
         (SELECT COALESCE(sum(p.delta), 0) FROM crm.puntos p WHERE p.empleado_id = e.uid),
         (SELECT count(*) FROM crm.bonos b WHERE b.empleado_id = e.uid),
         (SELECT count(*) FROM crm.bonos b WHERE b.empleado_id = e.uid AND b.estado = 'pendiente')
    FROM emp e
    JOIN auth.users u ON u.id = e.uid
   ORDER BY 2;
END;
$$;

CREATE OR REPLACE FUNCTION crm.stats_empleado(p_desde date, p_empleado uuid DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE
  v_uid uuid := COALESCE(p_empleado, auth.uid());
BEGIN
  IF auth.uid() IS NULL OR (v_uid <> auth.uid() AND NOT crm.is_admin()) THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'serie', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('dia', d.dia, 'contactados', d.contactados, 'clasificados', d.clasificados, 'incluidos', d.incluidos) ORDER BY d.dia)
        FROM (
          SELECT g.dia::date AS dia,
                 (SELECT count(*) FROM crm.hito_eventos e WHERE e.empleado_id = v_uid AND e.accion = 'contactar' AND crm.dia_madrid(e.created_at) = g.dia) AS contactados,
                 (SELECT count(*) FROM crm.puntos p WHERE p.empleado_id = v_uid AND p.delta > 0 AND crm.dia_madrid(p.created_at) = g.dia) AS clasificados,
                 (SELECT count(*) FROM crm.hito_eventos e WHERE e.empleado_id = v_uid AND e.accion = 'incluir' AND crm.dia_madrid(e.created_at) = g.dia) AS incluidos
            FROM generate_series(p_desde, crm.hoy(), interval '1 day') AS g(dia)
        ) d), '[]'::jsonb),
    -- Días con actividad del último año, para rachas y heatmap.
    'dias_activos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('dia', x.dia, 'n', x.n) ORDER BY x.dia)
        FROM (
          SELECT dia, sum(n)::int AS n FROM (
            SELECT crm.dia_madrid(created_at) AS dia, count(*) AS n FROM crm.hito_eventos
             WHERE empleado_id = v_uid AND accion IN ('contactar', 'incluir') AND created_at > now() - interval '1 year'
             GROUP BY 1
            UNION ALL
            SELECT crm.dia_madrid(created_at), count(*) FROM crm.puntos
             WHERE empleado_id = v_uid AND delta > 0 AND created_at > now() - interval '1 year'
             GROUP BY 1
          ) u GROUP BY dia
        ) x), '[]'::jsonb),
    'canales', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('canal', c.canal, 'n', c.n) ORDER BY c.n DESC)
        FROM (
          SELECT COALESCE(hp.canal, 'Sin canal') AS canal, count(*) AS n
            FROM crm.hito_persona hp
           WHERE hp.contactado_por = v_uid AND hp.estado = 'contactado'
           GROUP BY 1
        ) c), '[]'::jsonb),
    'hitos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', h.id, 'nombre', h.nombre, 'incluidos', h.incluidos, 'contactados', h.contactados) ORDER BY h.incluidos DESC)
        FROM (
          SELECT hi.id, hi.nombre,
                 count(*) AS incluidos,
                 count(*) FILTER (WHERE hp.estado = 'contactado') AS contactados
            FROM crm.hito_persona hp
            JOIN crm.hitos hi ON hi.id = hp.hito_id
           WHERE hp.incluida_por = v_uid
           GROUP BY hi.id, hi.nombre
        ) h), '[]'::jsonb),
    'totales', jsonb_build_object(
      'puntos', (SELECT COALESCE(sum(delta), 0) FROM crm.puntos WHERE empleado_id = v_uid),
      'contactados', (SELECT count(*) FROM crm.hito_persona WHERE contactado_por = v_uid AND estado = 'contactado'),
      'incluidos', (SELECT count(*) FROM crm.hito_persona WHERE incluida_por = v_uid),
      'max_contactos_dia', (SELECT COALESCE(max(n), 0) FROM (
          SELECT count(*) AS n FROM crm.hito_eventos
           WHERE empleado_id = v_uid AND accion = 'contactar' GROUP BY crm.dia_madrid(created_at)) m),
      'hitos_completados', (SELECT count(*) FROM (
          SELECT hito_id FROM crm.hito_persona WHERE incluida_por = v_uid
           GROUP BY hito_id HAVING bool_and(estado = 'contactado') AND count(*) >= 3) hc),
      'adoptados', (SELECT count(*) FROM crm.relaciones WHERE empleado_id = v_uid AND origen = 'bolsa'),
      'bonos', (SELECT count(*) FROM crm.bonos WHERE empleado_id = v_uid)
    )
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Estadísticas del equipo (solo admin): ranking y serie semanal por empleado.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.stats_equipo(p_desde date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = crm, public, auth AS $$
BEGIN
  IF NOT crm.is_admin() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;

  RETURN jsonb_build_object(
    'ranking', COALESCE((
      SELECT jsonb_agg(to_jsonb(r) ORDER BY r.xp DESC)
        FROM (
          SELECT e.uid AS id,
                 COALESCE(NULLIF(u.raw_user_meta_data ->> 'name', ''),
                          NULLIF(u.raw_user_meta_data ->> 'full_name', ''),
                          split_part(u.email::text, '@', 1)) AS nombre,
                 (SELECT count(*) FROM crm.hito_eventos h WHERE h.empleado_id = e.uid AND h.accion = 'contactar' AND crm.dia_madrid(h.created_at) >= p_desde) AS contactados,
                 (SELECT count(*) FROM crm.puntos p WHERE p.empleado_id = e.uid AND p.delta > 0 AND crm.dia_madrid(p.created_at) >= p_desde) AS clasificados,
                 (SELECT count(*) FROM crm.hito_eventos h WHERE h.empleado_id = e.uid AND h.accion = 'incluir' AND crm.dia_madrid(h.created_at) >= p_desde) AS incluidos,
                 (SELECT count(*) FROM crm.hito_eventos h WHERE h.empleado_id = e.uid AND h.accion = 'contactar' AND crm.dia_madrid(h.created_at) >= p_desde)
                 + (SELECT COALESCE(sum(p.delta), 0) FROM crm.puntos p WHERE p.empleado_id = e.uid AND crm.dia_madrid(p.created_at) >= p_desde) AS xp
            FROM (SELECT empleado_id AS uid FROM crm.relaciones
                  UNION SELECT empleado_id FROM crm.puntos
                  UNION SELECT empleado_id FROM crm.hito_eventos WHERE empleado_id IS NOT NULL) e
            JOIN auth.users u ON u.id = e.uid
           WHERE crm.empleado_activo(e.uid)
        ) r), '[]'::jsonb),
    'semanal', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('semana', s.semana, 'contactados', s.contactados, 'clasificados', s.clasificados) ORDER BY s.semana)
        FROM (
          SELECT g.semana::date AS semana,
                 (SELECT count(*) FROM crm.hito_eventos h WHERE h.accion = 'contactar'
                     AND crm.local_madrid(h.created_at) >= g.semana AND crm.local_madrid(h.created_at) < g.semana + interval '7 days') AS contactados,
                 (SELECT count(*) FROM crm.puntos p WHERE p.delta > 0
                     AND crm.local_madrid(p.created_at) >= g.semana AND crm.local_madrid(p.created_at) < g.semana + interval '7 days') AS clasificados
            FROM generate_series(date_trunc('week', p_desde::timestamp), date_trunc('week', crm.ahora_madrid()), interval '7 days') AS g(semana)
        ) s), '[]'::jsonb),
    'hitos', COALESCE((
      SELECT jsonb_agg(to_jsonb(h) ORDER BY h.incluidos DESC)
        FROM (
          SELECT hi.id, hi.nombre,
                 count(hp.persona_id) AS incluidos,
                 count(hp.persona_id) FILTER (WHERE hp.estado = 'contactado') AS contactados
            FROM crm.hitos hi
            LEFT JOIN crm.hito_persona hp ON hp.hito_id = hi.id
           WHERE hi.ambito = 'general'
           GROUP BY hi.id, hi.nombre
          HAVING count(hp.persona_id) > 0
        ) h), '[]'::jsonb)
  );
END;
$$;

-- Posición propia en el ranking del periodo (sin exponer cifras ajenas).
CREATE OR REPLACE FUNCTION crm.mi_posicion(p_desde date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  RETURN (
    WITH xp AS (
      SELECT e.uid,
             (SELECT count(*) FROM crm.hito_eventos h WHERE h.empleado_id = e.uid AND h.accion = 'contactar' AND crm.dia_madrid(h.created_at) >= p_desde)
             + (SELECT COALESCE(sum(p.delta), 0) FROM crm.puntos p WHERE p.empleado_id = e.uid AND crm.dia_madrid(p.created_at) >= p_desde) AS xp
        FROM (SELECT empleado_id AS uid FROM crm.relaciones
              UNION SELECT empleado_id FROM crm.puntos) e
       WHERE crm.empleado_activo(e.uid)
    )
    SELECT jsonb_build_object(
      'posicion', (SELECT count(*) + 1 FROM xp WHERE xp.xp > COALESCE((SELECT xp FROM xp WHERE uid = v_uid), 0)),
      'total', (SELECT count(*) FROM xp),
      'xp', COALESCE((SELECT xp FROM xp WHERE uid = v_uid), 0)
    )
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Bolsa común: reparto por antiguo dueño, antigüedad y adopciones por semana.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION crm.stats_bolsa() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = crm, public, auth AS $$
BEGIN
  IF NOT crm.puede_bolsa() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'adopciones', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('semana', s.semana, 'n', s.n) ORDER BY s.semana)
        FROM (
          SELECT g.semana::date AS semana,
                 (SELECT count(*) FROM crm.relaciones r WHERE r.origen = 'bolsa'
                     AND crm.local_madrid(r.updated_at) >= g.semana AND crm.local_madrid(r.updated_at) < g.semana + interval '7 days') AS n
            FROM generate_series(date_trunc('week', crm.ahora_madrid() - interval '11 weeks'), date_trunc('week', crm.ahora_madrid()), interval '7 days') AS g(semana)
        ) s), '[]'::jsonb),
    'adoptados_mes', (SELECT count(*) FROM crm.relaciones WHERE origen = 'bolsa' AND crm.local_madrid(updated_at) >= date_trunc('month', crm.ahora_madrid())),
    'mis_rescates', (SELECT count(*) FROM crm.relaciones WHERE origen = 'bolsa' AND empleado_id = auth.uid())
  );
END;
$$;

REVOKE ALL ON FUNCTION crm.hoy(), crm.ahora_madrid(), crm.local_madrid(timestamptz), crm.dia_madrid(timestamptz),
  crm.contar_purga_dominios(text[]), crm.mis_puntos(), crm.cabecera(), crm.tg_hito_persona_before(),
  crm.tg_bonos_anulado(), crm.tg_config_plazo() FROM public, anon;
GRANT EXECUTE ON FUNCTION crm.hoy(), crm.ahora_madrid(), crm.local_madrid(timestamptz), crm.dia_madrid(timestamptz),
  crm.contar_purga_dominios(text[]), crm.mis_puntos(), crm.cabecera(), crm.es_dominio_generico(text)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
