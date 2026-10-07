"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { Bounds, OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";

/** Proprietà che l'exporter scrive negli extras di ogni nodo (Three.js le copia in userData). */
export type ElementInfo = {
  uniqueId: string;
  label?: string;
  group?: string;
  category?: string;
  family?: string;
  type?: string;
  is_equipment?: boolean;
  item_code?: string | null;
  params?: Record<string, unknown>;
};

export type StandardRoomInfo = {
  code?: string;
  name?: string;
  version?: number;
  area_std?: number;
  height_std?: number;
  note?: string;
};

const GROUP_ORDER = ["Attrezzature", "Arredi", "Pareti", "Involucro", "Soffitto"];
const WALL_GROUP = "Pareti";
const HIDDEN_BY_DEFAULT = new Set(["Soffitto"]);
const HIGHLIGHT = new THREE.Color("#f59e0b");

/** Risale dalla mesh cliccata al nodo dell'elemento (quello con gli extras). */
function findElementNode(obj: THREE.Object3D | null): THREE.Object3D | null {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (cur.userData && typeof cur.userData.group === "string") return cur;
    cur = cur.parent;
  }
  return null;
}

/** Il raycaster di Three.js colpisce anche gli oggetti nascosti: li scartiamo qui. */
function isShown(obj: THREE.Object3D | null): boolean {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (!cur.visible) return false;
    cur = cur.parent;
  }
  return true;
}

function toInfo(node: THREE.Object3D): ElementInfo {
  return { uniqueId: node.name, ...(node.userData as Omit<ElementInfo, "uniqueId">) };
}

type ModelProps = {
  url: string;
  visibleGroups: Record<string, boolean>;
  selectedId: string | null;
  wallsTransparent: boolean;
  onSelect: (info: ElementInfo | null) => void;
  onLoaded: (groups: Record<string, number>, room: StandardRoomInfo | null) => void;
};

function Model({ url, visibleGroups, selectedId, wallsTransparent, onSelect, onLoaded }: ModelProps) {
  const gltf = useGLTF(url);

  // Copia della scena con materiali propri per ogni mesh, così l'evidenziazione
  // di un elemento non colora anche gli altri che condividono lo stesso materiale.
  const { root, elements } = useMemo(() => {
    const root = gltf.scene.clone(true);
    const elements: THREE.Object3D[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.material = Array.isArray(mesh.material)
          ? mesh.material.map((m) => m.clone())
          : mesh.material.clone();
      }
      if (o.userData && typeof o.userData.group === "string") elements.push(o);
    });
    return { root, elements };
  }, [gltf.scene]);

  useEffect(() => {
    const counts: Record<string, number> = {};
    for (const e of elements) {
      const g = e.userData.group as string;
      counts[g] = (counts[g] ?? 0) + 1;
    }
    const room = (gltf.scene.userData?.standard_room as StandardRoomInfo | undefined) ?? null;
    onLoaded(counts, room);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, gltf.scene]);

  // Visibilità per gruppo
  useEffect(() => {
    for (const e of elements) {
      const g = e.userData.group as string;
      e.visible = visibleGroups[g] ?? !HIDDEN_BY_DEFAULT.has(g);
    }
  }, [elements, visibleGroups]);

  // Pareti trasparenti per vedere l'interno da qualsiasi angolazione
  useEffect(() => {
    for (const e of elements) {
      if (e.userData.group !== WALL_GROUP) continue;
      e.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          m.transparent = wallsTransparent;
          m.opacity = wallsTransparent ? 0.22 : 1;
          m.depthWrite = !wallsTransparent;
          m.needsUpdate = true;
        }
      });
    }
  }, [elements, wallsTransparent]);

  // Evidenziazione dell'elemento selezionato
  useEffect(() => {
    for (const e of elements) {
      const on = e.name === selectedId;
      e.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          const std = m as THREE.MeshStandardMaterial;
          if (std.emissive) {
            std.emissive.copy(on ? HIGHLIGHT : new THREE.Color(0x000000));
            std.emissiveIntensity = on ? 0.45 : 0;
          }
        }
      });
    }
  }, [elements, selectedId]);

  function handleClick(e: ThreeEvent<MouseEvent>) {
    if (e.delta > 4) return; // era un trascinamento della camera, non un clic
    if (!isShown(e.object)) return; // passa all'intersezione successiva
    const node = findElementNode(e.object);
    // Con le pareti trasparenti il clic le attraversa e seleziona ciò che sta dietro.
    if (wallsTransparent && node?.userData.group === WALL_GROUP) return;
    e.stopPropagation();
    onSelect(node ? toInfo(node) : null);
  }

  return (
    <primitive
      object={root}
      onClick={handleClick}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        if (!isShown(e.object)) return;
        e.stopPropagation();
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        document.body.style.cursor = "";
      }}
    />
  );
}

function formatValue(v: unknown): string {
  if (v == null || v === "") return "-";
  if (typeof v === "boolean") return v ? "Sì" : "No";
  return String(v);
}

type Props = {
  /** URL del GLB della standard room. */
  modelUrl: string;
  /** Area reale del locale di progetto (m²), per il confronto con l'area standard. */
  roomArea?: number | null;
  /** True finché il modello è un esempio e non una geometria esportata da Revit. */
  isDemo?: boolean;
};

