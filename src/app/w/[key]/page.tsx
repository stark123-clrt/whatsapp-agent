import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { getWidgetByKey } from "@/lib/widget";
import { WidgetChat } from "../widget-chat";

export const metadata: Metadata = { title: "Chat", robots: { index: false, follow: false } };

/**
 * Chat des visiteurs.
 *  - Dans l'iframe du site (le script passe ?vid=…) : la fenêtre occupe tout l'espace.
 *  - Ouvert directement (lien partagé) : le chat s'affiche centré sur une page.
 */
export default function WidgetPage({ params, searchParams }: PageProps<"/w/[key]">) {
  return (
    <Suspense fallback={null}>
      <Chat params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Chat({ params, searchParams }: Pick<PageProps<"/w/[key]">, "params" | "searchParams">) {
  await connection();
  const { key } = await params;
  const q = await searchParams;
  const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const widget = getWidgetByKey(key);
  if (!widget) {
    return <main className="flex h-full items-center justify-center p-6 text-sm text-zinc-500">Ce chat n&apos;existe plus.</main>;
  }
  const s = widget.settings;
  const vid = one(q.vid);
  const embedded = Boolean(vid);
  const chat = (
    <WidgetChat
      mode="live"
      settings={s}
      widgetKey={key}
      logoUrl={s.logo ? `/api/public/widget/${key}/logo` : null}
      vid={vid ?? null}
      host={one(q.host) ?? ""}
      lang={one(q.lang) ?? "fr"}
      agent={one(q.agent)}
      embedded={embedded}
    />
  );
  if (embedded) return <main className="h-full">{chat}</main>;

  return (
    <main
      className="flex h-full items-center justify-center p-0 sm:p-6"
      style={{ background: `radial-gradient(80% 60% at 50% 0%, color-mix(in srgb, ${s.colors.brand} 18%, #fff), #f4f4f5 70%)` }}
    >
      <div className="h-full w-full overflow-hidden shadow-2xl sm:h-[min(680px,100%)] sm:max-w-[400px]" style={{ borderRadius: 18 }}>
        {chat}
      </div>
    </main>
  );
}
