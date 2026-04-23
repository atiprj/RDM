"use client";

import { useEffect, useMemo, useState } from "react";
import { useProjectContext } from "@/lib/projectContext";
import { isProjectAdminUser, isSuperAdminUser } from "@/lib/projectAccess";

type Project = { id: number; project_code: string; project_name: string };
type UserPerm = {
  email: string;
  is_admin?: boolean | null;
  is_super_admin?: boolean | null;
  is_project_admin?: boolean | null;
  allowed_projects: number[] | null;
};

export default function SystemPage() {
  const { projects, refresh: refreshProjects } = useProjectContext();
  const [me, setMe] = useState<UserPerm | null>(null);
  const [users, setUsers] = useState<UserPerm[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const allProjects = useMemo<Project[]>(() => projects as unknown as Project[], [projects]);
  const canManageUsers = isSuperAdminUser(me) || isProjectAdminUser(me);
  const canCreateProjects = isSuperAdminUser(me);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const meRes = await fetch("/api/me", { cache: "no-store" });
      const meJson = (await meRes.json()) as { ok: boolean; user?: any };
      setMe(meJson.user ?? null);

      const uRes = await fetch("/api/system/users", { cache: "no-store" });
      const uJson = (await uRes.json()) as { ok: boolean; users?: UserPerm[]; error?: string };
      if (!uJson.ok) throw new Error(uJson.error ?? "Errore users");
      setUsers(uJson.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createProject(form: HTMLFormElement) {
    const fd = new FormData(form);
    const project_code = String(fd.get("project_code") ?? "").trim();
    const project_name = String(fd.get("project_name") ?? "").trim();
    if (!project_code || !project_name) return setError("Compila codice e nome.");
    const res = await fetch("/api/system/projects", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_code, project_name }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) setError(json.error ?? "Errore creazione progetto.");
    else {
      form.reset();
      await refreshProjects();
      await refresh();
    }
  }

  async function authorizeUser(form: HTMLFormElement) {
    const fd = new FormData(form);
    const email = String(fd.get("email") ?? "").toLowerCase().trim();
    const is_super_admin = Boolean(fd.get("is_super_admin"));
    const is_project_admin = Boolean(fd.get("is_project_admin"));
    if (!email.includes("@")) return setError("Email non valida.");
    const res = await fetch("/api/system/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, is_super_admin, is_project_admin }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) setError(json.error ?? "Errore autorizzazione utente.");
    else {
      form.reset();
      await refresh();
    }
  }

  async function updateUserPermissions(
    email: string,
    allowed_projects: number[],
    rolePatch?: { is_super_admin?: boolean; is_project_admin?: boolean }
  ) {
    const res = await fetch("/api/system/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, allowed_projects, ...rolePatch }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) setError(json.error ?? "Errore aggiornamento permessi.");
    else await refresh();
  }

  if (loading) {
    return <div className="text-slate-600">Caricamento...</div>;
  }

  if (!canManageUsers) {
    return (
      <main className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
        Accesso riservato agli amministratori di progetto o super admin.
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">⚙️ System Management</h1>
        <p className="mt-2 text-slate-600">
          Admin: {me?.email ?? "-"} ({isSuperAdminUser(me) ? "Super Admin" : "Project Admin"})
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">🏗️ Projects Management</h2>
          {!canCreateProjects ? (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Solo il super admin puo creare nuovi progetti.
            </div>
          ) : null}
          <form
            className="mt-4 grid gap-3 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              createProject(e.currentTarget);
            }}
          >
            <input
              name="project_code"
              placeholder="Project Code (es: PRJ-001)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              name="project_name"
              placeholder="Project Name"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="sm:col-span-2">
              <button
                disabled={!canCreateProjects}
                className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                🚀 Create Project
              </button>
            </div>
          </form>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">👥 User Permissions</h2>
          <form
            className="mt-4 grid gap-3 sm:grid-cols-3"
            onSubmit={(e) => {
              e.preventDefault();
              authorizeUser(e.currentTarget);
            }}
          >
            <input
              name="email"
              placeholder="User Email"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
            />
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="is_project_admin" /> Project Admin
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700 sm:col-span-2">
              <input type="checkbox" name="is_super_admin" disabled={!canCreateProjects} /> Super Admin
            </label>
            {!canCreateProjects ? (
              <div className="sm:col-span-3 text-xs text-amber-700">
                I project admin possono gestire utenti e progetti assegnati, ma non assegnare super admin.
              </div>
            ) : null}
            <div className="sm:col-span-3">
              <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">
                ➕ Authorize User
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Project Assignment</h2>
        <p className="mt-1 text-sm text-slate-600">
          Seleziona i progetti consentiti per ciascun utente (come in Streamlit).
        </p>

        <div className="mt-4 space-y-4">
          {users.map((u) => (
            <UserRow
              key={u.email}
              user={u}
              projects={allProjects}
              currentUser={me}
              onSave={updateUserPermissions}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

function UserRow({
  user,
  currentUser,
  projects,
  onSave,
}: {
  user: UserPerm;
  currentUser: UserPerm | null;
  projects: Project[];
  onSave: (
    email: string,
    allowed_projects: number[],
    rolePatch?: { is_super_admin?: boolean; is_project_admin?: boolean }
  ) => Promise<void>;
}) {
  const [selected, setSelected] = useState<number[]>(
    Array.isArray(user.allowed_projects) ? user.allowed_projects : []
  );
  const [isSuperAdmin, setIsSuperAdmin] = useState(Boolean(user.is_super_admin ?? user.is_admin));
  const [isProjectAdmin, setIsProjectAdmin] = useState(Boolean(user.is_project_admin ?? user.is_admin));
  const currentIsSuper = isSuperAdminUser(currentUser);
  const targetIsSuper = isSuperAdminUser(user);
  const canEditTarget = currentIsSuper || !targetIsSuper;

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-medium">{user.email}</div>
          <div className="text-sm text-slate-600">
            {targetIsSuper ? "Super Admin" : isProjectAdmin ? "Project Admin" : "User"}
          </div>
        </div>
        <button
          disabled={!canEditTarget}
          onClick={() =>
            onSave(user.email, selected, {
              is_project_admin: isProjectAdmin,
              ...(currentIsSuper ? { is_super_admin: isSuperAdmin } : {}),
            })
          }
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
        >
          💾 Update Permissions
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isProjectAdmin}
            disabled={!canEditTarget}
            onChange={(e) => setIsProjectAdmin(e.target.checked)}
          />
          Project Admin
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isSuperAdmin}
            disabled={!currentIsSuper || !canEditTarget}
            onChange={(e) => setIsSuperAdmin(e.target.checked)}
          />
          Super Admin
        </label>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => {
          const checked = selected.includes(p.id);
          return (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={checked}
                disabled={!canEditTarget}
                onChange={(e) => {
                  setSelected((prev) =>
                    e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)
                  );
                }}
              />
              {p.project_code} - {p.project_name}
            </label>
          );
        })}
      </div>
    </div>
  );
}

