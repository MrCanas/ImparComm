import { NextResponse } from "next/server";

import { issueSupabaseTokenForSession } from "@/lib/auth/issue-supabase-token";

/**
 * Bridge de sesión → Supabase (mismo mecanismo que icam): cookie validada →
 * JWT `authenticated` para que PostgREST aplique RLS con `auth.uid()`.
 */
export async function GET() {
  const result = await issueSupabaseTokenForSession();
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({
    access_token: result.access_token,
    expires_at: result.expires_at,
  });
}
