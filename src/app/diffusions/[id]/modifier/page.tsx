import type { Metadata } from "next";
import { Suspense } from "react";
import { BroadcastWizard } from "./wizard";

export const metadata: Metadata = { title: "Diffusion" };

export default function EditBroadcastPage({ params }: PageProps<"/diffusions/[id]/modifier">) {
  return (
    <Suspense fallback={<main className="p-10 text-sm text-zinc-500">Chargement…</main>}>
      <Wizard params={params} />
    </Suspense>
  );
}

async function Wizard({ params }: { params: PageProps<"/diffusions/[id]/modifier">["params"] }) {
  const { id } = await params;
  return <BroadcastWizard id={Number(id)} />;
}
