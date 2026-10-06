import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isProjectAdminUser, isSuperAdminUser, normalizeAllowedProjects } from "@/lib/projectAccess";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;

  const isSuperAdmin = isSuperAdminUser(user as any);
  const isProjectAdmin = isProjectAdminUser(user as any);
  const allowed = normalizeAllowedProjects((user as any).allowed_projects);

  let q = supabase.from("projects").select("*").order("project_code", { ascending: true });
  if (!isSuperAdmin && !isProjectAdmin) {
    q = q.in("id", allowed.length ? allowed : [0]);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json(
      { ok: false, error: `Errore Supabase: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, projects: data ?? [], isSuperAdmin, isProjectAdmin });
}

