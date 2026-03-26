"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

type Project = { id: number; project_code: string; project_name: string; [k: string]: unknown };

type ProjectContextValue = {
  projects: Project[];
  isAdmin: boolean;
  loading: boolean;
  selectedProjectId: number | null;
  setSelectedProjectId: (id: number | null) => void;
  refresh: () => Promise<void>;
};

const Ctx = createContext<ProjectContextValue | null>(null);

const LS_KEY = "selected_project_id";

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedProjectId, _setSelectedProjectId] = useState<number | null>(null);

  const setSelectedProjectId = useCallback((id: number | null) => {
    _setSelectedProjectId(id);
    try {
      if (id == null) localStorage.removeItem(LS_KEY);
      else localStorage.setItem(LS_KEY, String(id));
    } catch {
      // ignore
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/projects", { cache: "no-store" });
      if (!res.ok) {
        setProjects([]);
        setIsAdmin(false);
        return;
      }
      const json = (await res.json()) as { ok: boolean; projects: Project[]; isAdmin: boolean };
      setProjects(json.projects ?? []);
      setIsAdmin(Boolean(json.isAdmin));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) _setSelectedProjectId(Number(raw));
    } catch {
      // ignore
    }
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (loading) return;
    if (!projects.length) {
      if (selectedProjectId != null) setSelectedProjectId(null);
      return;
    }
    if (selectedProjectId == null) {
      setSelectedProjectId(projects[0]!.id);
      return;
    }
    if (!projects.some((p) => p.id === selectedProjectId)) {
      setSelectedProjectId(projects[0]!.id);
    }
  }, [loading, projects, selectedProjectId, setSelectedProjectId]);

  const value = useMemo<ProjectContextValue>(
    () => ({
      projects,
      isAdmin,
      loading,
      selectedProjectId,
      setSelectedProjectId,
      refresh,
    }),
    [projects, isAdmin, loading, selectedProjectId, setSelectedProjectId, refresh]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProjectContext() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProjectContext must be used within ProjectProvider");
  return v;
}

