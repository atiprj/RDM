import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { isProjectAdminUser, isSuperAdminUser } from "@/lib/projectAccess";

async function requireAdmin() {
  const cookieStore = await cookies();
  const email = cookieStore.get("user_email")?.value?.toLowerCase().trim();
  if (!email) return { ok: false as const, status: 401, error: "Unauthorized" };

  const supabase = getSupabaseAdmin();
  const me = await supabase
    .from("user_permissions")
    .select("email,is_admin,is_super_admin,is_project_admin,allowed_projects")
    .eq("email", email)
    .limit(1);
  if (me.error) return { ok: false as const, status: 500, error: me.error.message };
  const user = me.data?.[0] as any;
  if (!isSuperAdminUser(user) && !isProjectAdminUser(user)) {
    return { ok: false as const, status: 403, error: "Forbidden" };
  }
  return { ok: true as const, supabase, me: user };
}

function canManageTarget(actor: any, target: any): boolean {
  const actorIsSuper = isSuperAdminUser(actor);
  const targetIsSuper = isSuperAdminUser(target);
  if (actorIsSuper) return true;
  return !targetIsSuper;
}

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });

  const { data, error } = await admin.supabase
    .from("user_permissions")
    .select("email,is_admin,is_super_admin,is_project_admin,allowed_projects")
    .order("email", { ascending: true });

  if (error) {
    return NextResponse.json({ ok: false, error: `Errore Supabase: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, users: data ?? [] });
}

export async function POST(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });

  const body = (await req.json().catch(() => null)) as
    | {
        email?: string;
        is_super_admin?: boolean;
        is_project_admin?: boolean;
        allowed_projects?: number[];
      }
    | null;
  const email = String(body?.email ?? "").toLowerCase().trim();
  const is_super_admin = Boolean(body?.is_super_admin);
  const is_project_admin = Boolean(body?.is_project_admin);
  const allowed_projects = Array.isArray(body?.allowed_projects)
    ? body!.allowed_projects!.map((n) => Number(n)).filter(Number.isFinite)
    : [];

  if (!email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Email non valida" }, { status: 400 });
  }

  if (!isSuperAdminUser(admin.me) && is_super_admin) {
    return NextResponse.json(
      { ok: false, error: "Solo il super admin puo assegnare super admin." },
      { status: 403 }
    );
  }

  const { error } = await admin.supabase.from("user_permissions").insert({
    email,
    is_super_admin,
    is_project_admin,
    // backward compatibility with existing checks
    is_admin: is_super_admin || is_project_admin,
    allowed_projects,
  });
  if (error) {
    return NextResponse.json({ ok: false, error: `Errore Supabase: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });

  const body = (await req.json().catch(() => null)) as
    | {
        email?: string;
        allowed_projects?: number[];
        is_super_admin?: boolean;
        is_project_admin?: boolean;
      }
    | null;
  const email = String(body?.email ?? "").toLowerCase().trim();
  const allowed_projects = Array.isArray(body?.allowed_projects)
    ? body!.allowed_projects!.map((n) => Number(n)).filter(Number.isFinite)
    : [];

  if (!email.includes("@")) {
    return NextResponse.json({ ok: false, error: "Email non valida" }, { status: 400 });
  }

  const targetRes = await admin.supabase
    .from("user_permissions")
    .select("email,is_admin,is_super_admin,is_project_admin")
    .eq("email", email)
    .limit(1);
  if (targetRes.error) {
    return NextResponse.json({ ok: false, error: `Errore Supabase: ${targetRes.error.message}` }, { status: 500 });
  }
  const target = targetRes.data?.[0] as any;
  if (!target) return NextResponse.json({ ok: false, error: "Utente non trovato" }, { status: 404 });
  if (!canManageTarget(admin.me, target)) {
    return NextResponse.json(
      { ok: false, error: "Un project admin non puo modificare un super admin." },
      { status: 403 }
    );
  }

  const patch: Record<string, unknown> = { allowed_projects };
  if (typeof body?.is_project_admin === "boolean") {
    patch.is_project_admin = body.is_project_admin;
  }
  if (typeof body?.is_super_admin === "boolean") {
    if (!isSuperAdminUser(admin.me)) {
      return NextResponse.json(
        { ok: false, error: "Solo il super admin puo modificare super admin." },
        { status: 403 }
      );
    }
    patch.is_super_admin = body.is_super_admin;
  }
  const finalIsSuper = typeof patch.is_super_admin === "boolean"
    ? Boolean(patch.is_super_admin)
    : isSuperAdminUser(target);
  const finalIsProjectAdmin = typeof patch.is_project_admin === "boolean"
    ? Boolean(patch.is_project_admin)
    : isProjectAdminUser(target);
  patch.is_admin = finalIsSuper || finalIsProjectAdmin;

  const { error } = await admin.supabase
    .from("user_permissions")
    .update(patch)
    .eq("email", email);

  if (error) {
    return NextResponse.json({ ok: false, error: `Errore Supabase: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

