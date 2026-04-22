import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

type ImportBody = {
  projectId?: number;
  rows?: Record<string, unknown>[];
};

type RoomUpsertRow = {
  project_id: number;
  room_number: string;
  room_name_planned: string;
  parameters: Record<string, string>;
  is_synced: boolean;
  area: number | null;
};

const UPSERT_CHUNK_SIZE = 100;

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

  const byRoomNumber = new Map<string, RoomUpsertRow>();
  for (const row of rows) {
    const numRaw = row["Number"];
    const num = String(numRaw ?? "").trim();
    if (!num) continue;

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

    // Keep last occurrence when the same room number appears multiple times in the file.
    byRoomNumber.set(num, {
      project_id: projectId,
      room_number: num,
      room_name_planned: String(row["Name"] ?? "").trim(),
      parameters: p_dict,
      is_synced: false,
      area,
    });
  }

  const bulk = Array.from(byRoomNumber.values());

  if (!bulk.length) {
    return NextResponse.json({ ok: false, error: "Nessuna riga valida trovata" }, { status: 400 });
  }

  let synced = 0;
  const failed: { room_number: string; reason: string }[] = [];
  for (let i = 0; i < bulk.length; i += UPSERT_CHUNK_SIZE) {
    const chunk = bulk.slice(i, i + UPSERT_CHUNK_SIZE);
    const { error } = await supabase
      .from("rooms")
      .upsert(chunk, { onConflict: "project_id,room_number" });

    if (!error) {
      synced += chunk.length;
      continue;
    }

    // Fallback: isolate bad rows so a single failure does not block the whole chunk.
    for (const row of chunk) {
      const single = await supabase
        .from("rooms")
        .upsert([row], { onConflict: "project_id,room_number" });
      if (single.error) {
        failed.push({
          room_number: row.room_number,
          reason: single.error.message,
        });
      } else {
        synced += 1;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    synced,
    failed_count: failed.length,
    failed_rooms: failed.slice(0, 50),
  });
}

