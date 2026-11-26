"use client";

import { useCallback, useEffect, useState } from "react";

export type CatalogProduct = {
  id: number;
  title: string;
  priceCents: number | null;
  compareCents: number | null;
  currency: string;
  url: string | null;
  imageFile: string | null;
  available: boolean;
  manual: boolean;
};
type Job = { state: "running" | "done" | "error"; message: string; startedAt: number } | null;
type Info = { site: string; source: string; importedAt: number } | null;

const price = (cents: number | null, currency = "EUR") =>
  cents === null ? "—" : new Intl.NumberFormat("fr-FR", { style: "currency", currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
export const usable = (p: CatalogProduct) => p.available && Boolean(p.imageFile) && p.priceCents !== null;

/** Catalogue de l'agent : import depuis le site, sélection des produits à mettre en avant, ajout à la main. */
export function CatalogPicker({
  agentId,
  site,
  selected,
  onChange,
  onProducts,
}: {
  agentId: number | null;
  site: string;
  selected: number[];
  onChange: (ids: number[]) => void;
  onProducts: (products: CatalogProduct[]) => void;
}) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [info, setInfo] = useState<Info>(null);
  const [job, setJob] = useState<Job>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [manual, setManual] = useState({ title: "", price: "", url: "", imageUrl: "" });

  const load = useCallback(async () => {
    if (!agentId) return;
    const r = await fetch(`/api/catalog?agentId=${agentId}`, { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return;
    const d = (await r.json()) as { products: CatalogProduct[]; info: Info; job: Job };
    setProducts(d.products);
    setInfo(d.info);
    setJob(d.job);
    onProducts(d.products);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onProducts est une simple notification
  }, [agentId]);

  const running = job?.state === "running";
  useEffect(() => {
    const first = setTimeout(load, 0);
    const poll = running ? setInterval(load, 3000) : null;
    return () => {
      clearTimeout(first);
      if (poll) clearInterval(poll);
    };
  }, [load, running]);

  async function startImport() {
    setError(null);
    const r = await fetch("/api/catalog/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId, url: site }) });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) return setError(d.error ?? "Import impossible.");
    setJob({ state: "running", message: "Lecture du site…", startedAt: Date.now() });
  }

  async function addManual() {
    setError(null);
    const r = await fetch("/api/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId, ...manual }) });
    const d = (await r.json().catch(() => ({}))) as { error?: string };
    if (!r.ok) return setError(d.error ?? "Ajout impossible.");
    setManual({ title: "", price: "", url: "", imageUrl: "" });
    setAdding(false);
    void load();
  }

  const ok = products.filter(usable);
  const all = selected.length === 0;
  const isOn = (id: number) => all || selected.includes(id);
  const toggle = (id: number) => {
    const base = all ? ok.map((p) => p.id) : selected;
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    onChange(next.length === ok.length ? [] : next);
  };
  const field = "w-full rounded-lg border border-zinc-200 px-3 py-2 text-sm outline-none focus:border-violet-500";

  if (!agentId) return <p className="text-sm text-zinc-500">Choisis d&apos;abord l&apos;agent (étape 1).</p>;

  return (
    <div className="rounded-xl border border-zinc-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">Produits du site</p>
          <p className="truncate text-xs text-zinc-500">
            {running
              ? `${job?.message} (jusqu'à 3 minutes, tu peux continuer)`
              : info
                ? `${products.length} produits · ${info.source} · importés le ${new Date(info.importedAt).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
                : "Aucun produit pour l'instant."}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setAdding(!adding)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-zinc-100">
            + À la main
          </button>
          <button
            type="button"
            onClick={startImport}
            disabled={running || !/^https?:\/\/\S+\.\S+/.test(site)}
            title={site ? `Lire ${site}` : "Indique le lien du site à l'étape 1"}
            className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {running ? "Import en cours…" : info ? "↻ Actualiser" : "Importer les produits du site"}
          </button>
        </div>
      </div>

      {(error || job?.state === "error") && <p className="px-4 pt-3 text-xs text-red-600">⚠️ {error ?? job?.message}</p>}
      {running && <div className="h-1 overflow-hidden bg-violet-100"><div className="h-full w-1/3 animate-pulse bg-violet-500" /></div>}

      {adding && (
        <div className="grid grid-cols-2 gap-2 border-b border-zinc-100 bg-zinc-50/60 p-4">
          <input className={`${field} col-span-2`} placeholder="Nom du produit *" value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} />
          <input className={field} placeholder="Prix (ex. 24,90)" value={manual.price} onChange={(e) => setManual({ ...manual, price: e.target.value })} />
          <input className={field} placeholder="Lien de la fiche produit" value={manual.url} onChange={(e) => setManual({ ...manual, url: e.target.value })} />
          <input className={`${field} col-span-2`} placeholder="Lien de la photo (clic droit sur l'image du site → Copier l'adresse de l'image)" value={manual.imageUrl} onChange={(e) => setManual({ ...manual, imageUrl: e.target.value })} />
          <div className="col-span-2 flex justify-end">
            <button type="button" onClick={addManual} disabled={!manual.title.trim()} className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
              Ajouter le produit
            </button>
          </div>
        </div>
      )}

      {products.length > 0 && (
        <>
          <div className="flex items-center justify-between px-4 pt-3 text-xs text-zinc-500">
            <span>{all ? `Tous les produits disponibles (${ok.length})` : `${selected.length} produit${selected.length > 1 ? "s" : ""} sélectionné${selected.length > 1 ? "s" : ""}`}</span>
            {!all && (
              <button type="button" onClick={() => onChange([])} className="font-medium text-violet-700 hover:underline">
                Tout sélectionner
              </button>
            )}
          </div>
          <div className="grid max-h-80 grid-cols-3 gap-2 overflow-y-auto p-4 sm:grid-cols-4">
            {products.map((p) => {
              const can = usable(p);
              const on = can && isOn(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={!can}
                  onClick={() => toggle(p.id)}
                  title={can ? p.title : "Indisponible, sans photo ou sans prix"}
                  className={`relative overflow-hidden rounded-lg border text-left transition ${on ? "border-violet-600 ring-1 ring-violet-600" : "border-zinc-200"} ${can ? "hover:border-violet-400" : "opacity-40"}`}
                >
                  <div className="aspect-square bg-zinc-100">
                    {p.imageFile && (
                      // eslint-disable-next-line @next/next/no-img-element -- photo du catalogue
                      <img src={`/api/catalog/${p.id}/image?v=${encodeURIComponent(p.imageFile)}`} alt="" className="h-full w-full object-cover" loading="lazy" />
                    )}
                  </div>
                  <div className="p-1.5">
                    <p className="truncate text-[11px] font-medium">{p.title}</p>
                    <p className="text-[11px] text-zinc-500">{price(p.priceCents, p.currency)}</p>
                  </div>
                  <span className={`absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold ${on ? "bg-violet-600 text-white" : "bg-white/90 text-zinc-300"}`}>✓</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
