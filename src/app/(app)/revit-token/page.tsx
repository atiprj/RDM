"use client";

import { useEffect, useState } from "react";

type TokenRow = {
  id: string;
  email: string;
  label: string;
  token_prefix: string;
  created_at: string;
  last_used_at: string | null;
};

function fmt(d: string | null) {
  if (!d) return "-";
  return new Date(d).toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" });
}

export default function RevitTokenPage() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [canDelete, setCanDelete] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [label, setLabel] = useState("");
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function refresh(all = showAll) {
    setError(null);
    const res = await fetch(`/api/tokens${all ? "?all=1" : ""}`, { cache: "no-store" });
    const json = (await res.json()) as { ok: boolean; tokens?: TokenRow[]; canDelete?: boolean; error?: string };
    if (!json.ok) return setError(json.error ?? "Errore lettura token");
    setTokens(json.tokens ?? []);
    setCanDelete(Boolean(json.canDelete));
  }

  useEffect(() => {
    refresh(showAll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll]);

  async function create() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label }),
      });
      const json = (await res.json()) as { ok: boolean; token?: string; error?: string };
      if (!json.ok) throw new Error(json.error ?? "Errore creazione token");
      setNewToken(json.token ?? null);
      setLabel("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: TokenRow) {
    if (!window.confirm(`Eliminare il token "${t.label}" di ${t.email}? Il plugin che lo usa smetterà di funzionare.`)) return;
    const res = await fetch(`/api/tokens?id=${encodeURIComponent(t.id)}`, { method: "DELETE" });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!json.ok) return setError(json.error ?? "Errore eliminazione");
    await refresh();
  }

  async function copy() {
    if (!newToken) return;
    try {
      await navigator.clipboard.writeText(newToken);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">🔑 Token Revit</h1>
        <p className="mt-2 text-slate-600">
          Il token permette al plugin pyRevit di caricare le geometrie 3D dei locali a tuo nome, sui progetti a cui hai
          accesso. Generalo qui e incollalo nel plugin quando te lo chiede.
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold">Nuovo token</h2>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Nome (es. PC ufficio)"
            maxLength={80}
            className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          />
          <button
            onClick={create}
            disabled={busy}
            className="rounded-lg bg-[var(--accent-600)] px-4 py-2 text-sm text-white hover:bg-[var(--accent-700)] disabled:opacity-50"
          >
            Genera token
          </button>
        </div>
        {newToken ? (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
            <div className="font-medium text-amber-800">
              Copialo adesso: non sarà più visibile dopo aver lasciato questa pagina.
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="break-all rounded bg-white px-2 py-1 font-mono text-xs">{newToken}</code>
              <button onClick={copy} className="rounded border border-slate-300 bg-white px-2 py-1 text-xs hover:bg-slate-50">
                {copied ? "Copiato ✓" : "Copia"}
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{showAll ? "Tutti i token" : "I miei token"}</h2>
          {canDelete ? (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
              Mostra i token di tutti gli utenti
            </label>
          ) : null}
        </div>
        <div className="overflow-auto rounded-lg border border-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Nome</th>
                {showAll ? <th className="px-3 py-2">Utente</th> : null}
                <th className="px-3 py-2">Inizio token</th>
                <th className="px-3 py-2">Creato</th>
                <th className="px-3 py-2">Ultimo uso</th>
                {canDelete ? <th className="px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {tokens.length === 0 ? (
                <tr>
                  <td className="px-3 py-3 text-slate-600" colSpan={6}>
                    Nessun token.
                  </td>
                </tr>
              ) : (
                tokens.map((t) => (
                  <tr key={t.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{t.label}</td>
                    {showAll ? <td className="px-3 py-2">{t.email}</td> : null}
                    <td className="px-3 py-2 font-mono text-xs">{t.token_prefix}…</td>
                    <td className="px-3 py-2">{fmt(t.created_at)}</td>
                    <td className="px-3 py-2">{fmt(t.last_used_at)}</td>
                    {canDelete ? (
                      <td className="px-3 py-2 text-right">
                        <button
                          onClick={() => remove(t)}
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-700 hover:bg-red-50"
                        >
                          Elimina
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {!canDelete ? (
          <p className="mt-3 text-xs text-slate-500">
            Per eliminare un token (ad esempio se l&apos;hai perso o condiviso per errore) chiedi a un super admin.
          </p>
        ) : null}
      </section>
    </main>
  );
}
