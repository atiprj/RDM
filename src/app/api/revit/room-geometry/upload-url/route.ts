import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { requireTokenProjectAccess } from "@/lib/apiTokens";
import { GEOMETRY_BUCKET } from "@/lib/roomGeometry";

/**
 * Passo 1 dell'upload dal plugin: restituisce una signed upload URL di Supabase Storage.
 * Il plugin fa PUT del .glb direttamente su Supabase (niente limite di dimensione di Vercel),
 * poi chiama /api/revit/room-geometry/commit.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { projectId?: number; roomNumber?: string } | null;
  const auth = await requireTokenProjectAccess(req, body?.projectId);
  if (!auth.ok) return auth.response;
  const { supabase, projectId } = auth;

  const roomNumber = String(body?.roomNumber ?? "").trim();
  if (!roomNumber) return NextResponse.json({ ok: false, error: "roomNumber mancante" }, { status: 400 });

  const { data: rooms, error } = await supabase
    .from("rooms")
    .select("id")
    .eq("project_id", projectId)
    .eq("room_number", roomNumber)
    .limit(1);
  if (error) return NextResponse.json({ ok: false, error: `Errore Supabase: ${error.message}` }, { status: 500 });
  const room = rooms?.[0];
  if (!room) {
    return NextResponse.json(
      { ok: false, error: `Locale ${roomNumber} non presente nel database del progetto` },
      { status: 404 }
    );
  }

  const path = `${projectId}/${room.id}/${Date.now()}-${randomBytes(4).toString("hex")}.glb`;
  const { data, error: sErr } = await supabase.storage.from(GEOMETRY_BUCKET).createSignedUploadUrl(path);
  if (sErr || !data) {
    return NextResponse.json({ ok: false, error: `Errore Storage: ${sErr?.message ?? "nessuna URL"}` }, { status: 500 });
  }
  return NextResponse.json({ ok: true, roomId: room.id, path, uploadUrl: data.signedUrl });
}
