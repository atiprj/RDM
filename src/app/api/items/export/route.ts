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

  const { data, error } = await supabase
    .from("items")
    .select("item_code,item_description")
    .eq("project_id", projectId)
    .order("item_code", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Errore Supabase: ${error.message}` },
      { status: 500 }
    );
  }

  const ws = XLSX.utils.json_to_sheet(data ?? []);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Catalog");
  const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const bytes = new Uint8Array(out);

  return new NextResponse(bytes, {
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="catalog_proj_${projectId}.xlsx"`,
    },
  });
}

