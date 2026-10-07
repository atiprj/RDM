import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { isSuperAdminUser } from "@/lib/projectAccess";
import { generateToken } from "@/lib/apiTokens";

const MAX_TOKENS_PER_USER = 10;
const COLUMNS = "id,email,label,token_prefix,created_at,last_used_at";

/** Elenco token: i propri; con ?all=1 un super admin li vede tutti. */
export async function GET(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;
  const isSuper = isSuperAdminUser(user);
  const all = new URL(req.url).searchParams.get("all") === "1";

  let q = supabase.from("api_tokens").select(COLUMNS).order("created_at", { ascending: false });
  if (!(all && isSuper)) q = q.eq("email", user.email.toLowerCase());
  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ ok: false, error: `Errore Supabase: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, tokens: data ?? [], canDelete: isSuper });
}

/** Crea un token per l'utente loggato. Il valore in chiaro viene restituito solo qui. */
export async function POST(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  const { supabase, user } = auth;
  const body = (await req.json().catch(() => null)) as { label?: string } | null;
  const label = String(body?.label ?? "").trim().slice(0, 80) || "Revit";
  const email = user.email.toLowerCase();

  const { count, error: cErr } = await supabase
    .from("api_tokens")
    .select("id", { count: "exact", head: true })
    .eq("email", email);
  if (cErr) {
    return NextResponse.json({ ok: false, error: `Errore Supabase: ${cErr.message}` }, { status: 500 });
  }
  if ((count ?? 0) >= MAX_TOKENS_PER_USER) {
    return NextResponse.json(
      { ok: false, error: `Massimo ${MAX_TOKENS_PER_USER} token per utente. Chiedi a un super admin di eliminarne uno.` },
      { status: 400 }
    );
  }

  const { token, hash, prefix } = generateToken();
  const { data, error } = await supabase
    .from("api_tokens")
    .insert({ email, label, token_hash: hash, token_prefix: prefix })
    .select(COLUMNS)
    .single();
  if (error) {
    return NextResponse.json({ ok: false, error: `Errore Supabase: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, token, record: data });
}

/** Elimina un token: solo super admin. */
export async function DELETE(req: Request) {
  const auth = await requireUser();
  if (!auth.ok) return auth.response;
  if (!isSuperAdminUser(auth.user)) {
    return NextResponse.json({ ok: false, error: "Solo un super admin può eliminare i token." }, { status: 403 });
  }
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ ok: false, error: "id non valido" }, { status: 400 });
  }
  const { error } = await auth.supabase.from("api_tokens").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: `Errore Supabase: ${error.message}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
