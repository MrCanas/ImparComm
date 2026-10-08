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

## Fases

1. ✅ Preparación: repo, Vercel, esquema `crm` con RLS.
2. ✅ Mis contactos, alta manual, ficha, archivar/recuperar · ⏳ lectura de calendarios (Graph, pendiente de Entra).
3. ✅ Ritual con tarjetas, deshacer, puntos y bonos · ⏳ email del viernes y Teams.
4. ✅ Hitos generales/personales, candidatos por etiquetas, Pte → Contactado · ⏳ alta en Zoho y Campaigns.
5. ✅ Panel de administrador, bolsa común, fusión de etiquetas, plazos · ⏳ firmas y tarjeta «Evento».
6. ⏳ Envíos masivos desde comunicaciones de icam web dashboard.
