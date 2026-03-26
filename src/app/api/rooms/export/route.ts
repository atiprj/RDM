import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import * as XLSX from "xlsx";

function normalizeProjectId(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: Request) {
  const supabase = getSupabaseAdmin();
  const url = new URL(req.url);
  const projectId = normalizeProjectId(url.searchParams.get("projectId"));
  if (!projectId) {
    return NextResponse.json({ ok: false, error: "projectId mancante" }, { status: 400 });
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

  const roomsRes = await supabase
    .from("rooms")
    .select("room_number,room_name_planned,area,parameters")
    .eq("project_id", projectId)
    .order("room_number", { ascending: true });

  if (roomsRes.error) {
    return NextResponse.json(
      { ok: false, error: `Errore Supabase: ${roomsRes.error.message}` },
      { status: 500 }
    );
  }

  const rows = (roomsRes.data ?? []).map((r: any) => {
    const params = (r.parameters ?? {}) as Record<string, unknown>;
    const dyn: Record<string, unknown> = {};
    for (const p of mappedParams) dyn[p] = params[p] ?? "";
    return {
      Number: r.room_number,
      Name: r.room_name_planned ?? "",
      Area: r.area ?? "",
      ...dyn,
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: false });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Rooms");
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const bytes = new Uint8Array(out);

  return new NextResponse(bytes, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="rooms_proj_${projectId}.xlsx"`,
    },
  });
}

