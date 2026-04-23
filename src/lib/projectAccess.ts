export type UserPermissions = {
  email: string;
  is_admin?: boolean | null;
  is_super_admin?: boolean | null;
  is_project_admin?: boolean | null;
  allowed_projects?: number[] | null;
};

export function normalizeAllowedProjects(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === "number" ? x : Number(x)))
    .filter((n) => Number.isFinite(n));
}

export function isSuperAdminUser(user: UserPermissions | null | undefined): boolean {
  if (!user) return false;
  return Boolean(user.is_super_admin ?? user.is_admin);
}

export function isProjectAdminUser(user: UserPermissions | null | undefined): boolean {
  if (!user) return false;
  return Boolean(user.is_project_admin ?? user.is_admin);
}

