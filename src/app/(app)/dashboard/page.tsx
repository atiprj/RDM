"use client";

import Link from "next/link";
import { useProjectContext } from "@/lib/projectContext";

export default function DashboardPage() {
  const { selectedProjectId, projects, loading } = useProjectContext();
  const project = projects.find((p) => p.id === selectedProjectId);

  return (
    <main className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-slate-600">
          {loading
            ? "Caricamento contesto progetto..."
            : project
              ? `Contesto: ${project.project_code} - ${project.project_name}`
              : "Nessun progetto disponibile per il tuo account."}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/project"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:bg-slate-50"
        >
          <div className="text-lg font-semibold">📊 Project</div>
          <div className="mt-1 text-sm text-slate-600">Overview locali e superfici.</div>
        </Link>
        <Link
          href="/rooms"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:bg-slate-50"
        >
          <div className="text-lg font-semibold">📍 Rooms</div>
          <div className="mt-1 text-sm text-slate-600">Gestione locali + import/export Excel.</div>
        </Link>
        <Link
          href="/room-inspector"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:bg-slate-50"
        >
          <div className="text-lg font-semibold">🧭 Room Inspector</div>
          <div className="mt-1 text-sm text-slate-600">Consultazione locale e parametri associati.</div>
        </Link>
        <Link
          href="/mappings"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:bg-slate-50"
        >
          <div className="text-lg font-semibold">🔗 Mappings</div>
          <div className="mt-1 text-sm text-slate-600">Mapping parametri DB ↔ Revit.</div>
        </Link>
        <Link
          href="/item-catalog"
          className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:bg-slate-50"
        >
          <div className="text-lg font-semibold">📦 Item Catalog</div>
          <div className="mt-1 text-sm text-slate-600">Catalogo voci per progetto.</div>
        </Link>
      </div>
    </main>
  );
}

