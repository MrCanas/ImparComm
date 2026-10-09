# ImparComm como app personal de Teams

La misma web se publica como pestaña personal de Teams (icono en la barra lateral), sin construir otra app.

## Empaquetar e instalar

1. Si la URL de producción cambia (dominio propio), actualiza `contentUrl`, `websiteUrl` y `validDomains` en `manifest.json` y sube `version`.
2. Crea el paquete (los tres ficheros en la raíz del zip):

   ```powershell
   Compress-Archive -Path teams\manifest.json, teams\color.png, teams\outline.png -DestinationPath imparcomm-teams.zip -Force
   ```

3. El administrador de Microsoft 365 lo sube en **Teams admin center → Teams apps → Manage apps → Upload new app** y, con una directiva de configuración de aplicaciones, lo ancla para todos.

## Requisitos ya resueltos en la app

- `Content-Security-Policy: frame-ancestors` permite a Teams incrustar la web (`next.config.ts`).
- La cookie de sesión es `SameSite=None; Secure; Partitioned` en producción para funcionar dentro del iframe de Teams (`src/lib/auth/jwt.ts`).
- El inicio de sesión dentro de Teams usa el mismo formulario; con el SSO de Entra (fase futura) se hará con el SDK de Teams.

## Pendiente

- **Mensaje del viernes en Teams:** necesita un bot (Azure Bot Service + manifest `bots`). Mientras tanto el aviso va por el email semanal.
