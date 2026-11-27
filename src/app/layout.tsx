import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { CircuitBackground } from "./circuit-background";
import { Sidebar } from "./sidebar";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stark Marketing",
  description: "Agent IA connecté à WhatsApp",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex h-dvh overflow-hidden bg-white text-zinc-900">
        {/* Fond animé (circuit bleu) derrière toute l'appli. */}
        <Suspense fallback={null}>
          <CircuitBackground />
        </Suspense>
        {/* Le menu lit l'adresse de la page : il s'affiche dans un bloc Suspense. */}
        <Suspense fallback={<nav className="relative z-10 w-60 shrink-0 border-r border-zinc-200 bg-white/80" />}>
          <Sidebar />
        </Suspense>
        <div className="relative z-10 flex min-w-0 flex-1 flex-col overflow-y-auto">{children}</div>
      </body>
    </html>
  );
}
