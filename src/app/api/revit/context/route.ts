import { NextResponse } from "next/server";
import { canAccessProject, parseProjectId } from "@/lib/auth";
import { requireTokenUser } from "@/lib/apiTokens";
import { isProjectAdminUser, isSuperAdminUser, normalizeAllowedProjects } from "@/lib/projectAccess";
import { SR_CODE_KEY, SR_MAIN_KEY } from "@/lib/roomGeometry";

/**
 * Contesto per il plugin Revit (autenticato con token).
 * - senza projectId: utente e progetti accessibili;
 * - con projectId: anche i parametri Revit mappati per SR_Code / SR_Main e l'elenco dei locali.
 */
export async function GET(req: Request) {
  const auth = await requireTokenUser(req);
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const projectIdRaw = new URL(req.url).searchParams.get("projectId");
  if (!projectIdRaw) {
    let q = supabase.from("projects").select("id,project_code,project_name").order("project_code");
    if (!isSuperAdminUser(user) && !isProjectAdminUser(user)) {
      const allowed = normalizeAllowedProjects(user.allowed_projects);
      q = q.in("id", allowed.length ? allowed : [0]);
    }
    const { data, error } = await q;
    if (error) return NextResponse.json({ ok: false, error: `Errore Supabase: ${error.message}` }, { status: 500 });
    return NextResponse.json({ ok: true, email: user.email, projects: data ?? [] });
  }

  const projectId = parseProjectId(projectIdRaw);
  if (!projectId) return NextResponse.json({ ok: false, error: "projectId non valido" }, { status: 400 });
  if (!canAccessProject(user, projectId)) {
    return NextResponse.json({ ok: false, error: "Forbidden: progetto non consentito" }, { status: 403 });
  }

  const [mapsRes, roomsRes] = await Promise.all([
    supabase
      .from("parameter_mappings")
      .select("db_column_name,revit_parameter_name")
      .eq("project_id", projectId)
      .in("db_column_name", [SR_CODE_KEY, SR_MAIN_KEY]),
    supabase.from("rooms").select("id,room_number").eq("project_id", projectId).limit(10000),
  ]);
  if (mapsRes.error) {
    return NextResponse.json({ ok: false, error: `Errore Supabase: ${mapsRes.error.message}` }, { status: 500 });
  }
  if (roomsRes.error) {
    return NextResponse.json({ ok: false, error: `Errore Supabase: ${roomsRes.error.message}` }, { status: 500 });
  }
  const byKey = new Map((mapsRes.data ?? []).map((m) => [m.db_column_name, m.revit_parameter_name]));

  return NextResponse.json({
    ok: true,
    email: user.email,
    projectId,
    // Parametro Revit da cui leggere il tipo SR (mappato per progetto). null = non mappato.
    srCodeParam: byKey.get(SR_CODE_KEY) ?? null,
    // Parametro Revit della Main: mappato se presente, altrimenti "SR_Main".
    srMainParam: byKey.get(SR_MAIN_KEY) ?? SR_MAIN_KEY,
    rooms: roomsRes.data ?? [],
  });
}
