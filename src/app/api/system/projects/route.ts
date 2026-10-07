import { NextResponse } from "next/server";
import { requireAdmin as requireAdminSession } from "@/lib/auth";

async function requireAdmin() {
  const auth = await requireAdminSession({ superOnly: true });
  if (!auth.ok) {
    const status = auth.response.status;
    return { ok: false as const, status, error: status === 403 ? "Forbidden" : "Unauthorized" };
  }
  return { ok: true as const, supabase: auth.supabase };
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });

  const body = (await req.json().catch(() => null)) as
    | { project_code?: string; project_name?: string }
    | null;
  const project_code = String(body?.project_code ?? "").trim();
  const project_name = String(body?.project_name ?? "").trim();

  if (!project_code || !project_name) {
    return NextResponse.json({ ok: false, error: "Campi obbligatori mancanti" }, { status: 400 });
  }

  const { error } = await admin.supabase.from("projects").insert({ project_code, project_name });
  if (error) {
    return NextResponse.json({ ok: false, error: `Errore Supabase: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

