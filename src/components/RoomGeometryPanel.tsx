"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ViewerModel } from "@/components/RoomViewer3D";

// Il viewer usa WebGL: va caricato solo nel browser.
const RoomViewer3D = dynamic(() => import("@/components/RoomViewer3D"), {
  ssr: false,
  loading: () => <div className="p-6 text-sm text-slate-600">Caricamento viewer 3D...</div>,
});

const DEMO_MODEL_URL = "/standard-rooms/DEMO-AMB-01/v1.glb";

type Candidate = {
  geometryId: number;
  roomId: number;
  roomNumber: string;
  roomName: string | null;
  roomArea: number | null;
  isMain: boolean;
  elementCount: number | null;
  exportedAt: string;
  exportedBy: string | null;
};

type GeometryResponse = {
  ok: boolean;
  error?: string;
  srCode: string | null;
  main: (Candidate & { url: string | null }) | null;
  candidates: Candidate[];
  ownGeometryId: number | null;
};

function roomLabel(c: Pick<Candidate, "roomNumber" | "roomName">) {
  return `${c.roomNumber}${c.roomName ? ` ${c.roomName}` : ""}`;
}

async function fetchUrl(projectId: number, geometryId: number): Promise<string> {
  const res = await fetch(`/api/room-geometry/url?projectId=${projectId}&geometryId=${geometryId}`, {
    cache: "no-store",
  });
  const json = (await res.json()) as { ok: boolean; url?: string; error?: string };
  if (!json.ok || !json.url) throw new Error(json.error ?? "URL del modello non disponibile");
  return json.url;
}

type Props = { projectId: number; roomId: number };

export default function RoomGeometryPanel({ projectId, roomId }: Props) {
  const [data, setData] = useState<GeometryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [primary, setPrimary] = useState<ViewerModel | null>(null);
  const [primaryId, setPrimaryId] = useState<number | null>(null);
  const [compareId, setCompareId] = useState<number | "">("");
  const [compare, setCompare] = useState<ViewerModel | null>(null);
  const [showDemo, setShowDemo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      setData(null);
      setPrimary(null);
      setPrimaryId(null);
      setCompare(null);
      setCompareId("");
      setShowDemo(false);
      try {
        const res = await fetch(`/api/room-geometry?projectId=${projectId}&roomId=${roomId}`, { cache: "no-store" });
        const json = (await res.json()) as GeometryResponse;
        if (!json.ok) throw new Error(json.error ?? "Errore lettura geometrie");
        if (cancelled) return;
        setData(json);

        // Vista di default: la Main del tipo SR; se manca, la geometria del locale o la prima disponibile.
        const fallback =
          json.candidates.find((c) => c.geometryId === json.ownGeometryId) ?? json.candidates[0] ?? null;
        if (json.main?.url) {
          setPrimary({ url: json.main.url, title: `Main · ${roomLabel(json.main)}`, area: json.main.roomArea });
          setPrimaryId(json.main.geometryId);
        } else if (fallback) {
          const url = await fetchUrl(projectId, fallback.geometryId);
          if (cancelled) return;
          setPrimary({ url, title: roomLabel(fallback), area: fallback.roomArea });
          setPrimaryId(fallback.geometryId);
        }
        // Se il locale selezionato ha una geometria diversa dalla Main, lo propone per il confronto.
        const own = json.ownGeometryId;
        if (own && json.main && own !== json.main.geometryId) setCompareId(own);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Errore");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [projectId, roomId]);

  const options = useMemo(
    () => (data?.candidates ?? []).filter((c) => c.geometryId !== primaryId),
    [data, primaryId]
  );

  async function startCompare() {
    if (compareId === "") return;
    const c = options.find((o) => o.geometryId === compareId);
    if (!c) return;
    try {
      setError(null);
      const url = await fetchUrl(projectId, c.geometryId);
      setCompare({ url, title: `Confronto · ${roomLabel(c)}`, area: c.roomArea });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    }
  }

  if (loading) return <div className="text-sm text-slate-600">Caricamento geometrie...</div>;

  const noGeometry = !primary;

  return (
    <div className="space-y-3">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      {data && !data.srCode ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Il locale non ha un tipo SR. Aggiungi in <b>Mappings</b> la colonna <code>SR_Code</code> collegata al
          parametro Revit del progetto e compila il valore per i locali.
        </div>
      ) : null}

      {data?.srCode && !data.main ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          Nessuna Main esportata per il tipo SR <b>{data.srCode}</b>. In Revit compila <code>SR_Main</code> sul locale di
          riferimento ed esportalo con il comando Export 3D.
          {primary ? " Intanto viene mostrata un'altra geometria dello stesso tipo." : ""}
        </div>
      ) : null}

      {primary && options.length ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">Compare</span>
          <select
            value={compareId}
            onChange={(e) => {
              setCompareId(e.target.value ? Number(e.target.value) : "");
              setCompare(null);
            }}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
          >
            <option value="">Scegli un locale tipo {data?.srCode ?? ""}...</option>
            {options.map((o) => (
              <option key={o.geometryId} value={o.geometryId}>
                {roomLabel(o)}
                {o.isMain ? " (Main)" : ""}
              </option>
            ))}
          </select>
          <button
            onClick={startCompare}
            disabled={compareId === ""}
            className="rounded-lg bg-[var(--accent-600)] px-3 py-1 text-sm text-white hover:bg-[var(--accent-700)] disabled:opacity-50"
          >
            Confronta
          </button>
          {compare ? (
            <button
              onClick={() => setCompare(null)}
              className="rounded-lg border border-slate-300 px-3 py-1 text-sm hover:bg-slate-50"
            >
              Chiudi confronto
            </button>
          ) : null}
        </div>
      ) : null}

      {primary ? (
        <RoomViewer3D main={primary} compare={compare} srCode={data?.srCode ?? null} />
      ) : noGeometry && !showDemo ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
          Nessuna geometria 3D esportata per questo tipo di locale.{" "}
          <button onClick={() => setShowDemo(true)} className="underline">
            Mostra il modello dimostrativo
          </button>
        </div>
      ) : (
        <RoomViewer3D main={{ url: DEMO_MODEL_URL, title: "Modello dimostrativo" }} isDemo />
      )}
    </div>
  );
}
