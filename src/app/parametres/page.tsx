import { Suspense } from "react";
import { SettingsClient } from "./settings-client";

// La section (?section=…) est lue côté serveur, puis transmise à l'interface.
export default function ParametresPage({ searchParams }: PageProps<"/parametres">) {
  return (
    <Suspense fallback={<main className="p-10 text-sm text-zinc-500">Chargement…</main>}>
      <Settings searchParams={searchParams} />
    </Suspense>
  );
}

async function Settings({ searchParams }: { searchParams: PageProps<"/parametres">["searchParams"] }) {
  const section = (await searchParams).section;
  return <SettingsClient section={typeof section === "string" ? section : "channels"} />;
}
