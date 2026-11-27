import type { Metadata } from "next";
import { Suspense } from "react";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = { title: "Tableau de bord" };

// Les chiffres dépendent de l'heure actuelle : la page est rendue à chaque visite.
export default function DashboardPage() {
  return (
    <Suspense fallback={<main className="min-h-full bg-zinc-50 px-8 py-7" />}>
      <DashboardClient />
    </Suspense>
  );
}
