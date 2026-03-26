import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

type Body = {
  projectId?: number;
  rows?: { db_column_name?: string; revit_parameter_name?: string }[];
};

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  const body = (await req.json().catch(() => null)) as Body | null;
  const projectId = body?.projectId;
  const rows = body?.rows ?? [];

  if (!projectId || !Array.isArray(rows)) {
    return NextResponse.json({ ok: false, error: "Payload non valido" }, { status: 400 });
  }

  const bulk = rows
    .map((r) => {
      const db = String(r.db_column_name ?? "").trim();
      const rv = String(r.revit_parameter_name ?? "").trim();
      if (!db || !rv) return null;
      return { project_id: projectId, db_column_name: db, revit_parameter_name: rv };
    })
    .filter(Boolean) as Record<string, unknown>[];

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

