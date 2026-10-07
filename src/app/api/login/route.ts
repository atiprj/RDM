import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseServer";
import { SESSION_COOKIE, createSessionValue, sessionCookieOptions } from "@/lib/session";

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

  let sessionValue: string;
  try {
    sessionValue = createSessionValue(email);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Errore sessione" },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ ok: true, user });
  // Prima il cookie veniva impostato solo con "Ricordami": senza, il login non restava attivo.
  res.cookies.set(SESSION_COOKIE, sessionValue, sessionCookieOptions(rememberMe));
  return res;
}

