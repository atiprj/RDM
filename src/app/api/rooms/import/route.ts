import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

type ImportBody = {
  projectId?: number;
  rows?: Record<string, unknown>[];
};

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  const body = (await req.json().catch(() => null)) as ImportBody | null;
  const projectId = body?.projectId;
  const rows = body?.rows ?? [];

  if (!projectId || !Array.isArray(rows)) {
    return NextResponse.json({ ok: false, error: "Payload non valido" }, { status: 400 });
  }

  const mapsRes = await supabase
    .from("parameter_mappings")
    .select("db_column_name")
    .eq("project_id", projectId);

  if (mapsRes.error) {
    return NextResponse.json(
      { ok: false, error: `Errore Supabase: ${mapsRes.error.message}` },
      { status: 500 }
    );
  }

  const mappedParams = (mapsRes.data ?? []).map((m: any) => String(m.db_column_name));

  const bulk = rows
    .map((row) => {
      const numRaw = row["Number"];
      const num = String(numRaw ?? "").trim();
      if (!num) return null;

      const p_dict: Record<string, string> = {};
      for (const p of mappedParams) {
        if (p in row) {
          const v = row[p];
          if (v != null && String(v).trim() !== "") p_dict[p] = String(v).trim();
        }
      }

      const areaRaw = row["Area"];
      let area: number | null = null;
      if (areaRaw != null && String(areaRaw).trim() !== "") {
        const n = Number(String(areaRaw).replace(",", "."));
        area = Number.isFinite(n) ? n : null;
      }

      return {
        project_id: projectId,
        room_number: num,
        room_name_planned: String(row["Name"] ?? "").trim(),
        parameters: p_dict,
        is_synced: false,
        area,
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  if (!bulk.length) {
    return NextResponse.json({ ok: false, error: "Nessuna riga valida trovata" }, { status: 400 });
  }

  const { error } = await supabase
    .from("rooms")
    .upsert(bulk, { onConflict: "project_id,room_number" });

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Errore Supabase: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, synced: bulk.length });
}

