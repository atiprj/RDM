/** Direzione di sincronizzazione di un parametro mappato. */
export type MappingDirection = "web_to_revit" | "revit_to_web";

export const DEFAULT_DIRECTION: MappingDirection = "web_to_revit";

export const DIRECTION_LABELS: Record<MappingDirection, string> = {
  web_to_revit: "Web → Revit",
  revit_to_web: "Revit → Web",
};

/** Accetta il valore tecnico o forme libere da Excel ("Revit → Web", "revit", "r2w"...). null se vuoto/non riconosciuto. */
export function parseDirection(v: unknown): MappingDirection | null {
  const s = String(v ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s→>\-_]+/g, "");
  if (!s) return null;
  if (["revittoweb", "revitweb", "revit", "r2w", "rw", "push"].includes(s)) return "revit_to_web";
  if (["webtorevit", "webrevit", "web", "w2r", "wr", "pull"].includes(s)) return "web_to_revit";
  return null;
}
