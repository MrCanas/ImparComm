/**
 * Cliente mínimo de Zoho CRM v8 (centro de datos UE), portado de icam:
 * access token renovado con el refresh token y cacheado en memoria.
 *
 * Variables: ZOHO_ACCOUNTS_URL (https://accounts.zoho.eu), ZOHO_API_DOMAIN
 * (https://www.zohoapis.eu), ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET, ZOHO_REFRESH_TOKEN.
 * El refresh token debe incluir los scopes ZohoCRM.modules.contacts.ALL,
 * ZohoCRM.modules.campaigns.ALL y ZohoCRM.users.READ. Solo servidor.
 */
const VARIABLES = [
  "ZOHO_ACCOUNTS_URL",
  "ZOHO_API_DOMAIN",
  "ZOHO_CLIENT_ID",
  "ZOHO_CLIENT_SECRET",
  "ZOHO_REFRESH_TOKEN",
] as const;

function config() {
  const faltan = VARIABLES.filter((v) => !process.env[v]?.trim());
  if (faltan.length > 0) throw new Error(`Zoho no configurado: faltan ${faltan.join(", ")}`);
  const limpia = (s: string) => s.trim().replace(/\/+$/, "");
  return {
    accountsUrl: limpia(process.env.ZOHO_ACCOUNTS_URL!),
    apiDomain: limpia(process.env.ZOHO_API_DOMAIN!),
    clientId: process.env.ZOHO_CLIENT_ID!.trim(),
    clientSecret: process.env.ZOHO_CLIENT_SECRET!.trim(),
    refreshToken: process.env.ZOHO_REFRESH_TOKEN!.trim(),
  };
}

let cache: { token: string; expiraEn: number } | null = null;

async function accessToken(): Promise<string> {
  if (cache && Date.now() < cache.expiraEn) return cache.token;
  const cfg = config();
  const url = new URL(`${cfg.accountsUrl}/oauth/v2/token`);
  url.searchParams.set("refresh_token", cfg.refreshToken);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("client_secret", cfg.clientSecret);
  url.searchParams.set("grant_type", "refresh_token");
  const res = await fetch(url, { method: "POST" });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!res.ok || !body.access_token) {
    throw new Error(`Zoho no devolvió token (${res.status}): ${body.error ?? "sin detalle"}`);
  }
  cache = { token: body.access_token, expiraEn: Date.now() + Math.max(0, (body.expires_in ?? 3600) - 60) * 1000 };
  return cache.token;
}

export async function zohoApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const cfg = config();
  const res = await fetch(`${cfg.apiDomain}/crm/v8${path}`, {
    ...init,
    headers: {
      Authorization: `Zoho-oauthtoken ${await accessToken()}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  if (res.status === 204) return {} as T;
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const b = body as { code?: string; message?: string };
    throw new Error(`Zoho ${res.status} en ${path}: ${b.code ?? ""} ${b.message ?? JSON.stringify(body)}`);
  }
  return body as T;
}
