"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useProjectContext } from "@/lib/projectContext";

type Item = { id: number; item_code: string; item_description: string | null };

export default function ItemCatalogPage() {
  const { selectedProjectId } = useProjectContext();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<Item[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({});

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.trim().toLowerCase();
    return items.filter((i) => `${i.item_code} ${i.item_description ?? ""}`.toLowerCase().includes(q));
  }, [items, search]);

  async function refresh() {
    if (!selectedProjectId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/items?projectId=${selectedProjectId}`, { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; items?: Item[]; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Errore items");
      setItems(json.items ?? []);
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
    const res = await fetch(`/api/items/export?projectId=${selectedProjectId}`);
    if (!res.ok) return setError("Errore export.");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `catalog_proj_${selectedProjectId}.xlsx`;
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
      item_code: String(r["item_code"] ?? "").trim(),
      item_description: String(r["item_description"] ?? "").trim(),
    }));
    const res = await fetch("/api/items/import", {
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
    const item_code = String(fd.get("item_code") ?? "").trim();
    const item_description = String(fd.get("item_description") ?? "").trim();
    if (!item_code) return setError("item_code obbligatorio.");
    const res = await fetch("/api/items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: selectedProjectId, item_code, item_description }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) setError(json.error ?? "Errore inserimento item.");
    else {
      form.reset();
      await refresh();
    }
  }

  async function deleteSelected() {
    const ids = Object.entries(selectedIds).filter(([, v]) => v).map(([k]) => Number(k));
    if (!ids.length) return setError("Nessun item selezionato.");
    const qs = ids.map((id) => `id=${encodeURIComponent(String(id))}`).join("&");
    const res = await fetch(`/api/items?${qs}`, { method: "DELETE" });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) setError(json.error ?? "Errore delete.");
    else await refresh();
  }

  return (
    <main className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">📦 Item Catalog Management</h1>
        <p className="mt-2 text-slate-600">Project ID: {selectedProjectId ?? "-"}</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">📥 Import / Export Catalog Items</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <div className="text-sm font-medium">Export Catalog</div>
            <button
              onClick={exportExcel}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
              disabled={!selectedProjectId}
            >
              ⬇️ Download Item Catalog
            </button>
          </div>
          <div className="space-y-3">
            <div className="text-sm font-medium">Import/Sync Catalog</div>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importExcel(f);
              }}
            />
            <div className="text-xs text-slate-600">
              Colonne richieste: <span className="font-mono">item_code</span>,{" "}
              <span className="font-mono">item_description</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">➕ Add New Item Manually</h2>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            addSingle(e.currentTarget);
          }}
        >
          <input
            name="item_code"
            placeholder="Code"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="item_description"
            placeholder="Description"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
          />
          <div className="sm:col-span-3">
            <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">
              Save Item
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">📋 Items</h2>
          <div className="flex gap-2">
            <button
              onClick={deleteSelected}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
            >
              🗑️ Delete Selected
            </button>
            <button
              onClick={refresh}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
            >
              Aggiorna
            </button>
          </div>
        </div>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Filter Items Table..."
          className="mt-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-md"
        />

        <div className="mt-4 overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Sel</th>
                <th className="px-3 py-2">Code</th>
                <th className="px-3 py-2">Description</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-3 text-slate-600" colSpan={3}>
                    Caricamento...
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-600" colSpan={3}>
                    Catalogo vuoto.
                  </td>
                </tr>
              ) : (
                filtered.map((i) => (
                  <tr key={i.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedIds[i.id])}
                        onChange={(e) =>
                          setSelectedIds((prev) => ({ ...prev, [i.id]: e.target.checked }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{i.item_code}</td>
                    <td className="px-3 py-2">{i.item_description ?? ""}</td>
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

