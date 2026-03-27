import "./globals.css";
import type { Metadata } from "next";
import { ClientProviders } from "@/components/ClientProviders";

export const metadata: Metadata = {
  title: "Room Data Management",
  description: "BIM Data Manager (Vercel + Supabase)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it">
      <body className="min-h-screen">
        <ClientProviders>
          <div className="mx-auto max-w-6xl px-4 py-8">{children}</div>
        </ClientProviders>
      </body>
    </html>
  );
}

