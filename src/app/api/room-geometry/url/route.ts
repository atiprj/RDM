import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/auth";
import { signedReadUrl } from "@/lib/roomGeometry";

/** Signed URL di lettura per una geometria del progetto (usata dal Compare). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = await requireProjectAccess(url.searchParams.get("projectId"));
  if (!auth.ok) return auth.response;
  const { supabase, projectId } = auth;

  const geometryId = Number(url.searchParams.get("geometryId"));
  if (!Number.isFinite(geometryId) || geometryId <= 0) {
    return NextResponse.json({ ok: false, error: "geometryId non valido" }, { status: 400 });
  }
  const { data, error } = await supabase
    .from("room_geometries")
    .select("glb_path")
    .eq("project_id", projectId)
    .eq("id", geometryId)
    .limit(1);
  if (error) return NextResponse.json({ ok: false, error: `Errore Supabase: ${error.message}` }, { status: 500 });
  const row = data?.[0];
  if (!row) return NextResponse.json({ ok: false, error: "Geometria non trovata" }, { status: 404 });

  const signed = await signedReadUrl(supabase, row.glb_path);
  if (!signed) return NextResponse.json({ ok: false, error: "Impossibile generare la URL del file" }, { status: 500 });
  return NextResponse.json({ ok: true, url: signed });
}
