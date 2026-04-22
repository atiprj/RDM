import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

type Body = {
  projectId?: number;
  rows?: {
    project_id?: number | null;
    project_code?: string;
    db_column_name?: string;
    revit_parameter_name?: string;
  }[];
};

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  const body = (await req.json().catch(() => null)) as Body | null;
  const projectId = body?.projectId;
  const rows = body?.rows ?? [];

  if (!projectId || !Array.isArray(rows)) {
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

  const byKey = new Map<string, { project_id: number; db_column_name: string; revit_parameter_name: string }>();
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
    byKey.set(key, { project_id: finalProjectId, db_column_name: db, revit_parameter_name: rv });
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

  const bulk = Array.from(byKey.values()) as Record<string, unknown>[];

  if (!bulk.length) {
    return NextResponse.json({ ok: false, error: "Nessuna riga valida" }, { status: 400 });
  }

  const { error } = await supabase
    .from("parameter_mappings")
    .upsert(bulk, { onConflict: "project_id,db_column_name" });

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Errore Supabase: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, synced: bulk.length });
}

