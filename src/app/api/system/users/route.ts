import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

async function requireAdmin() {
  const cookieStore = await cookies();
  const email = cookieStore.get("user_email")?.value?.toLowerCase().trim();
  if (!email) return { ok: false as const, status: 401, error: "Unauthorized" };

  const supabase = getSupabaseAdmin();
  const me = await supabase.from("user_permissions").select("email,is_admin").eq("email", email).limit(1);
  if (me.error) return { ok: false as const, status: 500, error: me.error.message };
  const user = me.data?.[0] as any;
  if (!user?.is_admin) return { ok: false as const, status: 403, error: "Forbidden" };
  return { ok: true as const, supabase };
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });

  const { data, error } = await admin.supabase
    .from("user_permissions")
    .select("email,is_admin,allowed_projects")
    .order("email", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: `Errore Supabase: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, users: data ?? [] });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });

  const body = (await req.json().catch(() => null)) as { email?: string; is_admin?: boolean } | null;
  const email = String(body?.email ?? "").toLowerCase().trim();
  const is_admin = Boolean(body?.is_admin);

  if (!email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Email non valida" }, { status: 400 });
  }

  const { error } = await admin.supabase.from("user_permissions").insert({ email, is_admin });
  if (error) {
    return NextResponse.json({ ok: false, error: `Errore Supabase: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });

  const body = (await req.json().catch(() => null)) as
    | { email?: string; allowed_projects?: number[] }
    | null;
  const email = String(body?.email ?? "").toLowerCase().trim();
  const allowed_projects = Array.isArray(body?.allowed_projects)
    ? body!.allowed_projects!.map((n) => Number(n)).filter(Number.isFinite)
    : [];

  if (!email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Email non valida" }, { status: 400 });
  }

  const { error } = await admin.supabase
    .from("user_permissions")
    .update({ allowed_projects })
    .eq("email", email);

  if (error) {
    return NextResponse.json({ ok: false, error: `Errore Supabase: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

