"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { useProjectContext } from "@/lib/projectContext";

type RoomRow = {
  id: number;
  project_id: number;
  room_number: string;
  room_name_planned: string | null;
  area: number | null;
  parameters: Record<string, unknown> | null;
  is_synced: boolean | null;
  last_sync_at: string | null;
};

type MappingRow = { db_column_name: string };
const IMPORT_CHUNK_SIZE = 100;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatLastSync(v: string | null) {
  if (!v) return "Mai";
  try {
    return new Date(v).toLocaleString("it-IT");
  } catch {
    return String(v);
  }
}

function statusIcon(room: RoomRow) {
  if (room.is_synced === true) return "✅";
  if (room.is_synced === false && room.last_sync_at) return "⚠️";
  if (room.is_synced == null && room.last_sync_at) return "❗";
  return "❌";
}

export default function RoomsPage() {
  const { selectedProjectId } = useProjectContext();
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [mappedParams, setMappedParams] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Record<number, boolean>>({});

  const filteredRooms = useMemo(() => {
    if (!search.trim()) return rooms;
    const q = search.trim().toLowerCase();
    return rooms.filter((r) => {
      const hay = [
        r.room_number,
        r.room_name_planned ?? "",
        String(r.area ?? ""),
        formatLastSync(r.last_sync_at),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rooms, search]);

  async function refresh() {
    if (!selectedProjectId) return;
    setLoading(true);
    setError(null);
    try {
      const [roomsRes, mapsRes] = await Promise.all([
        fetch(`/api/rooms?projectId=${selectedProjectId}`, { cache: "no-store" }),
        fetch(`/api/mappings?projectId=${selectedProjectId}`, { cache: "no-store" }),
      ]);
      const roomsJson = (await roomsRes.json()) as { ok: boolean; rooms?: RoomRow[]; error?: string };
      const mapsJson = (await mapsRes.json()) as {
        ok: boolean;
        mappings?: MappingRow[];
        error?: string;
      };

      if (!roomsJson.ok) throw new Error(roomsJson.error ?? "Errore rooms");
      if (!mapsJson.ok) throw new Error(mapsJson.error ?? "Errore mappings");

      setRooms(roomsJson.rooms ?? []);
      setSelectedIds({});
      setMappedParams((mapsJson.mappings ?? []).map((m) => m.db_column_name));
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

  async function createRoom(form: HTMLFormElement) {
    if (!selectedProjectId) return;
    const fd = new FormData(form);
    const room_number = String(fd.get("room_number") ?? "").trim();
    const room_name_planned = String(fd.get("room_name_planned") ?? "").trim();
    if (!room_number) {
      setError("Il numero stanza è obbligatorio.");
      return;
    }
    setError(null);
    const res = await fetch("/api/rooms", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project_id: selectedProjectId, room_number, room_name_planned }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) setError(json.error ?? "Errore creazione stanza.");
    else {
      form.reset();
      await refresh();
    }
  }

  async function exportExcel() {
    if (!selectedProjectId) return;
    const res = await fetch(`/api/rooms/export?projectId=${selectedProjectId}`);
    if (!res.ok) {
      setError("Errore export.");
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rooms_proj_${selectedProjectId}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadTemplate() {
    if (!selectedProjectId) return;
    const header = ["Number", "Name", "Area", ...mappedParams];
    const ws = XLSX.utils.aoa_to_sheet([header]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Template");
    XLSX.writeFile(wb, `rooms_template_proj_${selectedProjectId}.xlsx`);
  }

  async function importExcel(file: File) {
    if (!selectedProjectId) return;
    setError(null);
    setNotice(null);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });

    const payload = rows.map((row) => row);
    let importedRows = 0;
    const failedRooms: { room_number: string; reason?: string }[] = [];
    for (let i = 0; i < payload.length; i += IMPORT_CHUNK_SIZE) {
      const chunk = payload.slice(i, i + IMPORT_CHUNK_SIZE);
      let ok = false;
      let lastErr = "Errore import.";
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        const res = await fetch("/api/rooms/import", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ projectId: selectedProjectId, rows: chunk }),
        });
        const json = (await res.json()) as {
          ok: boolean;
          error?: string;
          synced?: number;
          failed_count?: number;
          failed_rooms?: { room_number?: string; reason?: string }[];
        };
        if (json.ok) {
          importedRows += Number(json.synced ?? 0);
          for (const fr of json.failed_rooms ?? []) {
            const rn = String(fr.room_number ?? "").trim();
            if (rn) failedRooms.push({ room_number: rn, reason: fr.reason });
          }
          ok = true;
          break;
        }
        lastErr = json.error ?? "Errore import.";
        if (attempt < 3) await sleep(300 * attempt);
      }
      if (!ok) {
        const chunkIdx = Math.floor(i / IMPORT_CHUNK_SIZE) + 1;
        const chunkTot = Math.ceil(payload.length / IMPORT_CHUNK_SIZE);
        setError(`${lastErr} (batch ${chunkIdx}/${chunkTot})`);
        return;
      }
    }
    if (failedRooms.length) {
      const preview = failedRooms
        .slice(0, 5)
        .map((x) => (x.reason ? `${x.room_number} (${x.reason})` : x.room_number))
        .join(", ");
      const suffix = failedRooms.length > 5 ? ", ..." : "";
      setNotice(
        `Import parziale: ${importedRows} righe sincronizzate, ${failedRooms.length} fallite. Esempi: ${preview}${suffix}`
      );
    } else {
      setNotice(`Import completato: ${importedRows} righe sincronizzate.`);
    }
    await refresh();
  }

  async function deleteSelected() {
    const ids = Object.entries(selectedIds)
      .filter(([, v]) => v)
      .map(([k]) => Number(k));
    if (!ids.length) {
      setError("Nessun locale selezionato.");
      return;
    }
    const qs = ids.map((id) => `id=${encodeURIComponent(String(id))}`).join("&");
    const res = await fetch(`/api/rooms?${qs}`, { method: "DELETE" });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) {
      setError(json.error ?? "Errore eliminazione locali.");
    } else {
      await refresh();
    }
  }

  async function deleteAllRooms() {
    if (!selectedProjectId) return;
    if (!rooms.length) {
      setError("Non ci sono locali da eliminare.");
      return;
    }
    const confirmed = window.confirm(
      `Vuoi davvero eliminare tutti i ${rooms.length} locali del progetto corrente?`
    );
    if (!confirmed) return;

    setError(null);
    setNotice(null);
    const res = await fetch(`/api/rooms?all=true&projectId=${selectedProjectId}`, { method: "DELETE" });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) {
      setError(json.error ?? "Errore eliminazione totale locali.");
    } else {
      setNotice("Tutti i locali del progetto sono stati eliminati.");
      await refresh();
    }
  }

  return (
    <main className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">📍 Rooms Management</h1>
        <p className="mt-2 text-slate-600">Project ID: {selectedProjectId ?? "-"}</p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}
      {notice ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
          {notice}
        </div>
      ) : null}

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">📥 Import / Export Rooms</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="space-y-3">
            <div className="text-sm font-medium">Export Rooms</div>
            <button
              onClick={exportExcel}
              className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
              disabled={!selectedProjectId}
            >
              ⬇️ Download Excel
            </button>
            <div className="pt-2 text-sm font-medium">Template vuoto</div>
            <button
              onClick={downloadTemplate}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
              disabled={!selectedProjectId}
            >
              📄 Download Template
            </button>
          </div>

          <div className="space-y-3">
            <div className="text-sm font-medium">Import Rooms</div>
            <input
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importExcel(f);
              }}
            />
            <div className="text-xs text-slate-600">
              Usa colonne: <span className="font-mono">Number</span>, <span className="font-mono">Name</span>,{" "}
              <span className="font-mono">Area</span> + parametri mappati.
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">➕ Add Single Room</h2>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-3"
          onSubmit={(e) => {
            e.preventDefault();
            createRoom(e.currentTarget);
          }}
        >
          <input
            name="room_number"
            placeholder="Room Number* (es: 101)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <input
            name="room_name_planned"
            placeholder="Room Name (es: Ufficio)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm sm:col-span-2"
          />
          <div className="sm:col-span-3">
            <button className="rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800">
              💾 Save Room
            </button>
          </div>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">📋 Current Rooms</h2>
            <div className="mt-1 text-sm text-slate-600">
              Status: ✅ Sincronizzato | ⚠️ Modificato Web | ❗ Non in Revit | ❌ Mai Sincronizzato
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={deleteSelected}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
            >
              🗑️ Delete Selected Rooms
            </button>
            <button
              onClick={deleteAllRooms}
              className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 hover:bg-red-100"
              disabled={!selectedProjectId || rooms.length === 0}
            >
              🧨 Elimina tutti i locali
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Filtra locali..."
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm sm:max-w-md"
          />
          <button
            onClick={refresh}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
          >
            Aggiorna
          </button>
        </div>

        <div className="mt-4 overflow-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Del</th>
                <th className="px-3 py-2">Sync</th>
                <th className="px-3 py-2">Number</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Area (m²)</th>
                <th className="px-3 py-2">Last Sync</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-3 text-slate-600" colSpan={5}>
                    Caricamento...
                  </td>
                </tr>
              ) : filteredRooms.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-600" colSpan={5}>
                    Nessun locale. Usa il form o import Excel.
                  </td>
                </tr>
              ) : (
                filteredRooms.map((r) => (
                  <tr key={r.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedIds[r.id])}
                        onChange={(e) =>
                          setSelectedIds((prev) => ({ ...prev, [r.id]: e.target.checked }))
                        }
                      />
                    </td>
                    <td className="px-3 py-2">{statusIcon(r)}</td>
                    <td className="px-3 py-2">{r.room_number}</td>
                    <td className="px-3 py-2">{r.room_name_planned ?? ""}</td>
                    <td className="px-3 py-2">{typeof r.area === "number" ? r.area.toFixed(2) : ""}</td>
                    <td className="px-3 py-2">{formatLastSync(r.last_sync_at)}</td>
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

