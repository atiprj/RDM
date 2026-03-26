"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useUiPrefs } from "@/lib/uiPrefs";

export default function LoginPage() {
  const router = useRouter();
  const { t, lang, setLang, themeMode, setThemeMode, accent, setAccent } = useUiPrefs();
  const [email, setEmail] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, rememberMe }),
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Login fallito.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError(t("networkError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-md">
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-end gap-2">
          <select
            value={lang}
            onChange={(e) => setLang(e.target.value as "it" | "en")}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
          >
            <option value="it">IT</option>
            <option value="en">EN</option>
          </select>
          <select
            value={themeMode}
            onChange={(e) => setThemeMode(e.target.value as "light" | "dark")}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
          <select
            value={accent}
            onChange={(e) => setAccent(e.target.value as "slate" | "grey" | "red")}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
          >
            <option value="slate">Slate</option>
            <option value="grey">Grey</option>
            <option value="red">Red</option>
          </select>
        </div>
        <h1 className="text-2xl font-semibold">{t("loginTitle")}</h1>
        <p className="mt-2 text-sm text-slate-600">
          {t("loginSubtitle")}
        </p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit}>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="email">
              {t("email")}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-slate-900"
              placeholder="nome@dominio.com"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            {t("rememberMe")}
          </label>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-[var(--accent-600)] px-4 py-2 font-medium text-white hover:bg-[var(--accent-700)] disabled:opacity-60"
          >
            {loading ? t("loggingIn") : t("login")}
          </button>
        </form>
      </div>
    </main>
  );
}

