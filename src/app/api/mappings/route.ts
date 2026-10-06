import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/auth";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = await requireProjectAccess(url.searchParams.get("projectId"));
  if (!auth.ok) return auth.response;
  const { supabase, projectId } = auth;

  const { data, error } = await supabase
    .from("parameter_mappings")
    .select("id,project_id,db_column_name,revit_parameter_name")
    .eq("project_id", projectId)
    .order("db_column_name", { ascending: true });

  if (error) {
    return NextResponse.json(
      { ok: false, error: `Errore Supabase: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, mappings: data ?? [] });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { project_id?: number; db_column_name?: string; revit_parameter_name?: string }
    | null;

  const auth = await requireProjectAccess(body?.project_id);
  if (!auth.ok) return auth.response;
  const { supabase, projectId: project_id } = auth;
  const db_column_name = String(body?.db_column_name ?? "").trim();
  const revit_parameter_name = String(body?.revit_parameter_name ?? "").trim();

  if (!project_id || !db_column_name || !revit_parameter_name) {
    return NextResponse.json(
      { ok: false, error: "Campi obbligatori mancanti" },
      { status: 400 }
    );
  }

  const { error } = await supabase.from("parameter_mappings").insert({
    project_id,
    db_column_name,
    revit_parameter_name,
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

  const { error } = await supabase.from("parameter_mappings").delete().eq("project_id", projectId).in("id", ids);
  if (error) {
    return NextResponse.json(
      { ok: false, error: `Errore Supabase: ${error.message}` },
      { status: 500 }
    );
  }
  return NextResponse.json({ ok: true });
}

