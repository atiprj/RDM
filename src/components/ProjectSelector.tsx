"use client";

import { useProjectContext } from "@/lib/projectContext";
import { useUiPrefs } from "@/lib/uiPrefs";

export function ProjectSelector() {
  const { projects, loading, selectedProjectId, setSelectedProjectId } = useProjectContext();
  const { t } = useUiPrefs();

  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-slate-600">{t("projectLabel")}</span>
      <select
        className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
        disabled={loading || !projects.length}
        value={selectedProjectId ?? ""}
        onChange={(e) => {
          const v = e.target.value;
          setSelectedProjectId(v ? Number(v) : null);
        }}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.project_code} - {p.project_name}
          </option>
        ))}
      </select>
    </div>
  );
}

