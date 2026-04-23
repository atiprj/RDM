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

  let q = supabase
    .from("rooms")
    .select(
      `id,
       project_id,
       room_number,
       room_name_planned,
       department,
       created_at,
       Comments,
       "Fire Rating",
       parameters,
       area,
       is_synced,
       last_sync_at`
    )
    .order("room_number", { ascending: true });

  if (projectId) q = q.eq("project_id", projectId);

  const { data, error } = await q;

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Errore Supabase: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, rooms: data ?? [] });
}

export async function POST(req: Request) {
  const supabase = getSupabaseAdmin();
  const body = (await req.json().catch(() => null)) as
    | { project_id?: number; room_number?: string; room_name_planned?: string }
    | null;

  const project_id = body?.project_id;
  const room_number = String(body?.room_number ?? "").trim();
  const room_name_planned = String(body?.room_name_planned ?? "").trim();

  if (!project_id || !room_number) {
    return NextResponse.json(
      { ok: false, error: "project_id e room_number sono obbligatori" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("rooms").insert({
    project_id,
    room_number,
    room_name_planned,
    area: null,
    parameters: {},
    is_synced: false,
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
  const deleteAll = url.searchParams.get("all") === "true";
  const projectId = normalizeProjectId(url.searchParams.get("projectId"));
  const ids = url.searchParams
    .getAll("id")
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n));

  if (deleteAll) {
    if (!projectId) {
      return NextResponse.json(
        { ok: false, error: "projectId obbligatorio per eliminazione totale" },
        { status: 400 }
      );
    }
    const { error } = await supabase.from("rooms").delete().eq("project_id", projectId);
    if (error) {
      return NextResponse.json(
        { ok: false, error: `Errore Supabase: ${error.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  if (!ids.length) {
    return NextResponse.json({ ok: false, error: "Nessun id fornito" }, { status: 400 });
  }

  const { error } = await supabase.from("rooms").delete().in("id", ids);

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Errore Supabase: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

