"use client";

import { useEffect, useMemo, useState } from "react";
import { useProjectContext } from "@/lib/projectContext";

type RoomRow = {
  id: number;
  room_number: string;
  room_name_planned: string | null;
  area: number | null;
  parameters: Record<string, unknown> | null;
};

type MappingRow = {
  db_column_name: string;
};

function normalizeParamValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v);
}

export default function RoomInspectorPage() {
  const { selectedProjectId } = useProjectContext();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [mappedParams, setMappedParams] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState<number | null>(null);

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

      if (!roomsJson.ok) throw new Error(roomsJson.error ?? "Errore lettura locali");
      if (!mapsJson.ok) throw new Error(mapsJson.error ?? "Errore lettura mappings");

      const nextRooms = roomsJson.rooms ?? [];
      setRooms(nextRooms);
      setMappedParams((mapsJson.mappings ?? []).map((m) => m.db_column_name));
      if (!nextRooms.some((r) => r.id === selectedRoomId)) {
        setSelectedRoomId(nextRooms[0]?.id ?? null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setSelectedRoomId(null);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId]);

  const filteredRooms = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rooms;
    return rooms.filter((r) =>
      `${r.room_number} ${r.room_name_planned ?? ""}`.toLowerCase().includes(q)
    );
  }, [rooms, search]);

  const selectedRoom = useMemo(
    () => rooms.find((r) => r.id === selectedRoomId) ?? null,
    [rooms, selectedRoomId]
  );

  const detailRows = useMemo(() => {
    const params = selectedRoom?.parameters ?? {};
    const mapped = mappedParams.map((key) => ({
      key,
      value: normalizeParamValue(params[key]),
      isMapped: true,
    }));
    const extras = Object.keys(params)
      .filter((key) => !mappedParams.includes(key))
      .sort((a, b) => a.localeCompare(b))
      .map((key) => ({
        key,
        value: normalizeParamValue(params[key]),
        isMapped: false,
      }));
    return [...mapped, ...extras];
  }, [mappedParams, selectedRoom]);

  return (
    <main className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">🧭 Room Inspector</h1>
        <p className="mt-2 text-slate-600">
          Consulta i parametri associati a ogni locale del progetto selezionato.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Locali</h2>
            <button
              onClick={refresh}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
              disabled={!selectedProjectId}
            >
              Aggiorna
            </button>
          </div>

          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Cerca per numero o nome"
            className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />

          <div className="max-h-[520px] overflow-auto rounded-lg border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">Room</th>
                  <th className="px-3 py-2">Name</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-600" colSpan={2}>
                      Caricamento...
                    </td>
                  </tr>
                ) : filteredRooms.length === 0 ? (
                  <tr>
                    <td className="px-3 py-3 text-slate-600" colSpan={2}>
                      Nessun locale trovato.
                    </td>
                  </tr>
                ) : (
                  filteredRooms.map((r) => (
                    <tr
                      key={r.id}
                      className={[
                        "cursor-pointer border-t border-slate-100 hover:bg-slate-50",
                        selectedRoomId === r.id ? "bg-slate-50" : "",
                      ].join(" ")}
                      onClick={() => setSelectedRoomId(r.id)}
                    >
                      <td className="px-3 py-2 font-mono">{r.room_number}</td>
                      <td className="px-3 py-2">{r.room_name_planned ?? ""}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Dettaglio parametri</h2>
          {selectedRoom ? (
            <>
              <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
                <div>
                  <span className="font-medium">Room:</span> {selectedRoom.room_number}
                </div>
                <div>
                  <span className="font-medium">Name:</span> {selectedRoom.room_name_planned ?? "-"}
                </div>
                <div>
                  <span className="font-medium">Area:</span>{" "}
                  {typeof selectedRoom.area === "number" ? `${selectedRoom.area.toFixed(2)} m²` : "-"}
                </div>
              </div>

              <div className="mt-4 max-h-[520px] overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Parametro</th>
                      <th className="px-3 py-2">Valore</th>
                      <th className="px-3 py-2">Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailRows.length === 0 ? (
                      <tr>
                        <td className="px-3 py-3 text-slate-600" colSpan={3}>
                          Nessun parametro disponibile.
                        </td>
                      </tr>
                    ) : (
                      detailRows.map((row) => (
                        <tr key={row.key} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-mono">{row.key}</td>
                          <td className="px-3 py-2">{row.value || "-"}</td>
                          <td className="px-3 py-2">{row.isMapped ? "Mapped" : "Extra"}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="mt-3 text-sm text-slate-600">Seleziona un locale per vedere i parametri.</div>
          )}
        </section>
      </div>
    </main>
  );
}
