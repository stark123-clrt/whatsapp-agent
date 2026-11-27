import type { Metadata } from "next";
import { Suspense } from "react";
import { BroadcastDetail } from "./broadcast-detail";

export const metadata: Metadata = { title: "Diffusion" };

export default function BroadcastPage({ params }: PageProps<"/diffusions/[id]">) {
  return (
    <Suspense fallback={<main className="p-10 text-sm text-zinc-500">Chargement…</main>}>
      <Detail params={params} />
    </Suspense>
  );
}

async function Detail({ params }: { params: PageProps<"/diffusions/[id]">["params"] }) {
  const { id } = await params;
  return <BroadcastDetail id={Number(id)} />;
}