export default function RoomViewer3D({ modelUrl, roomArea, isDemo }: Props) {
  const [groupCounts, setGroupCounts] = useState<Record<string, number>>({});
  const [visibleGroups, setVisibleGroups] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<ElementInfo | null>(null);
  const [room, setRoom] = useState<StandardRoomInfo | null>(null);
  const [viewKey, setViewKey] = useState(0);
  const [wallsTransparent, setWallsTransparent] = useState(true);

  useEffect(() => {
    setSelected(null);
  }, [modelUrl]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
    };
  }, []);

  const groups = useMemo(() => {
    const names = Object.keys(groupCounts);
    return names.sort((a, b) => {
      const ia = GROUP_ORDER.indexOf(a);
      const ib = GROUP_ORDER.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
    });
  }, [groupCounts]);

  const isVisible = (g: string) => visibleGroups[g] ?? !HIDDEN_BY_DEFAULT.has(g);

  const areaDelta =
    typeof roomArea === "number" && typeof room?.area_std === "number" && room.area_std > 0
      ? ((roomArea - room.area_std) / room.area_std) * 100
      : null;
  const deltaClass =
    areaDelta == null
      ? ""
      : Math.abs(areaDelta) <= 5
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : Math.abs(areaDelta) <= 15
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : "bg-red-50 text-red-700 border-red-200";

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 font-medium text-indigo-700">
          Geometria STANDARD {room?.code ?? ""} {room?.version ? `v${room.version}` : ""} · non è la geometria di
          progetto
        </span>
        {isDemo ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-medium text-amber-700">
            Modello dimostrativo
          </span>
        ) : null}
        {room?.area_std != null ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
            Area standard {room.area_std.toFixed(2)} m²
            {typeof roomArea === "number" ? ` · reale ${roomArea.toFixed(2)} m²` : ""}
          </span>
        ) : null}
        {areaDelta != null ? (
          <span className={`rounded-full border px-3 py-1 font-medium ${deltaClass}`}>
            Scostamento {areaDelta > 0 ? "+" : ""}
            {areaDelta.toFixed(1)}%
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="relative h-[480px] overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
          <Canvas
            key={viewKey}
            camera={{ position: [4, 7, 6], fov: 40, near: 0.05, far: 200 }}
            dpr={[1, 2]}
            onPointerMissed={() => setSelected(null)}
          >
            <color attach="background" args={["#eef2f6"]} />
            <hemisphereLight args={["#ffffff", "#b0b8c0", 0.9]} />
            <directionalLight position={[4, 8, 5]} intensity={1.2} />
            <directionalLight position={[-5, 4, -3]} intensity={0.4} />
            <Suspense fallback={null}>
              <Bounds fit clip observe margin={1.05}>
                <Model
                  url={modelUrl}
                  visibleGroups={visibleGroups}
                  selectedId={selected?.uniqueId ?? null}
                  wallsTransparent={wallsTransparent}
                  onSelect={setSelected}
                  onLoaded={(counts, r) => {
                    setGroupCounts(counts);
                    setRoom(r);
                  }}
                />
              </Bounds>
            </Suspense>
            <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI * 0.49} />
          </Canvas>
          <div className="pointer-events-none absolute bottom-2 left-2 rounded bg-white/80 px-2 py-1 text-[11px] text-slate-600">
            Trascina per ruotare · rotella per zoom · tasto destro per spostare · clic su un oggetto per le proprietà
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Categorie</h3>
              <button
                onClick={() => setViewKey((k) => k + 1)}
                className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
              >
                Reimposta vista
              </button>
            </div>
            {groups.length === 0 ? (
              <div className="text-xs text-slate-500">Caricamento modello...</div>
            ) : (
              <ul className="space-y-1 text-sm">
                {groups.map((g) => (
                  <li key={g}>
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isVisible(g)}
                        onChange={(e) => setVisibleGroups((v) => ({ ...v, [g]: e.target.checked }))}
                      />
                      <span className="flex-1">{g}</span>
                      <span className="text-xs text-slate-500">{groupCounts[g]}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {groupCounts[WALL_GROUP] ? (
              <label className="mt-3 flex cursor-pointer items-center gap-2 border-t border-slate-100 pt-2 text-sm">
                <input
                  type="checkbox"
                  checked={wallsTransparent}
                  onChange={(e) => setWallsTransparent(e.target.checked)}
                />
                <span>Pareti trasparenti</span>
              </label>
            ) : null}
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <h3 className="mb-2 text-sm font-semibold">Proprietà elemento</h3>
            {selected ? (
              <table className="w-full text-left text-xs">
                <tbody>
                  {(
                    [
                      ["Nome", selected.label],
                      ["Categoria", selected.category],
                      ["Famiglia", selected.family],
                      ["Tipo", selected.type],
                      ["Item code", selected.item_code],
                      ["Attrezzatura", selected.is_equipment],
                    ] as [string, unknown][]
                  ).map(([k, v]) => (
                    <tr key={k} className="border-t border-slate-100">
                      <td className="py-1 pr-2 font-medium text-slate-600">{k}</td>
                      <td className="py-1">{formatValue(v)}</td>
                    </tr>
                  ))}
                  {Object.entries(selected.params ?? {}).map(([k, v]) => (
                    <tr key={`p-${k}`} className="border-t border-slate-100">
                      <td className="py-1 pr-2 font-mono text-slate-600">{k}</td>
                      <td className="py-1">{formatValue(v)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-100">
                    <td className="py-1 pr-2 font-medium text-slate-600">UniqueId</td>
                    <td className="break-all py-1 font-mono text-[11px]">{selected.uniqueId}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className="text-xs text-slate-500">Clicca un oggetto nella vista 3D.</div>
            )}
          </div>
          {room?.note ? <div className="text-[11px] text-slate-500">{room.note}</div> : null}
        </div>
      </div>
    </div>
  );
}
