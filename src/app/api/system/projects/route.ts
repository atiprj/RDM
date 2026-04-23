import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { isSuperAdminUser } from "@/lib/projectAccess";

async function requireAdmin() {
  const cookieStore = await cookies();
  const email = cookieStore.get("user_email")?.value?.toLowerCase().trim();
  if (!email) return { ok: false as const, status: 401, error: "Unauthorized" };

  const supabase = getSupabaseAdmin();
  const me = await supabase
    .from("user_permissions")
    .select("email,is_admin,is_super_admin")
    .eq("email", email)
    .limit(1);
  if (me.error) return { ok: false as const, status: 500, error: me.error.message };
  const user = me.data?.[0] as any;
  if (!isSuperAdminUser(user)) return { ok: false as const, status: 403, error: "Forbidden" };
  return { ok: true as const, supabase };
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

