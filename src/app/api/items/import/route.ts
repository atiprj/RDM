import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

type Body = {
  projectId?: number;
  rows?: { item_code?: string; item_description?: string }[];
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
      const code = String(r.item_code ?? "").trim();
      if (!code) return null;
      return {
        project_id: projectId,
        item_code: code,
        item_description: String(r.item_description ?? "").trim(),
      };
    })
    .filter(Boolean) as Record<string, unknown>[];

  if (!bulk.length) {
    return NextResponse.json({ ok: false, error: "Nessuna riga valida" }, { status: 400 });
  }

  const { error } = await supabase.from("items").upsert(bulk, { onConflict: "project_id,item_code" });

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Errore Supabase: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, synced: bulk.length });
}

