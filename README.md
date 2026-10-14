# ImparComm

CRM relacional por empleado de Impar Capital. Cada empleado ve las personas externas con las que se ha reunido, las clasifica en un ritual semanal y las invita a los hitos de Impar, para que ningún contacto quede olvidado.

- **Stack:** el mismo que icam web dashboard — Next.js 16 (App Router, `src/proxy.ts`), React 19, TypeScript, Tailwind v4 (`tailwind.config.js` con la paleta icam), Supabase (`@supabase/supabase-js`), `bcrypt` + `jose`.
- **Look & feel:** cabecera navy `icam-900` con acento dorado, Inter, tarjetas blancas sobre `#F5F5F5`. Mobile first: barra de pestañas inferior en móvil y navegación horizontal en escritorio.
- **Base de datos:** el mismo proyecto Supabase que icam, en el esquema propio `crm` (no toca `public`).
- **Login:** mismos usuarios y contraseñas que icam (tablas `app_user_password` / `app_user_account`, mismo `AUTH_JWT_SECRET`), con cookie propia `impar-comm-auth`.

## Puesta en marcha

```bash
npm ci --include=optional
cp .env.local.example .env.local   # y rellenar (mismos valores que icam)
npm run db:migrate                 # aplica db/migrations/*.sql en el esquema crm
npm run dev
```

Verificación de punta a punta de RLS y reglas de negocio contra el Supabase real (crea datos `@ejemplo.test` y los borra):

```bash
npm run db:verify -- <email_admin> <email_empleado_de_prueba>
```

En Supabase → Settings → API → **Exposed schemas**, añadir `crm` (cambio aditivo; no afecta a icam).

## Estructura

```
db/migrations/        SQL del esquema crm (tablas, RLS, triggers de puntos/recordatorios, RPCs)
scripts/migrate.ts    aplica migraciones y las registra en crm.schema_migrations
src/proxy.ts          protege rutas y renueva la sesión (Next 16: antes «middleware»)
src/lib/auth/         sesión (portado de icam) y bridge de token Supabase para RLS
src/lib/db/server.ts  getCrm(): cliente del esquema crm con la identidad del empleado (RLS)
src/modules/crm/      datos, Server Actions y componentes de UI
src/app/(app)/        Inicio, Contactos, Ritual, Hitos, Bolsa común, Administración
src/lib/graph, zoho   integraciones pendientes (stubs documentados)
```

## Permisos

- Cada empleado solo lee sus relaciones (RLS sobre `auth.uid()`).
- Administrador: superadmin de icam (`app_user_account.is_platform_admin`) o `crm.permisos.es_admin`.
- Bolsa común: `crm.permisos.ve_bolsa` o administrador. Un empleado está de baja si `app_user_account.is_active = false`.

## Integraciones

Todas vienen **apagadas** y se encienden poniendo su variable a `1` en Vercel. El estado real (permisos de Microsoft, credenciales de Zoho, suscripciones, último envío) se ve en **Administración → Integraciones**.

| Integración | Variable | Necesita |
| --- | --- | --- |
| Captura de reuniones (webhook + repaso nocturno 02:00 UTC) | `CALENDARIO_ENABLED` | Permiso de aplicación **Calendars.Read** con consentimiento del administrador · EIPD y política interna |
| Cargo y teléfono desde la firma | `FIRMAS_ENABLED` | Mail.Read (ya concedido) · EIPD |
| Email semanal, viernes 9:00 Madrid | `RESUMEN_SEMANAL_ENABLED` | Mail.Send (ya concedido) y `EMAIL_FROM` |
| Zoho CRM al marcar Contactado (contacto + Campaign del hito) | `ZOHO_SYNC_ENABLED` | Credenciales `ZOHO_*` con scopes de Contacts, Campaigns y Users · confirmar CRM Enterprise y el valor de `Member_Status` |

Crons (`vercel.json`): `/api/cron/calendario` cada noche y `/api/cron/resumen-semanal` los viernes a las 7:00 y 8:00 UTC (solo actúa la que cae a las 9:00 en Madrid). Webhook de Graph: `/api/graph/notificaciones`.

Teams: ver `teams/README.md` (pestaña personal; el bot del viernes queda pendiente).

## Fases

1. ✅ Preparación: repo, Vercel, esquema `crm` con RLS.
2. ✅ Mis contactos, alta manual, ficha, archivar/recuperar · ✅ captura de calendario (código listo; falta Calendars.Read y encenderla).
3. ✅ Ritual con tarjetas, deshacer, puntos y bonos · ✅ email del viernes y pestaña de Teams · ⏳ bot de Teams.
4. ✅ Hitos, candidatos por etiquetas, Pte → Contactado · ✅ alta en Zoho y Campaigns (código listo; falta encenderla).
5. ✅ Panel de administrador, bolsa común, fusión de etiquetas, plazos, firmas y tarjeta «Evento».
6. ⏳ Envíos masivos desde comunicaciones de icam web dashboard.

