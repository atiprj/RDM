"use client";

import { useEffect, useMemo, useState } from "react";
import { useProjectContext } from "@/lib/projectContext";

type RoomRow = { id: number; parameters?: Record<string, unknown> | null; [k: string]: unknown };

function parseArea(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const s = String(value).replace(",", ".");
  const match = s.match(/[-+]?\d*\.?\d+/);
  return match ? Number(match[0]) : 0;
}

export default function ProjectOverviewPage() {
  const { selectedProjectId } = useProjectContext();
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<RoomRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selectedProjectId) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/rooms?projectId=${selectedProjectId}`, { cache: "no-store" });
        const json = (await res.json()) as { ok: boolean; rooms?: RoomRow[]; error?: string };
        if (!json.ok) {
          setError(json.error ?? "Errore caricamento rooms.");
          return;
        }
        if (!cancelled) setRooms(json.rooms ?? []);
      } catch {
        if (!cancelled) setError("Errore di rete.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [selectedProjectId]);

  const metrics = useMemo(() => {
    const roomsCount = rooms.length;
    const areaSum = rooms.reduce((acc, r) => acc + parseArea((r as any).area ?? (r as any).Area), 0);
    const synced = rooms.filter((r) => (r as any).is_synced === true).length;
    const webEdited = rooms.filter((r) => (r as any).is_synced === false && Boolean((r as any).last_sync_at)).length;
    const missingInRevit = rooms.filter((r) => (r as any).is_synced == null && Boolean((r as any).last_sync_at)).length;
    const neverSynced = rooms.filter((r) => (r as any).is_synced !== true && !(r as any).last_sync_at).length;
    const syncedPct = roomsCount ? Math.round((synced / roomsCount) * 100) : 0;
    return { roomsCount, areaSum, synced, webEdited, missingInRevit, neverSynced, syncedPct };
  }, [rooms]);

  return (
    <main className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">📊 Project Overview</h1>
        <p className="mt-2 text-slate-600">
          Contesto progetto: <span className="font-medium">{selectedProjectId ?? "-"}</span>
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-600">📍 Locali</div>
          <div className="mt-2 text-2xl font-semibold">{loading ? "…" : metrics.roomsCount}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-600">📐 Superficie Totale</div>
          <div className="mt-2 text-2xl font-semibold">
            {loading ? "…" : `${metrics.areaSum.toFixed(2)} m²`}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-600">✅ Sync completata</div>
          <div className="mt-2 text-2xl font-semibold">{loading ? "…" : `${metrics.syncedPct}%`}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="text-sm text-slate-600">🔍 Filtro</div>
          <div className="mt-2 text-2xl font-semibold">{selectedProjectId ? "Attivo" : "Globale"}</div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">📈 Sync Status</h2>
        <p className="mt-1 text-sm text-slate-600">Distribuzione stato sincronizzazione locali.</p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatusCard label="✅ Synced" value={loading ? "…" : String(metrics.synced)} />
          <StatusCard label="⚠️ Modificato Web" value={loading ? "…" : String(metrics.webEdited)} />
          <StatusCard label="❗ Non in Revit" value={loading ? "…" : String(metrics.missingInRevit)} />
          <StatusCard label="❌ Mai sincronizzato" value={loading ? "…" : String(metrics.neverSynced)} />
        </div>

        {!loading && metrics.roomsCount > 0 ? (
          <div className="mt-6 space-y-3">
            <Bar label="Synced" value={metrics.synced} total={metrics.roomsCount} color="bg-emerald-500" />
            <Bar
              label="Modificato Web"
              value={metrics.webEdited}
              total={metrics.roomsCount}
              color="bg-amber-500"
            />
            <Bar
              label="Non in Revit"
              value={metrics.missingInRevit}
              total={metrics.roomsCount}
              color="bg-orange-500"
            />
            <Bar
              label="Mai sincronizzato"
              value={metrics.neverSynced}
              total={metrics.roomsCount}
              color="bg-slate-500"
            />
          </div>
        ) : null}
      </div>
    </main>
  );
}

function StatusCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-600">{label}</div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function Bar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-slate-600">
          {value} ({pct}%)
        </span>
      </div>
      <div className="h-2 w-full rounded bg-slate-200">
        <div className={`h-2 rounded ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

