import Link from "next/link";

export default function HomePage() {
  return (
    <main className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">Room Data Management</h1>
        <p className="mt-2 text-slate-600">
          Versione Vercel (Next.js) + Supabase. Usa il login per accedere al
          dashboard.
        </p>
        <div className="mt-6 flex gap-3">
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
          >
            Vai al login
          </Link>
          <Link
            href="/dashboard"
            className="inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 hover:bg-slate-50"
          >
            Dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}

