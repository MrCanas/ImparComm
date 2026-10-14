-- Gamificación y analíticas
-- 1) Historial de movimientos en hitos (crm.hito_eventos), escrito por trigger.
-- 2) RPCs de solo lectura para las gráficas: personal, equipo (admin), bolsa y
--    resumen por hito. No tocan puntos ni bonos.

CREATE TABLE crm.hito_eventos (
  id          bigserial PRIMARY KEY,
  hito_id     uuid NOT NULL REFERENCES crm.hitos (id) ON DELETE CASCADE,
  persona_id  uuid NOT NULL REFERENCES crm.personas (id) ON DELETE CASCADE,
  empleado_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  accion      text NOT NULL CHECK (accion IN ('incluir', 'contactar', 'volver_pte', 'quitar')),
  canal       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX hito_eventos_hito_idx ON crm.hito_eventos (hito_id, created_at);
CREATE INDEX hito_eventos_empleado_idx ON crm.hito_eventos (empleado_id, created_at);
CREATE INDEX hito_eventos_persona_idx ON crm.hito_eventos (persona_id);

-- Histórico: lo que ya hay en hito_persona como eventos de partida.
INSERT INTO crm.hito_eventos (hito_id, persona_id, empleado_id, accion, created_at)
SELECT hito_id, persona_id, incluida_por, 'incluir', created_at FROM crm.hito_persona;
INSERT INTO crm.hito_eventos (hito_id, persona_id, empleado_id, accion, canal, created_at)
SELECT hito_id, persona_id, contactado_por, 'contactar', canal, fecha_contacto
  FROM crm.hito_persona WHERE estado = 'contactado' AND fecha_contacto IS NOT NULL;

CREATE FUNCTION crm.tg_hito_persona_eventos() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO crm.hito_eventos (hito_id, persona_id, empleado_id, accion)
    VALUES (NEW.hito_id, NEW.persona_id, COALESCE(auth.uid(), NEW.incluida_por), 'incluir');
  ELSIF TG_OP = 'DELETE' THEN
    -- Al borrar el hito entero no se registra nada (el CASCADE borra sus eventos).
    IF EXISTS (SELECT 1 FROM crm.hitos WHERE id = OLD.hito_id) THEN
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
CREATE TRIGGER hito_persona_eventos
  AFTER INSERT OR UPDATE OF estado OR DELETE ON crm.hito_persona
  FOR EACH ROW EXECUTE FUNCTION crm.tg_hito_persona_eventos();

ALTER TABLE crm.hito_eventos ENABLE ROW LEVEL SECURITY;
-- Mismo criterio que hito_persona; los escribe solo el trigger.
CREATE POLICY hito_eventos_select ON crm.hito_eventos FOR SELECT TO authenticated
  USING (crm.hito_visible(hito_id) AND (crm.is_admin() OR crm.conoce_persona(persona_id)));
GRANT SELECT ON crm.hito_eventos TO authenticated;
GRANT ALL ON crm.hito_eventos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE crm.hito_eventos_id_seq TO service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- Estadísticas personales. Un admin puede pedir las de otro empleado.
-- Devuelve un jsonb con series diarias, canales, totales y datos para logros.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION crm.stats_empleado(p_desde date, p_empleado uuid DEFAULT NULL) RETURNS jsonb
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
                 (SELECT count(*) FROM crm.hito_eventos e WHERE e.empleado_id = v_uid AND e.accion = 'contactar' AND e.created_at::date = g.dia) AS contactados,
                 (SELECT count(*) FROM crm.puntos p WHERE p.empleado_id = v_uid AND p.delta > 0 AND p.created_at::date = g.dia) AS clasificados,
                 (SELECT count(*) FROM crm.hito_eventos e WHERE e.empleado_id = v_uid AND e.accion = 'incluir' AND e.created_at::date = g.dia) AS incluidos
            FROM generate_series(p_desde, current_date, interval '1 day') AS g(dia)
        ) d), '[]'::jsonb),
    -- Días con actividad del último año, para rachas y heatmap.
    'dias_activos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('dia', x.dia, 'n', x.n) ORDER BY x.dia)
        FROM (
          SELECT dia, sum(n)::int AS n FROM (
            SELECT created_at::date AS dia, count(*) AS n FROM crm.hito_eventos
             WHERE empleado_id = v_uid AND accion IN ('contactar', 'incluir') AND created_at > now() - interval '1 year'
             GROUP BY 1
            UNION ALL
            SELECT created_at::date, count(*) FROM crm.puntos
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
           WHERE empleado_id = v_uid AND accion = 'contactar' GROUP BY created_at::date) m),
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
CREATE FUNCTION crm.stats_equipo(p_desde date) RETURNS jsonb
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
                 (SELECT count(*) FROM crm.hito_eventos h WHERE h.empleado_id = e.uid AND h.accion = 'contactar' AND h.created_at >= p_desde) AS contactados,
                 (SELECT count(*) FROM crm.puntos p WHERE p.empleado_id = e.uid AND p.delta > 0 AND p.created_at >= p_desde) AS clasificados,
                 (SELECT count(*) FROM crm.hito_eventos h WHERE h.empleado_id = e.uid AND h.accion = 'incluir' AND h.created_at >= p_desde) AS incluidos,
                 (SELECT count(*) FROM crm.hito_eventos h WHERE h.empleado_id = e.uid AND h.accion = 'contactar' AND h.created_at >= p_desde)
                 + (SELECT COALESCE(sum(p.delta), 0) FROM crm.puntos p WHERE p.empleado_id = e.uid AND p.created_at >= p_desde) AS xp
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
                     AND h.created_at >= g.semana AND h.created_at < g.semana + interval '7 days') AS contactados,
                 (SELECT count(*) FROM crm.puntos p WHERE p.delta > 0
                     AND p.created_at >= g.semana AND p.created_at < g.semana + interval '7 days') AS clasificados
            FROM generate_series(date_trunc('week', p_desde::timestamptz), date_trunc('week', now()), interval '7 days') AS g(semana)
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
CREATE FUNCTION crm.mi_posicion(p_desde date) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  RETURN (
    WITH xp AS (
      SELECT e.uid,
             (SELECT count(*) FROM crm.hito_eventos h WHERE h.empleado_id = e.uid AND h.accion = 'contactar' AND h.created_at >= p_desde)
             + (SELECT COALESCE(sum(p.delta), 0) FROM crm.puntos p WHERE p.empleado_id = e.uid AND p.created_at >= p_desde) AS xp
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
CREATE FUNCTION crm.stats_bolsa() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = crm, public, auth AS $$
BEGIN
  IF NOT crm.puede_bolsa() THEN RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'adopciones', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('semana', s.semana, 'n', s.n) ORDER BY s.semana)
        FROM (
          SELECT g.semana::date AS semana,
                 (SELECT count(*) FROM crm.relaciones r WHERE r.origen = 'bolsa'
                     AND r.updated_at >= g.semana AND r.updated_at < g.semana + interval '7 days') AS n
            FROM generate_series(date_trunc('week', now() - interval '11 weeks'), date_trunc('week', now()), interval '7 days') AS g(semana)
        ) s), '[]'::jsonb),
    'adoptados_mes', (SELECT count(*) FROM crm.relaciones WHERE origen = 'bolsa' AND updated_at >= date_trunc('month', now())),
    'mis_rescates', (SELECT count(*) FROM crm.relaciones WHERE origen = 'bolsa' AND empleado_id = auth.uid())
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Resumen por hito visible: totales y primeros nombres (respeta RLS de personas
-- porque solo cuenta las filas de hito_persona que ve el empleado).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION crm.hitos_resumen() RETURNS TABLE (
  hito_id uuid,
  total bigint,
  contactados bigint,
  nombres text[]
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = crm, public AS $$
  SELECT hp.hito_id,
         count(*),
         count(*) FILTER (WHERE hp.estado = 'contactado'),
         (array_agg(p.nombre ORDER BY hp.estado DESC, hp.created_at DESC))[1:6]
    FROM crm.hito_persona hp
    JOIN crm.personas p ON p.id = hp.persona_id
   GROUP BY hp.hito_id;
$$;

REVOKE ALL ON FUNCTION crm.stats_empleado(date, uuid), crm.stats_equipo(date), crm.mi_posicion(date),
  crm.stats_bolsa(), crm.hitos_resumen(), crm.tg_hito_persona_eventos() FROM public, anon;
GRANT EXECUTE ON FUNCTION crm.stats_empleado(date, uuid), crm.stats_equipo(date), crm.mi_posicion(date),
  crm.stats_bolsa(), crm.hitos_resumen() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
