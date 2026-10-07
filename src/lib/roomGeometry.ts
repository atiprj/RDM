import type { SupabaseClient } from "@supabase/supabase-js";

/** Bucket privato con i .glb dei locali. */
export const GEOMETRY_BUCKET = "room-geometry";
/** Chiave in rooms.parameters / parameter_mappings.db_column_name con il tipo di standard room. */
export const SR_CODE_KEY = "SR_Code";
/** Nome del parametro Revit (o db_column_name mappato) che marca la Main. */
export const SR_MAIN_KEY = "SR_Main";
/** Durata delle signed URL di lettura (secondi). */
export const SIGNED_URL_TTL = 60 * 60;

export type GeometryRow = {
  id: number;
  project_id: number;
  room_id: number;
  sr_code: string | null;
  is_main: boolean;
  glb_path: string;
  glb_bytes: number | null;
  element_count: number | null;
  area: number | null;
  exported_by: string | null;
  exported_at: string;
  revit_file: string | null;
};

export const GEOMETRY_COLUMNS =
  "id,project_id,room_id,sr_code,is_main,glb_path,glb_bytes,element_count,area,exported_by,exported_at,revit_file";

export function normalizeSrCode(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

/** Valore "vero" di SR_Main: qualsiasi valore non vuoto, tranne no/false/0. */
export function isMainValue(v: unknown): boolean {
  if (v == null) return false;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  return s !== "" && !["0", "no", "false", "falso", "n"].includes(s);
}

export async function signedReadUrl(supabase: SupabaseClient, path: string): Promise<string | null> {
  const { data, error } = await supabase.storage.from(GEOMETRY_BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
  if (error) return null;
  return data?.signedUrl ?? null;
}
