import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import type { UserPermissions } from "@/lib/projectAccess";
import { canAccessProject, parseProjectId, type AuthFail, type AuthOk } from "@/lib/auth";

/**
 * Token personali per il plugin Revit.
 * Formato: "rdm_" + 43 caratteri base64url (256 bit). Nel DB si salva solo lo SHA-256.
 */
export const TOKEN_PREFIX = "rdm_";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateToken(): { token: string; hash: string; prefix: string } {
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token), prefix: token.slice(0, TOKEN_PREFIX.length + 6) };
}

function fail(status: number, error: string): AuthFail {
  return { ok: false, response: NextResponse.json({ ok: false, error }, { status }) };
}

/** Utente identificato dal token "Authorization: Bearer rdm_..." (usato dal plugin Revit). */
export async function requireTokenUser(req: Request): Promise<AuthOk | AuthFail> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  const token = match?.[1] ?? "";
  if (!token.startsWith(TOKEN_PREFIX)) return fail(401, "Token mancante o non valido");

  const supabase = getSupabaseAdmin();
  const { data: rows, error } = await supabase
    .from("api_tokens")
    .select("id,email")
    .eq("token_hash", hashToken(token))
    .limit(1);
  if (error) return fail(500, `Errore Supabase: ${error.message}`);
  const row = rows?.[0];
  if (!row) return fail(401, "Token non valido o eliminato");

  const { data: users, error: uErr } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("email", String(row.email).toLowerCase().trim())
    .limit(1);
  if (uErr) return fail(500, `Errore Supabase: ${uErr.message}`);
  const user = users?.[0] as UserPermissions | undefined;
  if (!user) return fail(401, "Utente del token non più autorizzato");

  await supabase.from("api_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", row.id);
  return { ok: true, user, supabase };
}

/** Come requireTokenUser + accesso al progetto indicato. */
export async function requireTokenProjectAccess(
  req: Request,
  projectIdRaw: unknown
): Promise<AuthFail | (AuthOk & { projectId: number })> {
  const projectId = parseProjectId(projectIdRaw);
  if (!projectId) return fail(400, "projectId mancante o non valido");
  const auth = await requireTokenUser(req);
  if (!auth.ok) return auth;
  if (!canAccessProject(auth.user, projectId)) return fail(403, "Forbidden: progetto non consentito");
  return { ...auth, projectId };
}
