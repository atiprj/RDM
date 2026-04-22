"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ProjectProvider } from "@/lib/projectContext";
import { ProjectSelector } from "@/components/ProjectSelector";
import { useUiPrefs } from "@/lib/uiPrefs";

function NavLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const active = pathname === href;
  return (
    <Link
      href={href}
      className={[
        "rounded-lg px-3 py-2 text-sm",
        active
          ? "bg-[var(--accent-600)] text-white hover:bg-[var(--accent-700)]"
          : "text-slate-700 hover:bg-slate-100",
      ].join(" ")}
    >
      {label}
    </Link>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const { t, lang, setLang, themeMode, setThemeMode, accent, setAccent } = useUiPrefs();

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/me", { cache: "no-store" });
      if (!res.ok) {
        router.push("/login");
        return;
      }
      const json = (await res.json()) as { ok: boolean; user: { email?: string } };
      if (!cancelled) setEmail(json.user?.email ?? null);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function logout() {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <ProjectProvider>
      <div className="space-y-6">
        <header className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
              <Link href="/dashboard" className="text-lg font-semibold">
                BIM Manager
              </Link>
              <ProjectSelector />
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
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
              <span className="text-sm text-slate-600">{email ? `${t("connected")}: ${email}` : ""}</span>
              <button
                onClick={logout}
                className="rounded-lg bg-[var(--accent-600)] px-3 py-2 text-sm text-white hover:bg-[var(--accent-700)]"
              >
                {t("logout")}
              </button>
            </div>
          </div>

          <nav className="mt-4 flex flex-wrap gap-2">
            <NavLink href="/project" label={`📊 ${t("project")}`} />
            <NavLink href="/rooms" label={`📍 ${t("rooms")}`} />
            <NavLink href="/room-inspector" label="🧭 Room Inspector" />
            <NavLink href="/mappings" label={`🔗 ${t("mappings")}`} />
            <NavLink href="/item-catalog" label={`📦 ${t("itemCatalog")}`} />
            <NavLink href="/system" label={`⚙️ ${t("system")}`} />
          </nav>
        </header>

        <div>{children}</div>
      </div>
    </ProjectProvider>
  );
}

