import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";

export async function GET() {
  const auth = await requireUser();
  if (!auth.ok) {
    return NextResponse.json({ ok: false, user: null }, { status: auth.response.status });
  }
  return NextResponse.json({ ok: true, user: auth.user });
}
