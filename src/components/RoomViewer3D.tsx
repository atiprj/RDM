"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
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

/** Extras di scena: "room" per gli export dal modello di progetto, "standard_room" per il modello demo. */
export type SceneInfo = {
  number?: string;
  name?: string;
  sr_code?: string;
  is_main?: boolean;
  area?: number;
  level?: string;
  revit_file?: string;
  exported_at?: string;
  code?: string;
  version?: number;
  area_std?: number;
  note?: string;
};

export type ViewerModel = {
  url: string;
  /** Titolo mostrato sopra la vista, es. "Main · 1.02 Ambulatorio". */
  title: string;
  /** Area del locale (m²) per il confronto. */
  area?: number | null;
};

type Side = "main" | "compare";

const GROUP_ORDER = ["Attrezzature", "Arredi", "Pareti", "Involucro", "Soffitto"];
const WALL_GROUP = "Pareti";
const HIDDEN_BY_DEFAULT = new Set(["Soffitto"]);
const INVENTORY_GROUPS = new Set(["Attrezzature", "Arredi"]);
const HIGHLIGHT = new THREE.Color("#f59e0b");
const BLACK = new THREE.Color(0x000000);

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

/** Chiave di confronto tra inventari: stessa famiglia + tipo (+ item code se presente). */
export function inventoryKey(e: ElementInfo): string {
  return [e.category ?? "", e.family ?? "", e.type ?? "", e.item_code ?? ""].join("|");
}

function forEachMaterial(node: THREE.Object3D, fn: (m: THREE.Material) => void) {
  node.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    mats.forEach(fn);
  });
}

// ---------------------------------------------------------------- camera sincronizzata

type SharedView = { pos: THREE.Vector3; target: THREE.Vector3; rev: number; src: Side | null };

/** Copia la camera tra le due viste del Compare: chi muove la camera diventa la sorgente. */
function CameraSync({ side, shared }: { side: Side; shared: MutableRefObject<SharedView> }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as
    | (THREE.EventDispatcher<{ change: object }> & { target: THREE.Vector3; update: () => void })
    | null;
  const applying = useRef(false);
  const lastRev = useRef(0);

  useEffect(() => {
    if (!controls) return;
    const onChange = () => {
      if (applying.current) return;
      const s = shared.current;
      s.pos.copy(camera.position);
      s.target.copy(controls.target);
      s.src = side;
      s.rev += 1;
      lastRev.current = s.rev;
    };
    controls.addEventListener("change", onChange);
    return () => controls.removeEventListener("change", onChange);
  }, [camera, controls, shared, side]);

  useFrame(() => {
    const s = shared.current;
    if (!controls || s.rev === lastRev.current || s.src === side || s.src == null) return;
    applying.current = true;
    camera.position.copy(s.pos);
    controls.target.copy(s.target);
    controls.update();
    applying.current = false;
    lastRev.current = s.rev;
  });
  return null;
}

// ---------------------------------------------------------------- modello

type ModelProps = {
  url: string;
  visibleGroups: Record<string, boolean>;
  selectedId: string | null;
  highlightKey: string | null;
  wallsTransparent: boolean;
  onSelect: (info: ElementInfo | null) => void;
  onLoaded: (elements: ElementInfo[], scene: SceneInfo | null) => void;
};

