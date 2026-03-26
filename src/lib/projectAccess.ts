export type UserPermissions = {
  email: string;
  is_admin?: boolean | null;
  allowed_projects?: number[] | null;
};

export function normalizeAllowedProjects(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "number" ? x : Number(x)))
    .filter((n) => Number.isFinite(n));
}

