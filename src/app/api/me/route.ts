import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSupabaseAdmin } from "@/lib/supabaseServer";

export async function GET() {
  const cookieStore = await cookies();
  const email = cookieStore.get("user_email")?.value?.toLowerCase().trim();
  if (!email) {
    return NextResponse.json({ ok: false, user: null }, { status: 401 });
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
    return NextResponse.json({ ok: false, user: null }, { status: 401 });
  }

  return NextResponse.json({ ok: true, user });
}