function Model({ url, visibleGroups, selectedId, highlightKey, wallsTransparent, onSelect, onLoaded }: ModelProps) {
  const gltf = useGLTF(url);

  // Copia con materiali propri per ogni mesh: l'evidenziazione non colora gli elementi che condividono un materiale.
  const { root, elements } = useMemo(() => {
    const root = gltf.scene.clone(true);
    const elements: THREE.Object3D[] = [];
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map((m) => m.clone()) : mesh.material.clone();
      }
      if (o.userData && typeof o.userData.group === "string") elements.push(o);
    });
    return { root, elements };
  }, [gltf.scene]);

  useEffect(() => {
    const ud = gltf.scene.userData ?? {};
    const scene = ((ud.room ?? ud.standard_room) as SceneInfo | undefined) ?? null;
    onLoaded(elements.map(toInfo), scene);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, gltf.scene]);

  useEffect(() => {
    for (const e of elements) {
      const g = e.userData.group as string;
      e.visible = visibleGroups[g] ?? !HIDDEN_BY_DEFAULT.has(g);
    }
  }, [elements, visibleGroups]);

  useEffect(() => {
    for (const e of elements) {
      if (e.userData.group !== WALL_GROUP) continue;
      forEachMaterial(e, (m) => {
        m.transparent = wallsTransparent;
        m.opacity = wallsTransparent ? 0.22 : 1;
        m.depthWrite = !wallsTransparent;
        m.needsUpdate = true;
      });
    }
  }, [elements, wallsTransparent]);

  useEffect(() => {
    for (const e of elements) {
      const on = e.name === selectedId || (highlightKey != null && inventoryKey(toInfo(e)) === highlightKey);
      forEachMaterial(e, (m) => {
        const std = m as THREE.MeshStandardMaterial;
        if (!std.emissive) return;
        std.emissive.copy(on ? HIGHLIGHT : BLACK);
        std.emissiveIntensity = on ? 0.45 : 0;
      });
    }
  }, [elements, selectedId, highlightKey]);

  function handleClick(e: ThreeEvent<MouseEvent>) {
    if (e.delta > 4) return; // trascinamento della camera, non un clic
    if (!isShown(e.object)) return; // passa all'intersezione successiva
    const node = findElementNode(e.object);
    if (wallsTransparent && node?.userData.group === WALL_GROUP) return; // il clic attraversa le pareti trasparenti
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

// ---------------------------------------------------------------- vista singola

type ViewProps = {
  side: Side;
  model: ViewerModel;
  height: string;
  syncCamera: boolean;
  shared: MutableRefObject<SharedView>;
  viewKey: number;
  visibleGroups: Record<string, boolean>;
  selectedId: string | null;
  highlightKey: string | null;
  wallsTransparent: boolean;
  onSelect: (side: Side, info: ElementInfo | null) => void;
  onLoaded: (side: Side, elements: ElementInfo[], scene: SceneInfo | null) => void;
};

function View(p: ViewProps) {
  return (
    <div className={`relative ${p.height} overflow-hidden rounded-lg border border-slate-200 bg-slate-100`}>
      <div className="pointer-events-none absolute left-2 top-2 z-10 rounded bg-white/85 px-2 py-1 text-xs font-medium text-slate-700">
        {p.model.title}
      </div>
      <Canvas
        key={`${p.viewKey}-${p.model.url}`}
        camera={{ position: [4, 7, 6], fov: 40, near: 0.05, far: 500 }}
        dpr={[1, 2]}
        onPointerMissed={() => p.onSelect(p.side, null)}
      >
        <color attach="background" args={["#eef2f6"]} />
        <hemisphereLight args={["#ffffff", "#b0b8c0", 0.9]} />
        <directionalLight position={[4, 8, 5]} intensity={1.2} />
        <directionalLight position={[-5, 4, -3]} intensity={0.4} />
        <Suspense fallback={null}>
          <Bounds fit clip observe={!p.syncCamera} margin={1.05}>
            <Model
              url={p.model.url}
              visibleGroups={p.visibleGroups}
              selectedId={p.selectedId}
              highlightKey={p.highlightKey}
              wallsTransparent={p.wallsTransparent}
              onSelect={(info) => p.onSelect(p.side, info)}
              onLoaded={(els, scene) => p.onLoaded(p.side, els, scene)}
            />
          </Bounds>
        </Suspense>
        <OrbitControls makeDefault enableDamping={!p.syncCamera} maxPolarAngle={Math.PI * 0.49} />
        {p.syncCamera ? <CameraSync side={p.side} shared={p.shared} /> : null}
      </Canvas>
    </div>
  );
}

// ---------------------------------------------------------------- componente principale

function formatValue(v: unknown): string {
  if (v == null || v === "") return "-";
  if (typeof v === "boolean") return v ? "Sì" : "No";
  return String(v);
}

type Props = {
  /** Geometria mostrata di default (la Main del tipo SR). */
  main: ViewerModel;
  /** Se presente, attiva il Compare con la seconda geometria. */
  compare?: ViewerModel | null;
  /** Tipo di standard room (badge). */
  srCode?: string | null;
  /** True per il modello dimostrativo. */
  isDemo?: boolean;
};

type DiffRow = { key: string; label: string; itemCode: string | null; group: string; main: number; compare: number };

export default function RoomViewer3D({ main, compare, srCode, isDemo }: Props) {
  const [elements, setElements] = useState<Record<Side, ElementInfo[]>>({ main: [], compare: [] });
  const [scenes, setScenes] = useState<Record<Side, SceneInfo | null>>({ main: null, compare: null });
  const [visibleGroups, setVisibleGroups] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<{ side: Side; info: ElementInfo } | null>(null);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [viewKey, setViewKey] = useState(0);
  const [wallsTransparent, setWallsTransparent] = useState(true);
  const [onlyDiff, setOnlyDiff] = useState(true);
  const shared = useRef<SharedView>({ pos: new THREE.Vector3(), target: new THREE.Vector3(), rev: 0, src: null });
  const comparing = Boolean(compare);

  useEffect(() => {
    setSelected(null);
    setHighlightKey(null);
    setElements((e) => ({ main: e.main, compare: [] }));
    shared.current.src = null;
  }, [main.url, compare?.url]);

  useEffect(() => {
    return () => {
      document.body.style.cursor = "";
    };
  }, []);

  const groupCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of elements.main) counts[e.group ?? "?"] = (counts[e.group ?? "?"] ?? 0) + 1;
    if (comparing) for (const e of elements.compare) counts[e.group ?? "?"] = counts[e.group ?? "?"] ?? 0;
    return counts;
  }, [elements, comparing]);

  const groups = useMemo(
    () =>
      Object.keys(groupCounts).sort((a, b) => {
        const ia = GROUP_ORDER.indexOf(a);
        const ib = GROUP_ORDER.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
      }),
    [groupCounts]
  );

  const diff = useMemo<DiffRow[]>(() => {
    if (!comparing) return [];
    const rows = new Map<string, DiffRow>();
    const add = (side: Side, e: ElementInfo) => {
      if (!INVENTORY_GROUPS.has(e.group ?? "") && !e.is_equipment) return;
      const key = inventoryKey(e);
      let r = rows.get(key);
      if (!r) {
        r = {
          key,
          label: [e.family, e.type].filter(Boolean).join(" · ") || e.label || "?",
          itemCode: e.item_code ?? null,
          group: e.group ?? "",
          main: 0,
          compare: 0,
        };
        rows.set(key, r);
      }
      r[side] += 1;
    };
    elements.main.forEach((e) => add("main", e));
    elements.compare.forEach((e) => add("compare", e));
    return Array.from(rows.values()).sort(
      (a, b) =>
        Number(b.main !== b.compare) - Number(a.main !== a.compare) ||
        a.group.localeCompare(b.group) ||
        a.label.localeCompare(b.label)
    );
  }, [elements, comparing]);

  const diffCount = diff.filter((r) => r.main !== r.compare).length;
  const isVisible = (g: string) => visibleGroups[g] ?? !HIDDEN_BY_DEFAULT.has(g);
  const sceneMain = scenes.main;

  // Area: Main contro locale confrontato (o contro area standard nel modello demo).
  const refArea = main.area ?? sceneMain?.area ?? sceneMain?.area_std ?? null;
  const otherArea = comparing ? compare?.area ?? scenes.compare?.area ?? null : null;
  const areaDelta =
    typeof refArea === "number" && typeof otherArea === "number" && refArea > 0
      ? ((otherArea - refArea) / refArea) * 100
      : null;
  const deltaClass =
    areaDelta == null
      ? ""
      : Math.abs(areaDelta) <= 5
        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
        : Math.abs(areaDelta) <= 15
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : "bg-red-50 text-red-700 border-red-200";

  const viewProps = {
    height: comparing ? "h-[420px]" : "h-[480px]",
    syncCamera: comparing,
    shared,
    viewKey,
    visibleGroups,
    highlightKey,
    wallsTransparent,
    onSelect: (side: Side, info: ElementInfo | null) => {
      setHighlightKey(null);
      setSelected(info ? { side, info } : null);
    },
    onLoaded: (side: Side, els: ElementInfo[], scene: SceneInfo | null) => {
      setElements((prev) => ({ ...prev, [side]: els }));
      setScenes((prev) => ({ ...prev, [side]: scene }));
    },
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {isDemo ? (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 font-medium text-amber-700">
            Modello dimostrativo · non è una geometria di progetto
          </span>
        ) : (
          <span className="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 font-medium text-indigo-700">
            Tipo SR {srCode ?? sceneMain?.sr_code ?? "-"} · geometria Main dal modello di progetto
          </span>
        )}
        {typeof refArea === "number" ? (
          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-700">
            Area Main {refArea.toFixed(2)} m²
            {typeof otherArea === "number" ? ` · confronto ${otherArea.toFixed(2)} m²` : ""}
          </span>
        ) : null}
        {areaDelta != null ? (
          <span className={`rounded-full border px-3 py-1 font-medium ${deltaClass}`}>
            Scostamento {areaDelta > 0 ? "+" : ""}
            {areaDelta.toFixed(1)}%
          </span>
        ) : null}
        {comparing ? (
          <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-slate-700">
            {diffCount === 0 ? "Inventario identico" : `${diffCount} differenze di inventario`}
          </span>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <div className={comparing ? "grid gap-3 md:grid-cols-2" : ""}>
            <View side="main" model={main} selectedId={selected?.side === "main" ? selected.info.uniqueId : null} {...viewProps} />
            {comparing && compare ? (
              <View
                side="compare"
                model={compare}
                selectedId={selected?.side === "compare" ? selected.info.uniqueId : null}
                {...viewProps}
              />
            ) : null}
          </div>
          <div className="text-[11px] text-slate-500">
            Trascina per ruotare · rotella per zoom · tasto destro per spostare · clic su un oggetto per le proprietà
            {comparing ? " · le due viste si muovono insieme" : ""}
          </div>

          {comparing ? (
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Confronto inventario (attrezzature e arredi)</h3>
                <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} />
                  Solo differenze
                </label>
              </div>
              <div className="max-h-[320px] overflow-auto">
                <table className="min-w-full text-left text-xs">
                  <thead className="bg-slate-50 uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-2 py-1">Elemento</th>
                      <th className="px-2 py-1">Item code</th>
                      <th className="px-2 py-1 text-right">Main</th>
                      <th className="px-2 py-1 text-right">Confronto</th>
                      <th className="px-2 py-1">Esito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {diff
                      .filter((r) => !onlyDiff || r.main !== r.compare)
                      .map((r) => {
                        const status =
                          r.main === r.compare
                            ? { t: "Uguale", c: "text-slate-500" }
                            : r.compare === 0
                              ? { t: "Manca nel confronto", c: "text-red-700" }
                              : r.main === 0
                                ? { t: "In più nel confronto", c: "text-blue-700" }
                                : { t: "Quantità diversa", c: "text-amber-700" };
                        return (
                          <tr
                            key={r.key}
                            onClick={() => {
                              setSelected(null);
                              setHighlightKey((k) => (k === r.key ? null : r.key));
                            }}
                            className={[
                              "cursor-pointer border-t border-slate-100 hover:bg-slate-50",
                              highlightKey === r.key ? "bg-amber-50" : "",
                            ].join(" ")}
                          >
                            <td className="px-2 py-1">{r.label}</td>
                            <td className="px-2 py-1 font-mono">{r.itemCode ?? "-"}</td>
                            <td className="px-2 py-1 text-right">{r.main}</td>
                            <td className="px-2 py-1 text-right">{r.compare}</td>
                            <td className={`px-2 py-1 ${status.c}`}>{status.t}</td>
                          </tr>
                        );
                      })}
                    {diff.length === 0 ? (
                      <tr>
                        <td className="px-2 py-2 text-slate-500" colSpan={5}>
                          Caricamento modelli...
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
              <div className="mt-2 text-[11px] text-slate-500">
                Clicca una riga per evidenziare quegli oggetti in entrambe le viste.
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Categorie</h3>
              <button
                onClick={() => {
                  shared.current.src = null;
                  setViewKey((k) => k + 1);
                }}
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
            {groupCounts[WALL_GROUP] != null ? (
              <label className="mt-3 flex cursor-pointer items-center gap-2 border-t border-slate-100 pt-2 text-sm">
                <input type="checkbox" checked={wallsTransparent} onChange={(e) => setWallsTransparent(e.target.checked)} />
                <span>Pareti trasparenti</span>
              </label>
            ) : null}
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <h3 className="mb-2 text-sm font-semibold">
              Proprietà elemento
              {selected && comparing ? (
                <span className="ml-2 text-xs font-normal text-slate-500">
                  ({selected.side === "main" ? "Main" : "Confronto"})
                </span>
              ) : null}
            </h3>
            {selected ? (
              <table className="w-full text-left text-xs">
                <tbody>
                  {(
                    [
                      ["Nome", selected.info.label],
                      ["Categoria", selected.info.category],
                      ["Famiglia", selected.info.family],
                      ["Tipo", selected.info.type],
                      ["Item code", selected.info.item_code],
                      ["Attrezzatura", selected.info.is_equipment],
                    ] as [string, unknown][]
                  ).map(([k, v]) => (
                    <tr key={k} className="border-t border-slate-100">
                      <td className="py-1 pr-2 font-medium text-slate-600">{k}</td>
                      <td className="py-1">{formatValue(v)}</td>
                    </tr>
                  ))}
                  {Object.entries(selected.info.params ?? {}).map(([k, v]) => (
                    <tr key={`p-${k}`} className="border-t border-slate-100">
                      <td className="py-1 pr-2 font-mono text-slate-600">{k}</td>
                      <td className="py-1">{formatValue(v)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-slate-100">
                    <td className="py-1 pr-2 font-medium text-slate-600">UniqueId</td>
                    <td className="break-all py-1 font-mono text-[11px]">{selected.info.uniqueId}</td>
                  </tr>
                </tbody>
              </table>
            ) : (
              <div className="text-xs text-slate-500">Clicca un oggetto nella vista 3D.</div>
            )}
          </div>
          {sceneMain?.note ? <div className="text-[11px] text-slate-500">{sceneMain.note}</div> : null}
        </div>
      </div>
    </div>
  );
}
