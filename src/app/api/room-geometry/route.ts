import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/auth";
import {
  GEOMETRY_COLUMNS,
  SR_CODE_KEY,
  normalizeSrCode,
  signedReadUrl,
  type GeometryRow,
} from "@/lib/roomGeometry";

type RoomLite = { id: number; room_number: string; room_name_planned: string | null; area: number | null };

/**
 * Geometrie per il viewer di Room Inspector.
 * GET ?projectId=&roomId= →
 *   srCode: tipo SR del locale;
 *   main: geometria Main di quel tipo (con signed URL);
 *   candidates: locali dello stesso tipo SR con geometria (per il Compare).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const auth = await requireProjectAccess(url.searchParams.get("projectId"));
  if (!auth.ok) return auth.response;
  const { supabase, projectId } = auth;

  const roomId = Number(url.searchParams.get("roomId"));
  if (!Number.isFinite(roomId) || roomId <= 0) {
    return NextResponse.json({ ok: false, error: "roomId non valido" }, { status: 400 });
  }

  const { data: roomRows, error: rErr } = await supabase
    .from("rooms")
    .select("id,parameters")
    .eq("project_id", projectId)
    .eq("id", roomId)
    .limit(1);
  if (rErr) return NextResponse.json({ ok: false, error: `Errore Supabase: ${rErr.message}` }, { status: 500 });
  const room = roomRows?.[0];
  if (!room) return NextResponse.json({ ok: false, error: "Locale non trovato" }, { status: 404 });

  const { data: ownRows } = await supabase.from("room_geometries").select(GEOMETRY_COLUMNS).eq("room_id", roomId).limit(1);
  const own = (ownRows?.[0] ?? null) as GeometryRow | null;

  const params = (room.parameters ?? {}) as Record<string, unknown>;
  const srCode = normalizeSrCode(params[SR_CODE_KEY]) ?? own?.sr_code ?? null;
  if (!srCode) {
    return NextResponse.json({ ok: true, srCode: null, main: null, candidates: [], ownGeometryId: own?.id ?? null });
  }

  const { data: geoRows, error: gErr } = await supabase
    .from("room_geometries")
    .select(GEOMETRY_COLUMNS)
    .eq("project_id", projectId)
    .eq("sr_code", srCode);
  if (gErr) return NextResponse.json({ ok: false, error: `Errore Supabase: ${gErr.message}` }, { status: 500 });
  const geos = (geoRows ?? []) as GeometryRow[];

  const roomIds = geos.map((g) => g.room_id);
  const roomsById = new Map<number, RoomLite>();
  if (roomIds.length) {
    const { data: rl, error } = await supabase
      .from("rooms")
      .select("id,room_number,room_name_planned,area")
      .in("id", roomIds);
    if (error) return NextResponse.json({ ok: false, error: `Errore Supabase: ${error.message}` }, { status: 500 });
    for (const r of (rl ?? []) as RoomLite[]) roomsById.set(r.id, r);
  }

  const candidates = geos
    .map((g) => {
      const r = roomsById.get(g.room_id);
      return {
        geometryId: g.id,
        roomId: g.room_id,
        roomNumber: r?.room_number ?? "?",
        roomName: r?.room_name_planned ?? null,
        roomArea: r?.area ?? null,
        isMain: g.is_main,
        elementCount: g.element_count,
        exportedAt: g.exported_at,
        exportedBy: g.exported_by,
      };
    })
    .sort((a, b) => Number(b.isMain) - Number(a.isMain) || a.roomNumber.localeCompare(b.roomNumber, "it", { numeric: true }));

  const mainGeo = geos.find((g) => g.is_main) ?? null;
  let main = null;
  if (mainGeo) {
    const c = candidates.find((x) => x.geometryId === mainGeo.id)!;
    main = { ...c, url: await signedReadUrl(supabase, mainGeo.glb_path) };
  }

  return NextResponse.json({ ok: true, srCode, main, candidates, ownGeometryId: own?.id ?? null });
}
