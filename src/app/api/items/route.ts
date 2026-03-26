import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

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
    .select("id,item_code,item_description")
    .eq("project_id", projectId)
    .order("item_code", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Errore Supabase: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, items: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  const body = (await req.json().catch(() => null)) as
    | { project_id?: number; item_code?: string; item_description?: string }
    | null;

  const project_id = body?.project_id;
  const item_code = String(body?.item_code ?? "").trim();
  const item_description = String(body?.item_description ?? "").trim();

  if (!project_id || !item_code) {
    return NextResponse.json(
      { ok: false, error: "project_id e item_code sono obbligatori" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("items").insert({
    project_id,
    item_code,
    item_description,
  });

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Errore Supabase: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const supabase = getSupabaseAdmin();
  const url = new URL(req.url);
  const ids = url.searchParams.getAll("id").map((x) => Number(x)).filter(Number.isFinite);
  if (!ids.length) {
    return NextResponse.json({ ok: false, error: "Nessun id" }, { status: 400 });
  }

  const { error } = await supabase.from("items").delete().in("id", ids);
  if (error) {
    return NextResponse.json(
      { ok: false, error: `Errore Supabase: ${error.message}` },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

