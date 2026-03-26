"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Lang = "it" | "en";
type ThemeMode = "light" | "dark";
type Accent = "slate" | "grey" | "red";

type UiPrefs = {
  lang: Lang;
  setLang: (v: Lang) => void;
  themeMode: ThemeMode;
  setThemeMode: (v: ThemeMode) => void;
  accent: Accent;
  setAccent: (v: Accent) => void;
  t: (key: string) => string;
};

const dict: Record<Lang, Record<string, string>> = {
  it: {
    connected: "Connesso",
    logout: "Logout",
    project: "Project",
    rooms: "Rooms",
    mappings: "Mappings",
    itemCatalog: "Item Catalog",
    system: "System",
    projectLabel: "Progetto",
    loginTitle: "BIM Login",
    loginSubtitle: "Inserisci la tua email autorizzata (tabella `user_permissions`).",
    email: "Email",
    rememberMe: "Ricordami su questo browser (30 giorni)",
    login: "Accedi",
    loggingIn: "Accesso...",
    networkError: "Errore di rete.",
  },
  en: {
    connected: "Connected",
    logout: "Logout",
    project: "Project",
    rooms: "Rooms",
    mappings: "Mappings",
    itemCatalog: "Item Catalog",
    system: "System",
    projectLabel: "Project",
    loginTitle: "BIM Login",
    loginSubtitle: "Enter your authorized email (`user_permissions` table).",
    email: "Email",
    rememberMe: "Remember me on this browser (30 days)",
    login: "Login",
    loggingIn: "Signing in...",
    networkError: "Network error.",
  },
};

const Ctx = createContext<UiPrefs | null>(null);

export function UiPrefsProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>("it");
  const [themeMode, setThemeMode] = useState<ThemeMode>("light");
  const [accent, setAccent] = useState<Accent>("slate");

  useEffect(() => {
    try {
      const l = localStorage.getItem("ui_lang") as Lang | null;
      const m = localStorage.getItem("ui_theme_mode") as ThemeMode | null;
      const a = localStorage.getItem("ui_theme_accent") as Accent | null;
      if (l === "it" || l === "en") setLang(l);
      if (m === "light" || m === "dark") setThemeMode(m);
      if (a === "slate" || a === "grey" || a === "red") setAccent(a);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    document.body.dataset.themeMode = themeMode;
    document.body.dataset.themeAccent = accent;
    try {
      localStorage.setItem("ui_lang", lang);
      localStorage.setItem("ui_theme_mode", themeMode);
      localStorage.setItem("ui_theme_accent", accent);
    } catch {
      // ignore
    }
  }, [lang, themeMode, accent]);

  const value = useMemo<UiPrefs>(
    () => ({
      lang,
      setLang,
      themeMode,
      setThemeMode,
      accent,
      setAccent,
      t: (key: string) => dict[lang][key] ?? key,
    }),
    [lang, themeMode, accent]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useUiPrefs() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useUiPrefs must be used within UiPrefsProvider");
  return v;
}

