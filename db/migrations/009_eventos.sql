-- Módulo Eventos: invitaciones con RSVP, plantillas de marca, envíos manuales
-- controlados (pausa/reanudación, sin duplicados) y lista de asistentes.
--
-- Principios: nada sale solo (no hay crons); cada destinatario de cada envío
-- tiene su estado y se reserva de forma atómica; un envío cortado a mitad deja
-- el destinatario en «incierto» y pausa el envío (nunca se reenvía solo).

-- ─────────────────────────────────────────────────────────────────────────────
-- Ajustes globales (fila única): marca, límites y modo prueba
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE crm.eventos_ajustes (
  id            integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  marca         jsonb   NOT NULL DEFAULT '{}'::jsonb,
  -- Con modo_prueba solo se admiten destinatarios @yopmail.com (además de la
  -- variable EVENTOS_SOLO_PRUEBA, que el servidor comprueba aparte).
  modo_prueba   boolean NOT NULL DEFAULT true,
  delay_min_ms  integer NOT NULL DEFAULT 3000 CHECK (delay_min_ms >= 1000),
  tope_diario   integer NOT NULL DEFAULT 700  CHECK (tope_diario > 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  updated_by    uuid REFERENCES auth.users (id) ON DELETE SET NULL
);
INSERT INTO crm.eventos_ajustes (id) VALUES (1);

-- ─────────────────────────────────────────────────────────────────────────────
-- Eventos
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE crm.eventos (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre              text NOT NULL,
  slug                text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9-]+$'),
  inicio              timestamptz NOT NULL,
  fin                 timestamptz NOT NULL,
  zona                text NOT NULL DEFAULT 'Europe/Madrid',
  lugar               text,
  direccion           text,
  mapa_url            text,
  fecha_limite        timestamptz,
  aforo               integer CHECK (aforo IS NULL OR aforo > 0),
  permite_acompanante boolean NOT NULL DEFAULT true,
  -- Textos de la landing (título, introducción, texto tras responder…)
  landing             jsonb NOT NULL DEFAULT '{}'::jsonb,
  remitente           text,
  remitente_nombre    text NOT NULL DEFAULT 'Impar Capital',
  reply_to            text,
  -- Invitación de calendario: UID estable por evento + SEQUENCE que sube al
  -- cambiar fecha/lugar para que los calendarios se actualicen, no se dupliquen.
  ics_uid             text NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  ics_sequence        integer NOT NULL DEFAULT 0,
  estado              text NOT NULL DEFAULT 'borrador'
                        CHECK (estado IN ('borrador', 'activo', 'cerrado')),
  creado_por          uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT eventos_fechas_ck CHECK (fin > inicio)
);
CREATE TRIGGER eventos_touch BEFORE UPDATE ON crm.eventos
  FOR EACH ROW EXECUTE FUNCTION crm.tg_touch_updated_at();

CREATE FUNCTION crm.tg_eventos_sequence() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.inicio IS DISTINCT FROM OLD.inicio OR NEW.fin IS DISTINCT FROM OLD.fin
     OR NEW.lugar IS DISTINCT FROM OLD.lugar OR NEW.direccion IS DISTINCT FROM OLD.direccion
     OR NEW.nombre IS DISTINCT FROM OLD.nombre THEN
    NEW.ics_sequence := OLD.ics_sequence + 1;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER eventos_sequence BEFORE UPDATE ON crm.eventos
  FOR EACH ROW EXECUTE FUNCTION crm.tg_eventos_sequence();

-- ─────────────────────────────────────────────────────────────────────────────
-- Invitados
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE crm.evento_invitados (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id          uuid NOT NULL REFERENCES crm.eventos (id) ON DELETE CASCADE,
  persona_id         uuid REFERENCES crm.personas (id) ON DELETE SET NULL,
  email              text NOT NULL CHECK (email = lower(email) AND position('@' IN email) > 1),
  nombre             text,
  empresa            text,
  cargo              text,
  telefono           text,
  responsable_id     uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  etiquetas          text[] NOT NULL DEFAULT '{}',
  origen             text,
  -- sha256 (hex) del token del enlace personal. El token no se guarda: se
  -- deriva con HMAC(EVENTOS_TOKEN_SECRET, id) al generar cada correo.
  token_hash         text NOT NULL UNIQUE,
  respuesta          text CHECK (respuesta IN ('si', 'no', 'quizas')),
  acompanante        boolean NOT NULL DEFAULT false,
  acompanante_nombre text,
  telefono_rsvp      text,
  comentario         text,
  respondido_en      timestamptz,
  primera_visita     timestamptz,
  ultima_visita      timestamptz,
  n_visitas          integer NOT NULL DEFAULT 0,
  ics_descargado_en  timestamptz,
  rebotado_en        timestamptz,
  rebote_motivo      text,
  excluido           boolean NOT NULL DEFAULT false,
  excluido_motivo    text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (evento_id, email),
  CONSTRAINT invitados_acompanante_ck CHECK (acompanante OR acompanante_nombre IS NULL)
);
CREATE INDEX evento_invitados_evento_idx ON crm.evento_invitados (evento_id, respuesta);
CREATE INDEX evento_invitados_persona_idx ON crm.evento_invitados (persona_id);
CREATE INDEX evento_invitados_responsable_idx ON crm.evento_invitados (responsable_id);
CREATE TRIGGER evento_invitados_touch BEFORE UPDATE ON crm.evento_invitados
  FOR EACH ROW EXECUTE FUNCTION crm.tg_touch_updated_at();

