import { Suspense } from "react";
import { AgentPageClient } from "./page-client";

// La page lit l'adresse (identifiant de l'agent) : elle s'affiche dans un bloc Suspense.
export default function AgentPage() {
  return (
    <Suspense fallback={<main className="p-10 text-sm text-zinc-500">Chargement…</main>}>
      <AgentPageClient />
    </Suspense>
  );
}
