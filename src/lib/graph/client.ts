/**
 * Cliente compartido de Microsoft Graph (flujo app-only / client credentials).
 *
 * Obtiene y cachea en memoria un token de aplicación (scope `.default`) válido para
 * todas las operaciones cuyos permisos estén concedidos al registro de Azure
 * (p. ej. Mail.Send para email, Sites.Read.All/Files.Read.All para SharePoint).
 *
 * Seguridad: el client_secret y el token solo viajan por HTTPS a Microsoft; nunca
 * se escriben en logs ni se incluyen en mensajes de error. SOLO servidor.
 */
const TOKEN_SCOPE = "https://graph.microsoft.com/.default";
export const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const TOKEN_SKEW_MS = 60_000; // renovar 60 s antes de expirar

interface GraphAppCredentials {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

const CREDENTIAL_VARS = [
  "MS_GRAPH_TENANT_ID",
  "MS_GRAPH_CLIENT_ID",
  "MS_GRAPH_CLIENT_SECRET",
] as const;

function getGraphAppCredentials(): GraphAppCredentials {
  const missing = CREDENTIAL_VARS.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno para Microsoft Graph: ${missing.join(", ")}. ` +
        "Defínelas en .env.local (no se deben hardcodear ni inventar).",
    );
  }
  return {
    tenantId: process.env.MS_GRAPH_TENANT_ID!.trim(),
    clientId: process.env.MS_GRAPH_CLIENT_ID!.trim(),
    clientSecret: process.env.MS_GRAPH_CLIENT_SECRET!.trim(),
  };
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/** Token de aplicación cacheado, compartido por email y SharePoint. */
export async function getGraphToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + TOKEN_SKEW_MS) {
    return cachedToken.token;
  }

  const cfg = getGraphAppCredentials();
  const url = `https://login.microsoftonline.com/${encodeURIComponent(
    cfg.tenantId,
  )}/oauth2/v2.0/token`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      scope: TOKEN_SCOPE,
      grant_type: "client_credentials",
    }),
  });

  if (!res.ok) {
    // No incluimos el cuerpo: podría reflejar el client_id/secret enviados.
    throw new Error(
      `No se pudo obtener el token de Microsoft 365 (HTTP ${res.status}). ` +
        "Revisa MS_GRAPH_TENANT_ID / MS_GRAPH_CLIENT_ID / MS_GRAPH_CLIENT_SECRET.",
    );
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error("Respuesta de token de Microsoft 365 sin access_token.");
  }

  cachedToken = {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

/** Llamada autenticada a Graph. `path` puede ser relativo a GRAPH_BASE o absoluto. */
export async function graphFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getGraphToken();
  const url = path.startsWith("http") ? path : `${GRAPH_BASE}${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {}),
    },
  });
}

/**
 * Permisos de aplicación concedidos (claim `roles` del token). Solo lee el
 * token propio: no accede a buzones ni calendarios.
 */
export async function getGraphRoles(): Promise<string[]> {
  const token = await getGraphToken();
  const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")) as {
    roles?: string[];
  };
  return (payload.roles ?? []).sort();
}
