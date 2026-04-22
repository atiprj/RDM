"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useProjectContext } from "@/lib/projectContext";

type Mapping = { id: number; db_column_name: string; revit_parameter_name: string };

export default function MappingsPage() {
  const { selectedProjectId } = useProjectContext();
  const [loading, setLoading] = useState(true);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({});

  const selectedList = useMemo(
    () => Object.entries(selectedIds).filter(([, v]) => v).map(([k]) => Number(k)),
    [selectedIds]
  );

  async function refresh() {
    if (!selectedProjectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/mappings?projectId=${selectedProjectId}`, { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; mappings?: Mapping[]; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Errore mappings");
      setMappings(json.mappings ?? []);
      setSelectedIds({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  async function exportExcel() {
    if (!selectedProjectId) return;
    const res = await fetch(`/api/mappings/export?projectId=${selectedProjectId}`);
    if (!res.ok) return setError("Errore export.");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mappings_proj_${selectedProjectId}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importExcel(file: File) {
    if (!selectedProjectId) return;
    setError(null);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    const norm = rows.map((r) => ({
      project_id:
        r["project_id"] == null || String(r["project_id"]).trim() === ""
          ? null
          : Number(r["project_id"]),
      project_code: String(r["project_code"] ?? "").trim(),
      db_column_name: String(r["db_column_name"] ?? "").trim(),
      revit_parameter_name: String(r["revit_parameter_name"] ?? "").trim(),
    }));

    const res = await fetch("/api/mappings/import", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId: selectedProjectId, rows: norm }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) setError(json.error ?? "Errore import.");
    else await refresh();
  }

  async function addSingle(form: HTMLFormElement) {
    if (!selectedProjectId) return;
    const fd = new FormData(form);
    const db_column_name = String(fd.get("db_column_name") ?? "").trim();
    const revit_parameter_name = String(fd.get("revit_parameter_name") ?? "").trim();
    if (!db_column_name || !revit_parameter_name) {
      setError("Compila entrambi i campi.");
      return;
    }
    const res = await fetch("/api/mappings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: selectedProjectId, db_column_name, revit_parameter_name }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) setError(json.error ?? "Errore inserimento mapping.");
    else {
      form.reset();
      await refresh();
    }
  }

  async function deleteSelected() {
    if (!selectedList.length) {
      setError("Nessun mapping selezionato.");
      return;
    }
    const qs = selectedList.map((id) => `id=${encodeURIComponent(String(id))}`).join("&");
    const res = await fetch(`/api/mappings?${qs}`, { method: "DELETE" });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) setError(json.error ?? "Errore delete.");
    else await refresh();
  }

  return (
    <main className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">🔗 Revit Parameter Mapping</h1>
        <p className="mt-2 text-slate-600">Project ID: {selectedProjectId ?? "-"}</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">📥 Import / Export Mappings</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <div className="text-sm font-medium">Export Mappings</div>
            <button
              onClick={exportExcel}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
              disabled={!selectedProjectId}
            >
              ⬇️ Download Excel
            </button>
          </div>
          <div className="space-y-3">
            <div className="text-sm font-medium">Import Mappings</div>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importExcel(f);
              }}
            />
            <div className="text-xs text-slate-600">
              Colonne richieste: <span className="font-mono">db_column_name</span>,{" "}
              <span className="font-mono">revit_parameter_name</span>. Opzionali per import multi-progetto:{" "}
              <span className="font-mono">project_id</span> oppure{" "}
              <span className="font-mono">project_code</span>.
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">➕ Add Single Mapping</h2>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            addSingle(e.currentTarget);
          }}
        >
          <input
            name="db_column_name"
            placeholder="Database Column Name (es: finitura_pavimento)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="revit_parameter_name"
            placeholder="Revit Parameter Name (es: Revit_Floor_Finish)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
          />
          <div className="sm:col-span-3">
            <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">
              Save Mapping
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">📋 Current Mappings</h2>
          <button
            onClick={deleteSelected}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
          >
            🗑️ Delete Selected
          </button>
        </div>

        <div className="mt-4 overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Del</th>
                <th className="px-3 py-2">DB column</th>
                <th className="px-3 py-2">Revit parameter</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-3 text-slate-600" colSpan={3}>
                    Caricamento...
                  </td>
                </tr>
              ) : mappings.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-600" colSpan={3}>
                    Nessun mapping. Aggiungi manualmente o importa Excel.
                  </td>
                </tr>
              ) : (
                mappings.map((m) => (
                  <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedIds[m.id])}
                        onChange={(e) =>
                          setSelectedIds((prev) => ({ ...prev, [m.id]: e.target.checked }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{m.db_column_name}</td>
                    <td className="px-3 py-2">{m.revit_parameter_name}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

