"use client";

import { useEffect, useMemo, useState } from "react";
import { useProjectContext } from "@/lib/projectContext";

type Project = { id: number; project_code: string; project_name: string };
type UserPerm = { email: string; is_admin: boolean; allowed_projects: number[] | null };

export default function SystemPage() {
  const { projects, refresh: refreshProjects } = useProjectContext();
  const [me, setMe] = useState<{ email?: string; is_admin?: boolean } | null>(null);
  const [users, setUsers] = useState<UserPerm[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const allProjects = useMemo<Project[]>(() => projects as unknown as Project[], [projects]);

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
    const is_admin = Boolean(fd.get("is_admin"));
    if (!email.includes("@")) return setError("Email non valida.");
    const res = await fetch("/api/system/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, is_admin }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) setError(json.error ?? "Errore autorizzazione utente.");
    else {
      form.reset();
      await refresh();
    }
  }

  async function updateUserProjects(email: string, allowed_projects: number[]) {
    const res = await fetch("/api/system/users", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, allowed_projects }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) setError(json.error ?? "Errore aggiornamento permessi.");
    else await refresh();
  }

  if (loading) {
    return <div className="text-slate-600">Caricamento...</div>;
  }

  if (!me?.is_admin) {
    return (
      <main className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-800">
        Accesso riservato agli amministratori.
      </main>
    );
  }

  return (
    <main className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">⚙️ System Management</h1>
        <p className="mt-2 text-slate-600">Admin: {me.email}</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">🏗️ Projects Management</h2>
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
              <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">
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
              <input type="checkbox" name="is_admin" /> Admin
            </label>
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
              onSave={updateUserProjects}
            />
          ))}
        </div>
      </div>
    </main>
  );
}

function UserRow({
  user,
  projects,
  onSave,
}: {
  user: UserPerm;
  projects: Project[];
  onSave: (email: string, allowed_projects: number[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<number[]>(
    Array.isArray(user.allowed_projects) ? user.allowed_projects : []
  );

  return (
    <div className="rounded-lg border border-slate-200 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="font-medium">{user.email}</div>
          <div className="text-sm text-slate-600">{user.is_admin ? "Admin" : "User"}</div>
        </div>
        <button
          onClick={() => onSave(user.email, selected)}
          className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
        >
          💾 Update Permissions
        </button>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => {
          const checked = selected.includes(p.id);
          return (
            <label key={p.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={checked}
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