-- Historial de respuestas (cada envío del formulario de la landing)
CREATE TABLE crm.evento_respuestas (
  id                 bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  invitado_id        uuid NOT NULL REFERENCES crm.evento_invitados (id) ON DELETE CASCADE,
  respuesta          text NOT NULL CHECK (respuesta IN ('si', 'no', 'quizas')),
  acompanante        boolean NOT NULL DEFAULT false,
  acompanante_nombre text,
  telefono           text,
  comentario         text,
  origen             text NOT NULL DEFAULT 'landing' CHECK (origen IN ('landing', 'manual', 'buzon')),
  registrado_por     uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evento_respuestas_invitado_idx ON crm.evento_respuestas (invitado_id, created_at);

-- Bajas globales: excluidas de cualquier envío de cualquier evento
CREATE TABLE crm.bajas (
  email      text PRIMARY KEY CHECK (email = lower(email)),
  origen     text NOT NULL DEFAULT 'landing' CHECK (origen IN ('landing', 'manual', 'buzon')),
  evento_id  uuid REFERENCES crm.eventos (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Plantillas con versiones
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE crm.plantillas (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id       uuid REFERENCES crm.eventos (id) ON DELETE CASCADE,
  tipo            text NOT NULL
                    CHECK (tipo IN ('invitacion', 'recordatorio', 'confirmacion', 'info_final', 'libre')),
  nombre          text NOT NULL,
  asunto          text NOT NULL,
  preheader       text,
  modo            text NOT NULL DEFAULT 'bloques' CHECK (modo IN ('bloques', 'html')),
  bloques         jsonb NOT NULL DEFAULT '[]'::jsonb,
  html            text,
  adjuntar_ics    boolean NOT NULL DEFAULT false,
  version         integer NOT NULL DEFAULT 1,
  actualizado_por uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT plantillas_html_ck CHECK (modo <> 'html' OR html IS NOT NULL)
);
CREATE INDEX plantillas_evento_idx ON crm.plantillas (evento_id);

CREATE TABLE crm.plantilla_versiones (
  plantilla_id uuid NOT NULL REFERENCES crm.plantillas (id) ON DELETE CASCADE,
  version      integer NOT NULL,
  contenido    jsonb NOT NULL,
  creado_por   uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (plantilla_id, version)
);

-- Cualquier cambio de contenido sube la versión y guarda una instantánea.
CREATE FUNCTION crm.tg_plantillas_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (NEW.asunto, NEW.preheader, NEW.modo, NEW.bloques, NEW.html, NEW.adjuntar_ics, NEW.nombre)
       IS NOT DISTINCT FROM
       (OLD.asunto, OLD.preheader, OLD.modo, OLD.bloques, OLD.html, OLD.adjuntar_ics, OLD.nombre) THEN
      RETURN NEW;
    END IF;
    NEW.version := OLD.version + 1;
    NEW.updated_at := now();
  END IF;
  NEW.actualizado_por := COALESCE(auth.uid(), NEW.actualizado_por);
  RETURN NEW;
END;
$$;
CREATE TRIGGER plantillas_version BEFORE INSERT OR UPDATE ON crm.plantillas
  FOR EACH ROW EXECUTE FUNCTION crm.tg_plantillas_version();

CREATE FUNCTION crm.tg_plantillas_snapshot() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
BEGIN
  INSERT INTO crm.plantilla_versiones (plantilla_id, version, contenido, creado_por)
  VALUES (NEW.id, NEW.version,
          jsonb_build_object('nombre', NEW.nombre, 'asunto', NEW.asunto, 'preheader', NEW.preheader,
                             'modo', NEW.modo, 'bloques', NEW.bloques, 'html', NEW.html,
                             'adjuntar_ics', NEW.adjuntar_ics),
          NEW.actualizado_por)
  ON CONFLICT (plantilla_id, version) DO NOTHING;
  RETURN NULL;
END;
$$;
CREATE TRIGGER plantillas_snapshot AFTER INSERT OR UPDATE ON crm.plantillas
  FOR EACH ROW EXECUTE FUNCTION crm.tg_plantillas_snapshot();

-- ─────────────────────────────────────────────────────────────────────────────
-- Envíos y destinatarios
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE crm.envios (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id        uuid NOT NULL REFERENCES crm.eventos (id) ON DELETE CASCADE,
  nombre           text NOT NULL,
  plantilla_id     uuid NOT NULL REFERENCES crm.plantillas (id) ON DELETE RESTRICT,
  filtro           jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado           text NOT NULL DEFAULT 'borrador'
                     CHECK (estado IN ('borrador', 'en_curso', 'pausado', 'completado', 'cancelado')),
  delay_ms         integer NOT NULL DEFAULT 5000 CHECK (delay_ms >= 1000),
  motivo_pausa     text,
  -- Candado: solo una sesión (pestaña) puede enviar a la vez; caduca si deja de latir.
  candado_sesion   text,
  candado_hasta    timestamptz,
  ultimo_envio_en  timestamptz,
  creado_por       uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  iniciado_por     uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  iniciado_en      timestamptz,
  completado_en    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX envios_evento_idx ON crm.envios (evento_id);
CREATE TRIGGER envios_touch BEFORE UPDATE ON crm.envios
  FOR EACH ROW EXECUTE FUNCTION crm.tg_touch_updated_at();

CREATE TABLE crm.envio_destinatarios (
  envio_id          uuid NOT NULL REFERENCES crm.envios (id) ON DELETE CASCADE,
  invitado_id       uuid NOT NULL REFERENCES crm.evento_invitados (id) ON DELETE CASCADE,
  orden             integer NOT NULL,
  estado            text NOT NULL DEFAULT 'pendiente'
                      CHECK (estado IN ('pendiente', 'enviando', 'enviado', 'error', 'incierto', 'omitido')),
  intentos          integer NOT NULL DEFAULT 0,
  plantilla_version integer,
  reservado_en      timestamptz,
  enviado_en        timestamptz,
  error             text,
  PRIMARY KEY (envio_id, invitado_id)
);
CREATE INDEX envio_destinatarios_cola_idx ON crm.envio_destinatarios (envio_id, estado, orden);
CREATE INDEX envio_destinatarios_invitado_idx ON crm.envio_destinatarios (invitado_id);
CREATE INDEX envio_destinatarios_dia_idx ON crm.envio_destinatarios (enviado_en) WHERE estado = 'enviado';

-- ─────────────────────────────────────────────────────────────────────────────
-- Buzón (revisión manual de lo que llega a noreply@) y auditoría
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE crm.evento_buzon (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  graph_message_id text NOT NULL UNIQUE,
  evento_id        uuid REFERENCES crm.eventos (id) ON DELETE CASCADE,
  invitado_id      uuid REFERENCES crm.evento_invitados (id) ON DELETE SET NULL,
  recibido_en      timestamptz NOT NULL,
  remitente        text,
  asunto           text,
  extracto         text,
  tipo_propuesto   text NOT NULL CHECK (tipo_propuesto IN ('rebote', 'respuesta', 'calendario', 'baja', 'otro')),
  propuesta        jsonb NOT NULL DEFAULT '{}'::jsonb,
  estado           text NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aplicado', 'descartado')),
  resuelto_por     uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  resuelto_en      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evento_buzon_estado_idx ON crm.evento_buzon (estado, recibido_en);

CREATE TABLE crm.evento_auditoria (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  evento_id  uuid REFERENCES crm.eventos (id) ON DELETE CASCADE,
  envio_id   uuid REFERENCES crm.envios (id) ON DELETE SET NULL,
  actor      uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  accion     text NOT NULL,
  detalle    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX evento_auditoria_evento_idx ON crm.evento_auditoria (evento_id, created_at DESC);

CREATE FUNCTION crm.auditar(p_evento uuid, p_envio uuid, p_accion text, p_detalle jsonb DEFAULT '{}'::jsonb)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  INSERT INTO crm.evento_auditoria (evento_id, envio_id, actor, accion, detalle)
  VALUES (p_evento, p_envio, auth.uid(), p_accion, COALESCE(p_detalle, '{}'::jsonb));
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Motor de envío (solo administradores)
-- ─────────────────────────────────────────────────────────────────────────────

-- Fija (o recalcula al reanudar) los destinatarios de un envío. Solo en
-- borrador o pausado. Conserva los ya tratados; los pendientes que salen del
-- segmento se borran y los nuevos entran al final de la cola.
CREATE FUNCTION crm.envio_fijar_destinatarios(p_envio uuid, p_invitados uuid[])
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE
  v_estado text;
  v_evento uuid;
  v_max    integer;
  v_borrados integer;
  v_nuevos integer;
BEGIN
  IF NOT crm.is_admin() THEN RAISE EXCEPTION 'Solo administradores'; END IF;
  SELECT estado, evento_id INTO v_estado, v_evento FROM crm.envios WHERE id = p_envio FOR UPDATE;
  IF v_estado IS NULL THEN RAISE EXCEPTION 'Envío no encontrado'; END IF;
  IF v_estado NOT IN ('borrador', 'pausado') THEN
    RAISE EXCEPTION 'Solo se pueden cambiar los destinatarios con el envío en borrador o pausado';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_invitados) x(id)
              WHERE NOT EXISTS (SELECT 1 FROM crm.evento_invitados i WHERE i.id = x.id AND i.evento_id = v_evento)) THEN
    RAISE EXCEPTION 'Hay invitados que no pertenecen al evento';
  END IF;

  DELETE FROM crm.envio_destinatarios
   WHERE envio_id = p_envio AND estado = 'pendiente' AND NOT (invitado_id = ANY (p_invitados));
  GET DIAGNOSTICS v_borrados = ROW_COUNT;

  SELECT COALESCE(max(orden), 0) INTO v_max FROM crm.envio_destinatarios WHERE envio_id = p_envio;
  INSERT INTO crm.envio_destinatarios (envio_id, invitado_id, orden)
  SELECT p_envio, x.id, v_max + x.n
    FROM unnest(p_invitados) WITH ORDINALITY AS x(id, n)
  ON CONFLICT (envio_id, invitado_id) DO NOTHING;
  GET DIAGNOSTICS v_nuevos = ROW_COUNT;

  PERFORM crm.auditar(v_evento, p_envio, 'destinatarios_fijados',
    jsonb_build_object('total_segmento', cardinality(p_invitados), 'nuevos', v_nuevos, 'retirados', v_borrados));
  RETURN jsonb_build_object('nuevos', v_nuevos, 'retirados', v_borrados);
END;
$$;

-- Cambia el estado del envío (iniciar / pausar / reanudar / cancelar).
CREATE FUNCTION crm.envio_cambiar_estado(p_envio uuid, p_estado text, p_motivo text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE
  v_actual text;
  v_evento uuid;
BEGIN
  IF NOT crm.is_admin() THEN RAISE EXCEPTION 'Solo administradores'; END IF;
  SELECT estado, evento_id INTO v_actual, v_evento FROM crm.envios WHERE id = p_envio FOR UPDATE;
  IF v_actual IS NULL THEN RAISE EXCEPTION 'Envío no encontrado'; END IF;
  IF NOT (
       (v_actual IN ('borrador', 'pausado') AND p_estado = 'en_curso')
    OR (v_actual = 'en_curso' AND p_estado = 'pausado')
    OR (v_actual IN ('borrador', 'pausado', 'en_curso') AND p_estado = 'cancelado')
  ) THEN
    RAISE EXCEPTION 'Transición no permitida: % → %', v_actual, p_estado;
  END IF;
  IF p_estado = 'en_curso' AND EXISTS (
       SELECT 1 FROM crm.envio_destinatarios WHERE envio_id = p_envio AND estado IN ('enviando', 'incierto')) THEN
    RAISE EXCEPTION 'Hay destinatarios en estado incierto: revísalos antes de reanudar';
  END IF;
  UPDATE crm.envios
     SET estado = p_estado,
         motivo_pausa = CASE WHEN p_estado = 'pausado' THEN p_motivo ELSE NULL END,
         iniciado_por = CASE WHEN p_estado = 'en_curso' AND iniciado_por IS NULL THEN auth.uid() ELSE iniciado_por END,
         iniciado_en  = CASE WHEN p_estado = 'en_curso' AND iniciado_en IS NULL THEN now() ELSE iniciado_en END,
         candado_sesion = CASE WHEN p_estado = 'en_curso' THEN candado_sesion ELSE NULL END,
         candado_hasta  = CASE WHEN p_estado = 'en_curso' THEN candado_hasta ELSE NULL END
   WHERE id = p_envio;
  PERFORM crm.auditar(v_evento, p_envio, 'estado_' || p_estado, jsonb_build_object('desde', v_actual, 'motivo', p_motivo));
END;
$$;

-- Reserva el siguiente destinatario. Devuelve un jsonb con `status`:
--   ok          → enviar a `invitado_id` y llamar a envio_resultado
--   espera      → aún no toca (delay); reintentar tras `espera_ms`
--   candado     → otra sesión tiene el envío
--   no_activo   → el envío no está en curso (pausado, cancelado…)
--   tope        → alcanzado el tope diario global; el envío se pausa
--   incierto    → la reserva anterior no se cerró; el envío se pausa
--   completado  → no quedan pendientes
CREATE FUNCTION crm.envio_reservar_siguiente(p_envio uuid, p_sesion text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE
  e        crm.envios%ROWTYPE;
  aj       crm.eventos_ajustes%ROWTYPE;
  v_delay  integer;
  v_falta  integer;
  v_hoy    integer;
  d        record;
  v_motivo text;
BEGIN
  IF NOT crm.is_admin() THEN RAISE EXCEPTION 'Solo administradores'; END IF;
  IF p_sesion IS NULL OR length(p_sesion) < 16 THEN RAISE EXCEPTION 'Sesión inválida'; END IF;

  SELECT * INTO e FROM crm.envios WHERE id = p_envio FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Envío no encontrado'; END IF;
  IF e.estado <> 'en_curso' THEN
    RETURN jsonb_build_object('status', 'no_activo', 'estado', e.estado, 'motivo', e.motivo_pausa);
  END IF;

  -- Candado: libre, propio o caducado → se toma/renueva 30 s.
  IF e.candado_sesion IS NOT NULL AND e.candado_sesion <> p_sesion AND e.candado_hasta > now() THEN
    RETURN jsonb_build_object('status', 'candado');
  END IF;
  UPDATE crm.envios SET candado_sesion = p_sesion, candado_hasta = now() + interval '30 seconds'
   WHERE id = p_envio;

  -- Una reserva anterior sin cerrar: si es reciente, esperar; si no, incierto + pausa.
  SELECT * INTO d FROM crm.envio_destinatarios
   WHERE envio_id = p_envio AND estado = 'enviando' LIMIT 1;
  IF FOUND THEN
    IF d.reservado_en > now() - interval '90 seconds' THEN
      RETURN jsonb_build_object('status', 'espera', 'espera_ms', 2000);
    END IF;
    UPDATE crm.envio_destinatarios SET estado = 'incierto', error = 'La reserva no se cerró (corte durante el envío)'
     WHERE envio_id = p_envio AND estado = 'enviando';
    UPDATE crm.envios SET estado = 'pausado', motivo_pausa = 'Destinatario en estado incierto: revisar antes de reanudar',
           candado_sesion = NULL, candado_hasta = NULL
     WHERE id = p_envio;
    PERFORM crm.auditar(e.evento_id, p_envio, 'pausa_automatica', jsonb_build_object('motivo', 'incierto'));
    RETURN jsonb_build_object('status', 'incierto');
  END IF;

  SELECT * INTO aj FROM crm.eventos_ajustes WHERE id = 1;
  v_delay := greatest(e.delay_ms, aj.delay_min_ms);
  IF e.ultimo_envio_en IS NOT NULL THEN
    v_falta := v_delay - (extract(epoch FROM (now() - e.ultimo_envio_en)) * 1000)::integer;
    IF v_falta > 0 THEN
      RETURN jsonb_build_object('status', 'espera', 'espera_ms', v_falta);
    END IF;
  END IF;

  -- Tope diario global (día de Madrid), contando todos los envíos.
  SELECT count(*) INTO v_hoy FROM crm.envio_destinatarios
   WHERE estado IN ('enviado', 'enviando', 'incierto')
     AND crm.dia_madrid(COALESCE(enviado_en, reservado_en)) = crm.hoy();
  IF v_hoy >= aj.tope_diario THEN
    UPDATE crm.envios SET estado = 'pausado', motivo_pausa = format('Tope diario alcanzado (%s)', aj.tope_diario),
           candado_sesion = NULL, candado_hasta = NULL
     WHERE id = p_envio;
    PERFORM crm.auditar(e.evento_id, p_envio, 'pausa_automatica', jsonb_build_object('motivo', 'tope', 'tope', aj.tope_diario));
    RETURN jsonb_build_object('status', 'tope', 'tope', aj.tope_diario);
  END IF;

  -- Siguiente pendiente; los que ya no deben recibirlo se marcan como omitidos.
  LOOP
    SELECT ed.invitado_id, i.email, i.excluido, i.rebotado_en,
           EXISTS (SELECT 1 FROM crm.bajas b WHERE b.email = i.email) AS de_baja
      INTO d
      FROM crm.envio_destinatarios ed
      JOIN crm.evento_invitados i ON i.id = ed.invitado_id
     WHERE ed.envio_id = p_envio AND ed.estado = 'pendiente'
     ORDER BY ed.orden
     LIMIT 1
     FOR UPDATE OF ed SKIP LOCKED;

    IF NOT FOUND THEN
      UPDATE crm.envios SET estado = 'completado', completado_en = now(),
             candado_sesion = NULL, candado_hasta = NULL
       WHERE id = p_envio;
      PERFORM crm.auditar(e.evento_id, p_envio, 'completado', '{}'::jsonb);
      RETURN jsonb_build_object('status', 'completado');
    END IF;

    v_motivo := CASE WHEN d.de_baja THEN 'Baja'
                     WHEN d.excluido THEN 'Excluido'
                     WHEN d.rebotado_en IS NOT NULL THEN 'Rebotado'
                END;
    IF v_motivo IS NULL THEN EXIT; END IF;
    UPDATE crm.envio_destinatarios SET estado = 'omitido', error = v_motivo
     WHERE envio_id = p_envio AND invitado_id = d.invitado_id;
  END LOOP;

  UPDATE crm.envio_destinatarios
     SET estado = 'enviando', reservado_en = now(), intentos = intentos + 1
   WHERE envio_id = p_envio AND invitado_id = d.invitado_id;
  UPDATE crm.envios SET ultimo_envio_en = now() WHERE id = p_envio;

  RETURN jsonb_build_object('status', 'ok', 'invitado_id', d.invitado_id, 'modo_prueba', aj.modo_prueba);
END;
$$;

-- Cierra la reserva con el resultado. p_resultado: enviado | error | incierto.
-- p_pausar: además pausa el envío (p. ej. Microsoft devolvió 429).
CREATE FUNCTION crm.envio_resultado(
  p_envio uuid, p_invitado uuid, p_sesion text, p_resultado text,
  p_version integer DEFAULT NULL, p_error text DEFAULT NULL, p_pausar text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE
  v_evento uuid;
BEGIN
  IF NOT crm.is_admin() THEN RAISE EXCEPTION 'Solo administradores'; END IF;
  IF p_resultado NOT IN ('enviado', 'error', 'incierto') THEN RAISE EXCEPTION 'Resultado no válido'; END IF;

  UPDATE crm.envio_destinatarios
     SET estado = p_resultado,
         plantilla_version = p_version,
         enviado_en = CASE WHEN p_resultado = 'enviado' THEN now() ELSE enviado_en END,
         error = left(p_error, 1000)
   WHERE envio_id = p_envio AND invitado_id = p_invitado AND estado = 'enviando';
  IF NOT FOUND THEN RAISE EXCEPTION 'No hay una reserva abierta para ese destinatario'; END IF;

  SELECT evento_id INTO v_evento FROM crm.envios WHERE id = p_envio;
  IF p_pausar IS NOT NULL THEN
    UPDATE crm.envios SET estado = 'pausado', motivo_pausa = p_pausar, candado_sesion = NULL, candado_hasta = NULL
     WHERE id = p_envio AND estado = 'en_curso';
    PERFORM crm.auditar(v_evento, p_envio, 'pausa_automatica', jsonb_build_object('motivo', p_pausar));
  END IF;
END;
$$;

-- Resolver a mano un destinatario incierto/error tras revisarlo.
-- p_accion: 'marcar_enviado' | 'reintentar' (vuelve a pendiente) | 'omitir'
CREATE FUNCTION crm.envio_resolver_destinatario(p_envio uuid, p_invitado uuid, p_accion text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE
  v_evento uuid;
BEGIN
  IF NOT crm.is_admin() THEN RAISE EXCEPTION 'Solo administradores'; END IF;
  UPDATE crm.envio_destinatarios
     SET estado = CASE p_accion WHEN 'marcar_enviado' THEN 'enviado'
                                WHEN 'reintentar' THEN 'pendiente'
                                WHEN 'omitir' THEN 'omitido' END,
         enviado_en = CASE WHEN p_accion = 'marcar_enviado' THEN COALESCE(enviado_en, reservado_en) ELSE enviado_en END,
         error = CASE WHEN p_accion = 'omitir' THEN 'Omitido a mano' ELSE error END
   WHERE envio_id = p_envio AND invitado_id = p_invitado AND estado IN ('incierto', 'error')
     AND p_accion IN ('marcar_enviado', 'reintentar', 'omitir');
  IF NOT FOUND THEN RAISE EXCEPTION 'Destinatario no resoluble'; END IF;
  SELECT evento_id INTO v_evento FROM crm.envios WHERE id = p_envio;
  PERFORM crm.auditar(v_evento, p_envio, 'destinatario_' || p_accion, jsonb_build_object('invitado', p_invitado));
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Landing pública (solo service_role: la llama el servidor tras validar el token)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE FUNCTION crm.evento_registrar_visita(p_token_hash text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = crm, public AS $$
  UPDATE crm.evento_invitados
     SET n_visitas = n_visitas + 1,
         primera_visita = COALESCE(primera_visita, now()),
         ultima_visita = now()
   WHERE token_hash = p_token_hash;
$$;

CREATE FUNCTION crm.evento_responder(
  p_token_hash text, p_respuesta text, p_acompanante boolean,
  p_acompanante_nombre text, p_telefono text, p_comentario text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE
  i  crm.evento_invitados%ROWTYPE;
  ev crm.eventos%ROWTYPE;
  v_acomp boolean;
BEGIN
  SELECT * INTO i FROM crm.evento_invitados WHERE token_hash = p_token_hash FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'no_encontrado'); END IF;
  SELECT * INTO ev FROM crm.eventos WHERE id = i.evento_id;
  IF ev.estado = 'cerrado' OR (ev.fecha_limite IS NOT NULL AND now() > ev.fecha_limite) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cerrado');
  END IF;
  IF p_respuesta NOT IN ('si', 'no', 'quizas') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'respuesta');
  END IF;
  v_acomp := p_respuesta IN ('si', 'quizas') AND ev.permite_acompanante AND COALESCE(p_acompanante, false);

  UPDATE crm.evento_invitados
     SET respuesta = p_respuesta,
         acompanante = v_acomp,
         acompanante_nombre = CASE WHEN v_acomp THEN nullif(left(trim(p_acompanante_nombre), 120), '') END,
         telefono_rsvp = nullif(left(trim(p_telefono), 40), ''),
         comentario = nullif(left(trim(p_comentario), 1000), ''),
         respondido_en = now()
   WHERE id = i.id;

  INSERT INTO crm.evento_respuestas (invitado_id, respuesta, acompanante, acompanante_nombre, telefono, comentario)
  VALUES (i.id, p_respuesta, v_acomp,
          CASE WHEN v_acomp THEN nullif(left(trim(p_acompanante_nombre), 120), '') END,
          nullif(left(trim(p_telefono), 40), ''), nullif(left(trim(p_comentario), 1000), ''));
  RETURN jsonb_build_object('ok', true, 'respuesta', p_respuesta);
END;
$$;

CREATE FUNCTION crm.evento_baja(p_token_hash text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE
  i crm.evento_invitados%ROWTYPE;
BEGIN
  SELECT * INTO i FROM crm.evento_invitados WHERE token_hash = p_token_hash;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  INSERT INTO crm.bajas (email, origen, evento_id) VALUES (i.email, 'landing', i.evento_id)
  ON CONFLICT (email) DO NOTHING;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: todo el módulo es de administradores; cada empleado puede leer los
-- invitados de los que es responsable o a los que conoce.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE crm.eventos_ajustes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.eventos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.evento_invitados     ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.evento_respuestas    ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.bajas                ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.plantillas           ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.plantilla_versiones  ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.envios               ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.envio_destinatarios  ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.evento_buzon         ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm.evento_auditoria     ENABLE ROW LEVEL SECURITY;

CREATE POLICY eventos_ajustes_admin ON crm.eventos_ajustes FOR ALL TO authenticated
  USING (crm.is_admin()) WITH CHECK (crm.is_admin());
CREATE POLICY eventos_admin ON crm.eventos FOR ALL TO authenticated
  USING (crm.is_admin()) WITH CHECK (crm.is_admin());
CREATE POLICY eventos_lectura_empleado ON crm.eventos FOR SELECT TO authenticated
  USING (estado <> 'borrador');
CREATE POLICY evento_invitados_admin ON crm.evento_invitados FOR ALL TO authenticated
  USING (crm.is_admin()) WITH CHECK (crm.is_admin());
CREATE POLICY evento_invitados_empleado ON crm.evento_invitados FOR SELECT TO authenticated
  USING (responsable_id = auth.uid() OR (persona_id IS NOT NULL AND crm.conoce_persona(persona_id)));
CREATE POLICY evento_respuestas_admin ON crm.evento_respuestas FOR ALL TO authenticated
  USING (crm.is_admin()) WITH CHECK (crm.is_admin());
CREATE POLICY bajas_admin ON crm.bajas FOR ALL TO authenticated
  USING (crm.is_admin()) WITH CHECK (crm.is_admin());
CREATE POLICY plantillas_admin ON crm.plantillas FOR ALL TO authenticated
  USING (crm.is_admin()) WITH CHECK (crm.is_admin());
CREATE POLICY plantilla_versiones_admin ON crm.plantilla_versiones FOR SELECT TO authenticated
  USING (crm.is_admin());
CREATE POLICY envios_admin ON crm.envios FOR ALL TO authenticated
  USING (crm.is_admin()) WITH CHECK (crm.is_admin());
-- Los destinatarios solo cambian por las funciones del motor (SECURITY DEFINER).
CREATE POLICY envio_destinatarios_admin ON crm.envio_destinatarios FOR SELECT TO authenticated
  USING (crm.is_admin());
CREATE POLICY evento_buzon_admin ON crm.evento_buzon FOR ALL TO authenticated
  USING (crm.is_admin()) WITH CHECK (crm.is_admin());
CREATE POLICY evento_auditoria_admin ON crm.evento_auditoria FOR SELECT TO authenticated
  USING (crm.is_admin());

-- Partimos de cero en las tablas nuevas (sin depender de privilegios por defecto).
REVOKE ALL ON
  crm.eventos_ajustes, crm.eventos, crm.evento_invitados, crm.evento_respuestas, crm.bajas,
  crm.plantillas, crm.plantilla_versiones, crm.envios, crm.envio_destinatarios,
  crm.evento_buzon, crm.evento_auditoria
FROM public, anon, authenticated;

-- El estado de un envío solo cambia por crm.envio_cambiar_estado / el motor.
GRANT SELECT, INSERT, DELETE ON crm.envios TO authenticated;
GRANT UPDATE (nombre, plantilla_id, filtro, delay_ms) ON crm.envios TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  crm.eventos_ajustes, crm.eventos, crm.evento_invitados, crm.evento_respuestas, crm.bajas,
  crm.plantillas, crm.evento_buzon TO authenticated;
GRANT SELECT ON crm.plantilla_versiones, crm.envio_destinatarios, crm.evento_auditoria TO authenticated;
GRANT ALL ON
  crm.eventos_ajustes, crm.eventos, crm.evento_invitados, crm.evento_respuestas, crm.bajas,
  crm.plantillas, crm.plantilla_versiones, crm.envios, crm.envio_destinatarios,
  crm.evento_buzon, crm.evento_auditoria TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA crm TO authenticated, service_role;

-- Funciones: las de la landing solo para el servidor (service_role).
REVOKE ALL ON FUNCTION
  crm.auditar(uuid, uuid, text, jsonb),
  crm.envio_fijar_destinatarios(uuid, uuid[]),
  crm.envio_cambiar_estado(uuid, text, text),
  crm.envio_reservar_siguiente(uuid, text),
  crm.envio_resultado(uuid, uuid, text, text, integer, text, text),
  crm.envio_resolver_destinatario(uuid, uuid, text),
  crm.evento_registrar_visita(text),
  crm.evento_responder(text, text, boolean, text, text, text),
  crm.evento_baja(text),
  crm.tg_eventos_sequence(),
  crm.tg_plantillas_version(),
  crm.tg_plantillas_snapshot()
FROM public, anon;
GRANT EXECUTE ON FUNCTION
  crm.auditar(uuid, uuid, text, jsonb),
  crm.envio_fijar_destinatarios(uuid, uuid[]),
  crm.envio_cambiar_estado(uuid, text, text),
  crm.envio_reservar_siguiente(uuid, text),
  crm.envio_resultado(uuid, uuid, text, text, integer, text, text),
  crm.envio_resolver_destinatario(uuid, uuid, text)
TO authenticated, service_role;
REVOKE ALL ON FUNCTION
  crm.evento_registrar_visita(text),
  crm.evento_responder(text, text, boolean, text, text, text),
  crm.evento_baja(text)
FROM authenticated;
GRANT EXECUTE ON FUNCTION
  crm.evento_registrar_visita(text),
  crm.evento_responder(text, text, boolean, text, text, text),
  crm.evento_baja(text)
TO service_role;
