import { NextResponse } from "next/server";
import { requireTokenProjectAccess } from "@/lib/apiTokens";
import { GEOMETRY_BUCKET, GEOMETRY_COLUMNS, SR_CODE_KEY, normalizeSrCode, type GeometryRow } from "@/lib/roomGeometry";

type Body = {
  projectId?: number;
  roomNumber?: string;
  path?: string;
  srCode?: string | null;
  isMain?: boolean;
  elementCount?: number;
  area?: number;
  revitFile?: string;
};

/**
 * Passo 2 dell'upload dal plugin: registra il .glb appena caricato come geometria del locale.
 * - una sola riga per locale (la nuova sostituisce la vecchia, il file precedente viene eliminato);
 * - se isMain, la Main precedente dello stesso tipo SR nel progetto perde il flag.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Body | null;
  const auth = await requireTokenProjectAccess(req, body?.projectId);
  if (!auth.ok) return auth.response;
  const { supabase, projectId, user } = auth;

  const roomNumber = String(body?.roomNumber ?? "").trim();
  const path = String(body?.path ?? "");
  if (!roomNumber || !path) {
    return NextResponse.json({ ok: false, error: "roomNumber e path obbligatori" }, { status: 400 });
  }

  const { data: rooms, error: rErr } = await supabase
    .from("rooms")
    .select("id,parameters")
    .eq("project_id", projectId)
    .eq("room_number", roomNumber)
    .limit(1);
  if (rErr) return NextResponse.json({ ok: false, error: `Errore Supabase: ${rErr.message}` }, { status: 500 });
  const room = rooms?.[0];
  if (!room) return NextResponse.json({ ok: false, error: `Locale ${roomNumber} non trovato` }, { status: 404 });

  // Il path deve essere quello generato per questo progetto/locale.
  const folder = `${projectId}/${room.id}`;
  const fileName = path.slice(folder.length + 1);
  if (!path.startsWith(`${folder}/`) || !/^[0-9]+-[0-9a-f]{8}\.glb$/.test(fileName)) {
    return NextResponse.json({ ok: false, error: "path non valido per questo locale" }, { status: 400 });
  }
  const { data: listed, error: lErr } = await supabase.storage
    .from(GEOMETRY_BUCKET)
    .list(folder, { search: fileName, limit: 1 });
  if (lErr) return NextResponse.json({ ok: false, error: `Errore Storage: ${lErr.message}` }, { status: 500 });
  const obj = (listed ?? []).find((o) => o.name === fileName);
  if (!obj) return NextResponse.json({ ok: false, error: "File non trovato nello storage: upload non riuscito?" }, { status: 400 });
  const size = Number((obj.metadata as { size?: number } | null)?.size ?? 0) || null;

  // Tipo SR: dal database (parametri sincronizzati), altrimenti quello letto in Revit.
  const params = (room.parameters ?? {}) as Record<string, unknown>;
  const srCode = normalizeSrCode(params[SR_CODE_KEY]) ?? normalizeSrCode(body?.srCode);
  const isMain = Boolean(body?.isMain) && srCode != null;
  const warnings: string[] = [];
  if (body?.isMain && !srCode) warnings.push("SR_Main valorizzato ma SR_Code vuoto: il locale non è stato marcato come Main.");
  const revitSr = normalizeSrCode(body?.srCode);
  if (revitSr && srCode && revitSr !== srCode) {
    warnings.push(`SR_Code in Revit (${revitSr}) diverso dal database (${srCode}): usato quello del database.`);
  }

  const { data: prevRows } = await supabase.from("room_geometries").select(GEOMETRY_COLUMNS).eq("room_id", room.id).limit(1);
  const prev = (prevRows?.[0] ?? null) as GeometryRow | null;

  if (isMain) {
    const { data: oldMains, error: mErr } = await supabase
      .from("room_geometries")
      .update({ is_main: false })
      .eq("project_id", projectId)
      .eq("sr_code", srCode)
      .eq("is_main", true)
      .neq("room_id", room.id)
      .select("room_id");
    if (mErr) return NextResponse.json({ ok: false, error: `Errore Supabase: ${mErr.message}` }, { status: 500 });
    if (oldMains?.length) warnings.push(`La Main precedente del tipo ${srCode} è stata sostituita da questo locale.`);
  }

  const row = {
    project_id: projectId,
    room_id: room.id,
    sr_code: srCode,
    is_main: isMain,
    glb_path: path,
    glb_bytes: size,
    element_count: Number.isFinite(Number(body?.elementCount)) ? Number(body?.elementCount) : null,
    area: Number.isFinite(Number(body?.area)) ? Number(body?.area) : null,
    exported_by: user.email,
    exported_at: new Date().toISOString(),
    revit_file: body?.revitFile ? String(body.revitFile).slice(0, 255) : null,
  };
  const { data: saved, error: uErr } = await supabase
    .from("room_geometries")
    .upsert(row, { onConflict: "room_id" })
    .select(GEOMETRY_COLUMNS)
    .single();
  if (uErr) return NextResponse.json({ ok: false, error: `Errore Supabase: ${uErr.message}` }, { status: 500 });

  if (prev && prev.glb_path !== path) {
    await supabase.storage.from(GEOMETRY_BUCKET).remove([prev.glb_path]);
  }

  return NextResponse.json({ ok: true, geometry: saved, warnings });
}
