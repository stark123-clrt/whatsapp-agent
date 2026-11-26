import type { Metadata } from "next";
import { Suspense } from "react";
import { CampaignDetail } from "./campaign-detail";

export const metadata: Metadata = { title: "Campagne" };

// L'identifiant est lu côté serveur puis transmis à l'interface.
export default function CampagnePage({ params }: PageProps<"/campagnes/[id]">) {
  return (
    <Suspense fallback={<main className="p-10 text-sm text-zinc-500">Chargement…</main>}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: { params: PageProps<"/campagnes/[id]">["params"] }) {
  const { id } = await params;
  return <CampaignDetail id={Number(id)} />;
}
