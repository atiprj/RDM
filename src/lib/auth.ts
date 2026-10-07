import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import {
  isProjectAdminUser,
  isSuperAdminUser,
  normalizeAllowedProjects,
  type UserPermissions,
} from "@/lib/projectAccess";
import { SESSION_COOKIE, readSessionValue } from "@/lib/session";

export type AuthOk = { ok: true; user: UserPermissions; supabase: SupabaseClient };
export type AuthFail = { ok: false; response: NextResponse };
export type AuthResult = AuthOk | AuthFail;

function fail(status: number, error: string): AuthFail {
  return { ok: false, response: NextResponse.json({ ok: false, error }, { status }) };
}

export function parseProjectId(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Utente loggato (cookie firmato valido + presente in user_permissions). */
export async function requireUser(): Promise<AuthResult> {
  let email: string | null;
  try {
    const cookieStore = await cookies();
    email = readSessionValue(cookieStore.get(SESSION_COOKIE)?.value);
  } catch (e) {
    return fail(500, e instanceof Error ? e.message : "Errore sessione");
  }
  if (!email) return fail(401, "Unauthorized");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("email", email)
    .limit(1);
  if (error) return fail(500, `Errore Supabase: ${error.message}`);
  const user = data?.[0] as UserPermissions | undefined;
  if (!user) return fail(401, "Unauthorized");

  return { ok: true, user, supabase };
}

export function canAccessProject(user: UserPermissions, projectId: number): boolean {
  if (isSuperAdminUser(user) || isProjectAdminUser(user)) return true;
  return normalizeAllowedProjects(user.allowed_projects).includes(projectId);
}

/** Utente loggato con accesso al progetto indicato. */
export async function requireProjectAccess(
  projectIdRaw: unknown
): Promise<AuthFail | (AuthOk & { projectId: number })> {
  const projectId = parseProjectId(projectIdRaw);
  if (!projectId) return fail(400, "projectId mancante o non valido");
  const auth = await requireUser();
  if (!auth.ok) return auth;
  if (!canAccessProject(auth.user, projectId)) return fail(403, "Forbidden: progetto non consentito");
  return { ...auth, projectId };
}

/** Super admin oppure project admin. */
export async function requireAdmin(opts: { superOnly?: boolean } = {}): Promise<AuthResult> {
  const auth = await requireUser();
  if (!auth.ok) return auth;
  const isSuper = isSuperAdminUser(auth.user);
  const allowed = opts.superOnly ? isSuper : isSuper || isProjectAdminUser(auth.user);
  if (!allowed) return fail(403, "Forbidden");
  return auth;
}
