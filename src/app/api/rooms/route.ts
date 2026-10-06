import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/auth";

const PAGE_SIZE = 1000;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = await requireProjectAccess(url.searchParams.get("projectId"));
  if (!auth.ok) return auth.response;
  const { supabase, projectId } = auth;
  const rooms: any[] = [];
  let from = 0;

  while (true) {
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
      .order("room_number", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    q = q.eq("project_id", projectId);

    const { data, error } = await q;
    if (error) {
      return NextResponse.json(
        { ok: false, error: `Errore Supabase: ${error.message}` },
        { status: 500 }
      );
    }

    const chunk = data ?? [];
    rooms.push(...chunk);
    if (chunk.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return NextResponse.json({ ok: true, rooms });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { project_id?: number; room_number?: string; room_name_planned?: string }
    | null;

  const auth = await requireProjectAccess(body?.project_id);
  if (!auth.ok) return auth.response;
  const { supabase, projectId: project_id } = auth;
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
  const url = new URL(req.url);
  const deleteAll = url.searchParams.get("all") === "true";
  const auth = await requireProjectAccess(url.searchParams.get("projectId"));
  if (!auth.ok) return auth.response;
  const { supabase, projectId } = auth;
  const ids = url.searchParams
    .getAll("id")
    .map((x) => Number(x))
    .filter((n) => Number.isFinite(n));

  if (deleteAll) {
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

  const { error } = await supabase.from("rooms").delete().eq("project_id", projectId).in("id", ids);

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Errore Supabase: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}

