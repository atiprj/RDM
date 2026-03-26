"use client";

import { UiPrefsProvider } from "@/lib/uiPrefs";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <UiPrefsProvider>{children}</UiPrefsProvider>;
}

