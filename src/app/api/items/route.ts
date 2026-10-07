import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = await requireProjectAccess(url.searchParams.get("projectId"));
  if (!auth.ok) return auth.response;
  const { supabase, projectId } = auth;

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
  const body = (await req.json().catch(() => null)) as
    | { project_id?: number; item_code?: string; item_description?: string }
    | null;

  const auth = await requireProjectAccess(body?.project_id);
  if (!auth.ok) return auth.response;
  const { supabase, projectId: project_id } = auth;
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
  const url = new URL(req.url);
  const auth = await requireProjectAccess(url.searchParams.get("projectId"));
  if (!auth.ok) return auth.response;
  const { supabase, projectId } = auth;
  const ids = url.searchParams.getAll("id").map((x) => Number(x)).filter(Number.isFinite);
  if (!ids.length) {
    return NextResponse.json({ ok: false, error: "Nessun id" }, { status: 400 });
  }

  const { error } = await supabase.from("items").delete().eq("project_id", projectId).in("id", ids);
  if (error) {
    return NextResponse.json(
      { ok: false, error: `Errore Supabase: ${error.message}` },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

