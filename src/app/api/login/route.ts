import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as
    | { email?: string; rememberMe?: boolean }
    | null;

  const email = (body?.email ?? "").toLowerCase().trim();
  const rememberMe = Boolean(body?.rememberMe ?? true);

  if (!email) {
    return NextResponse.json({ ok: false, error: "Email mancante." }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("user_permissions")
    .select("*")
    .eq("email", email)
    .limit(1);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "Errore Supabase.", details: error.message },
      { status: 500 }
    );
  }

  const user = data?.[0];
  if (!user) {
    return NextResponse.json({ ok: false, error: "Utente non autorizzato." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true, user });
  if (rememberMe) {
    res.cookies.set("user_email", email, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
  }
  return res;
}

