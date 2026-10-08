import { NextResponse } from "next/server";
import { canAccessProject, requireProjectAccess } from "@/lib/auth";
import { parseDirection, type MappingDirection } from "@/lib/mappingDirection";

type Body = {
  projectId?: number;
  rows?: {
    project_id?: number | null;
    project_code?: string;
    db_column_name?: string;
    revit_parameter_name?: string;
    direction?: string;
  }[];
};

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const auth = await requireProjectAccess(body?.projectId);
  if (!auth.ok) return auth.response;
  const { supabase, projectId } = auth;
  const rows = body?.rows ?? [];

  if (!Array.isArray(rows)) {
    return NextResponse.json({ ok: false, error: "Payload non valido" }, { status: 400 });
  }

  const projectsRes = await supabase.from("projects").select("id,project_code");
  if (projectsRes.error) {
    return NextResponse.json(
      { ok: false, error: `Errore Supabase: ${projectsRes.error.message}` },
      { status: 500 }
    );
  }

  const projectCodeToId = new Map<string, number>();
  for (const p of projectsRes.data ?? []) {
    const code = String((p as any).project_code ?? "").trim();
    const id = Number((p as any).id);
    if (code && Number.isFinite(id)) projectCodeToId.set(code, id);
  }

  type Row = { project_id: number; db_column_name: string; revit_parameter_name: string; direction?: MappingDirection };
  const byKey = new Map<string, Row>();
  const badDirections = new Set<string>();
  const unknownProjectCodes = new Set<string>();
  for (const r of rows) {
    const db = String(r.db_column_name ?? "").trim();
    const rv = String(r.revit_parameter_name ?? "").trim();
    if (!db || !rv) continue;

    const rowProjectId =
      Number.isFinite(Number(r.project_id)) && Number(r.project_id) > 0
        ? Number(r.project_id)
        : null;
    const rowProjectCode = String(r.project_code ?? "").trim();
    if (!rowProjectId && rowProjectCode && !projectCodeToId.has(rowProjectCode)) {
      unknownProjectCodes.add(rowProjectCode);
      continue;
    }
    const resolvedProjectId = rowProjectId ?? (rowProjectCode ? projectCodeToId.get(rowProjectCode) ?? null : null);
    const finalProjectId = resolvedProjectId ?? projectId;
    if (!finalProjectId) continue;

    const key = `${finalProjectId}::${db}`;
    // Last row wins when duplicates are present in the same import file.
    const row: Row = { project_id: finalProjectId, db_column_name: db, revit_parameter_name: rv };
    const dirRaw = String(r.direction ?? "").trim();
    if (dirRaw) {
      const dir = parseDirection(dirRaw);
      if (!dir) badDirections.add(dirRaw);
      else row.direction = dir;
    }
    byKey.set(key, row);
  }

  const forbidden = Array.from(new Set(Array.from(byKey.values()).map((r) => r.project_id))).filter(
    (pid) => !canAccessProject(auth.user, pid)
  );
  if (forbidden.length) {
    return NextResponse.json(
      { ok: false, error: `Forbidden: progetti non consentiti (${forbidden.join(", ")})` },
      { status: 403 }
    );
  }

  if (unknownProjectCodes.size) {
    return NextResponse.json(
      {
        ok: false,
        error: `Project code non trovato: ${Array.from(unknownProjectCodes).join(", ")}`,
      },
      { status: 400 }
    );
  }

  if (badDirections.size) {
    return NextResponse.json(
      {
        ok: false,
        error: `Direzione non valida: ${Array.from(badDirections).join(", ")} (usa web_to_revit o revit_to_web)`,
      },
      { status: 400 }
    );
  }

  const all = Array.from(byKey.values());
  if (!all.length) {
    return NextResponse.json({ ok: false, error: "Nessuna riga valida" }, { status: 400 });
  }

  // Le righe senza colonna direction non toccano la direzione già salvata (le nuove prendono il default).
  const withDir = all.filter((r) => r.direction);
  const withoutDir = all.filter((r) => !r.direction).map(({ direction: _d, ...rest }) => rest);
  for (const bulk of [withDir, withoutDir]) {
    if (!bulk.length) continue;
    const { error } = await supabase
      .from("parameter_mappings")
      .upsert(bulk as Record<string, unknown>[], { onConflict: "project_id,db_column_name" });
    if (error) {
      return NextResponse.json(
        { ok: false, error: `Errore Supabase: ${error.message}` },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ ok: true, synced: all.length });
}

