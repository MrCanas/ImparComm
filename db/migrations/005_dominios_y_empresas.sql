-- Ajustes tras la primera captura real de calendario:
-- 1) Nombre de empresa a partir del dominio registrable (sin «mail.», «email.»…,
--    y con sufijos de dos niveles como .co.uk o .com.es).
-- 2) Purga de contactos de dominios internos (sociedades del grupo) capturados
--    antes de declararlos internos.
-- 3) Dominios de las sociedades del grupo Impar detectados en la prueba.

CREATE FUNCTION crm.nombre_empresa_de_dominio(p_dominio text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  partes text[] := string_to_array(lower(p_dominio), '.');
  n integer;
  etiqueta text;
BEGIN
  -- Quita subdominios de envío habituales.
  WHILE array_length(partes, 1) > 2
        AND partes[1] IN ('mail', 'email', 'e', 'em', 'news', 'info', 'correo', 'mailer', 'm', 'www') LOOP
    partes := partes[2:];
  END LOOP;
  n := array_length(partes, 1);
  IF n >= 3 AND (partes[n - 1] || '.' || partes[n]) IN
     ('co.uk', 'org.uk', 'com.es', 'com.mx', 'com.ar', 'com.br', 'co.jp', 'com.au', 'com.co', 'com.pe') THEN
    etiqueta := partes[n - 2];
  ELSIF n >= 2 THEN
    etiqueta := partes[n - 1];
  ELSE
    etiqueta := partes[1];
  END IF;
  -- Siglas cortas en mayúsculas (CA-CIB, FTI…); el resto con mayúscula inicial.
  IF length(replace(etiqueta, '-', '')) <= 5 THEN
    RETURN upper(etiqueta);
  END IF;
  RETURN initcap(replace(etiqueta, '-', ' '));
END;
$$;

-- registrar_reunion con el nuevo nombre de empresa (resto idéntico a 003).
CREATE OR REPLACE FUNCTION crm.registrar_reunion(
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
  v_nombre_empresa text;
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
        v_nombre_empresa := crm.nombre_empresa_de_dominio(v_dominio);
        INSERT INTO crm.empresas (nombre, dominio)
        VALUES (v_nombre_empresa, v_dominio)
        ON CONFLICT DO NOTHING
        RETURNING id INTO v_empresa;
        IF v_empresa IS NULL THEN
          SELECT id INTO v_empresa FROM crm.empresas
           WHERE dominio = v_dominio OR lower(nombre) = lower(v_nombre_empresa)
           LIMIT 1;
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

-- Borra lo capturado del calendario para personas de dominios internos que aún
-- no han pasado a Zoho (las altas manuales y lo ya enviado a Zoho se respetan).
CREATE FUNCTION crm.purgar_dominios_internos() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = crm, public AS $$
DECLARE v_personas integer;
BEGIN
  -- Desde la app solo un admin; desde el servidor (service_role) o una migración, sin JWT, siempre.
  IF auth.role() = 'authenticated' AND NOT crm.is_admin() THEN
    RAISE EXCEPTION 'No autorizado' USING ERRCODE = '42501';
  END IF;

  DELETE FROM crm.relaciones r
   USING crm.personas p
   WHERE p.id = r.persona_id
     AND r.origen = 'calendario'
     AND p.zoho_id IS NULL
     AND split_part(p.email, '@', 2) = ANY (crm.dominios_internos());

  DELETE FROM crm.personas p
   WHERE p.zoho_id IS NULL
     AND split_part(p.email, '@', 2) = ANY (crm.dominios_internos())
     AND NOT EXISTS (SELECT 1 FROM crm.relaciones r WHERE r.persona_id = p.id);
  GET DIAGNOSTICS v_personas = ROW_COUNT;

  DELETE FROM crm.empresas e
   WHERE e.dominio = ANY (crm.dominios_internos())
     AND NOT EXISTS (SELECT 1 FROM crm.personas p WHERE p.empresa_id = e.id);

  DELETE FROM crm.reuniones re
   WHERE NOT EXISTS (SELECT 1 FROM crm.asistentes a WHERE a.reunion_id = re.id);

  RETURN v_personas;
END;
$$;

REVOKE ALL ON FUNCTION crm.purgar_dominios_internos() FROM public, anon;
GRANT EXECUTE ON FUNCTION crm.purgar_dominios_internos() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION crm.nombre_empresa_de_dominio(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION crm.registrar_reunion(uuid, text, timestamptz, text, jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION crm.registrar_reunion(uuid, text, timestamptz, text, jsonb) TO service_role;

-- Sociedades del grupo detectadas en la primera captura.
UPDATE crm.config
   SET valor = (SELECT to_jsonb(array_agg(DISTINCT d ORDER BY d)) FROM (
                  SELECT jsonb_array_elements_text(valor) d
                  UNION SELECT unnest(ARRAY['imparcapital.com', 'imparproperties.com', 'impargrupo.com', 'impargrupo.es'])
                ) t),
       updated_at = now()
 WHERE clave = 'dominios_internos';

-- Renombra las empresas creadas automáticamente con el criterio anterior.
DO $$
DECLARE e record;
BEGIN
  FOR e IN SELECT id, dominio FROM crm.empresas
            WHERE dominio IS NOT NULL AND nombre = initcap(split_part(dominio, '.', 1)) LOOP
    BEGIN
      UPDATE crm.empresas SET nombre = crm.nombre_empresa_de_dominio(e.dominio) WHERE id = e.id;
    EXCEPTION WHEN unique_violation THEN
      NULL; -- ya existe otra con ese nombre: se deja como está
    END;
  END LOOP;
END;
$$;

SELECT crm.purgar_dominios_internos();

NOTIFY pgrst, 'reload schema';
