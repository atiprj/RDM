import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { normalizeAllowedProjects } from "@/lib/projectAccess";

export async function GET() {
  const cookieStore = await cookies();
  const email = cookieStore.get("user_email")?.value?.toLowerCase().trim();
  if (!email) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const userRes = await supabase
    .from("user_permissions")
    .select("email,is_admin,allowed_projects")
    .eq("email", email)
    .limit(1);

  if (userRes.error) {
    return NextResponse.json(
      { ok: false, error: `Errore Supabase: ${userRes.error.message}` },
      { status: 500 }
    );
  }

  const user = userRes.data?.[0];
  if (!user) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });

  const isAdmin = Boolean((user as any).is_admin);
  const allowed = normalizeAllowedProjects((user as any).allowed_projects);

  let q = supabase.from("projects").select("*").order("project_code", { ascending: true });
  if (!isAdmin) {
    q = q.in("id", allowed.length ? allowed : [0]);
  }

  const { data, error } = await q;
  if (error) {
    return NextResponse.json(
      { ok: false, error: `Errore Supabase: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, projects: data ?? [], isAdmin });
}

