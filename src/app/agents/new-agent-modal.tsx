"use client";

import { useState } from "react";
import { BuildProgress } from "./build-progress";

const LANGS = [
  ["fr", "🇫🇷 Français"],
  ["en", "🇬🇧 Anglais"],
  ["es", "🇪🇸 Espagnol"],
  ["de", "🇩🇪 Allemand"],
  ["it", "🇮🇹 Italien"],
  ["pt", "🇵🇹 Portugais"],
  ["nl", "🇳🇱 Néerlandais"],
  ["ar", "🇸🇦 Arabe"],
] as const;

type Doc = { name: string; text: string };

export function NewAgentModal({
  onClose,
  onCreated,
  onBackground,
}: {
  onClose: () => void;
  onCreated: (id: number) => void;
  onBackground: () => void;
}) {
  const [building, setBuilding] = useState<{ id: number; pages: number } | null>(null);
  const [role, setRole] = useState<"sales" | "support">("sales");
  const [mode, setMode] = useState<"site" | "scratch">("site");
  const [website, setWebsite] = useState("");
  const [pages, setPages] = useState<string[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [finding, setFinding] = useState(false);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("fr");
  const [instructions, setInstructions] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function findPages() {
    setFinding(true);
    setError(null);
    const res = await fetch("/api/kb/discover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: website }),
    });
    const body = await res.json().catch(() => ({}));
    setFinding(false);
    if (!res.ok) return setError(body.error ?? "Site inaccessible.");
    setPages(body.pages);
    // Par défaut : les 15 pages principales (adresses les plus courtes).
    setPicked(new Set((body.pages as string[]).slice(0, 15)));
    if (!name) setName(`Assistant ${body.site}`);
  }

  async function addDocuments(files: FileList | null) {
    if (!files) return;
    const read = await Promise.all(
      [...files].map(async (f) => ({ name: f.name, text: await f.text() })),
    );
    setDocs((d) => [...d, ...read.filter((x) => x.text.trim())].slice(0, 10));
  }

  async function create() {
    setSaving(true);
    setError(null);
    // Adresse saisie sans avoir cliqué sur « Trouver des pages » : on les cherche maintenant
    // et on garde les 15 pages principales.
    let chosen = [...picked];
    if (mode === "site" && website.trim() && pages === null) {
      const found = await fetch("/api/kb/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: website }),
      });
      const fb = await found.json().catch(() => ({}));
      if (!found.ok) {
        setSaving(false);
        return setError(fb.error ?? "Site inaccessible. Vérifie l'adresse.");
      }
      chosen = (fb.pages as string[]).slice(0, 15);
    }
    const res = await fetch("/api/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role,
        mode,
        name,
        language,
        website,
        pages: chosen,
        documents: docs,
        instructions: mode === "scratch" ? instructions : "",
      }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) return setError(body.error ?? "Échec de la création.");
    // L'agent se construit (lecture du site, FAQ, instructions) : on affiche la progression.
    if (body.agent.preparing) setBuilding({ id: body.agent.id, pages: chosen.length });
    else onCreated(body.agent.id);
  }

  // Ce qui manque encore pour pouvoir créer l'agent (affiché à côté du bouton).
  const missing = !name.trim()
    ? "Donne un nom à l'agent."
    : mode === "site"
      ? !website.trim()
        ? "Indique l'adresse de ton site web."
        : pages !== null && picked.size === 0
          ? "Coche au moins une page."
          : null
      : !instructions.trim() && docs.length === 0
        ? "Écris les instructions ou ajoute un document."
        : null;
  const canCreate = !missing && !saving;

  if (building) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
        <div role="dialog" aria-label="Construction de l'agent" className="w-full max-w-xl rounded-2xl bg-white px-8 py-8 shadow-2xl">
          <BuildProgress
            agentId={building.id}
            pagesFound={building.pages || undefined}
            onDone={() => onCreated(building.id)}
            onBackground={onBackground}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Nouvel agent"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-zinc-100 px-7 py-5">
          <div>
            <h2 className="text-lg font-semibold">Nouvel agent</h2>
            <p className="text-sm text-zinc-500">Commence à partir de ton site web ou crée-le de zéro.</p>
          </div>
          <button onClick={onClose} aria-label="Fermer" className="text-zinc-400 hover:text-zinc-800">
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-7 overflow-y-auto px-7 py-6">
          <Block title="Quel sera le rôle de cet agent ?">
            <div className="grid gap-3 sm:grid-cols-2">
              <Choice active={role === "sales"} onClick={() => setRole("sales")} title="🛍️ Ventes" text="Aide les prospects à acheter ou réserver." />
              <Choice active={role === "support"} onClick={() => setRole("support")} title="🛟 Support client" text="Répond aux questions et résout les problèmes des clients." />
            </div>
          </Block>

          <Block title="De quelles sources cet agent doit-il apprendre ?" hint="Choisis un point de départ. Tu pourras tout modifier par la suite.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Choice active={mode === "site"} onClick={() => setMode("site")} title="🌐 Créer à partir de ton site web" text="Nous lisons tes pages et rédigeons l'agent pour toi." />
              <Choice active={mode === "scratch"} onClick={() => setMode("scratch")} title="＋ Commencer de zéro" text="Rédige les instructions toi-même." />
            </div>
          </Block>

          {mode === "site" ? (
            <Block title="Ton site web" hint="Nous allons lire ces pages ainsi que les documents ajoutés pour configurer l'agent.">
              <label className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
                Adresse du site web <span className="text-red-500">*</span>
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  value={website}
                  onChange={(e) => {
                    setWebsite(e.target.value);
                    setPages(null);
                  }}
                  onKeyDown={(e) => e.key === "Enter" && website.trim() && findPages()}
                  placeholder="monsite.com"
                  className="flex-1 rounded-xl border border-zinc-200 px-4 py-2.5 font-mono text-sm outline-none focus:border-zinc-400"
                />
                <button
                  onClick={findPages}
                  disabled={!website.trim() || finding}
                  className="rounded-xl border border-zinc-200 px-4 text-sm text-zinc-700 hover:bg-zinc-50 disabled:text-zinc-400"
                >
                  {finding ? "Recherche…" : "🔍 Trouver des pages"}
                </button>
              </div>
              <p className="mt-1 text-xs text-zinc-500">L&apos;adresse suffit — inutile d&apos;ajouter https://</p>

              {pages && (
                <div className="mt-4 rounded-xl border border-zinc-200">
                  <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-2 text-sm">
                    <span>
                      <strong>{picked.size}</strong> page{picked.size > 1 ? "s" : ""} sur {pages.length} (25 max)
                    </span>
                    <span className="space-x-3 text-xs">
                      <button className="text-green-700 hover:underline" onClick={() => setPicked(new Set(pages.slice(0, 25)))}>
                        Tout (25 max)
                      </button>
                      <button className="text-zinc-500 hover:underline" onClick={() => setPicked(new Set())}>
                        Aucune
                      </button>
                    </span>
                  </div>
                  <ul className="max-h-56 overflow-y-auto py-1">
                    {pages.map((p) => (
                      <li key={p}>
                        <label className="flex cursor-pointer items-center gap-3 px-4 py-1.5 text-sm hover:bg-zinc-50">
                          <input
                            type="checkbox"
                            className="accent-green-600"
                            checked={picked.has(p)}
                            disabled={!picked.has(p) && picked.size >= 25}
                            onChange={() =>
                              setPicked((s) => {
                                const n = new Set(s);
                                if (n.has(p)) n.delete(p);
                                else n.add(p);
                                return n;
                              })
                            }
                          />
                          <span className="truncate font-mono text-xs text-zinc-700">{p.replace(/^https?:\/\//, "")}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Block>
          ) : (
            <Block title="Instructions de l'agent" hint="Décris ton entreprise, ce que l'agent doit faire, le ton à adopter, ce qu'il ne doit pas faire.">
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                rows={7}
                placeholder="Tu es l'assistant de… Nous proposons… Ton objectif est de…"
                className="w-full rounded-xl border border-zinc-200 px-4 py-3 text-sm outline-none focus:border-zinc-400"
              />
            </Block>
          )}

          <Block title="Documents" hint="Optionnel. Listes de prix, brochures, FAQ — tout ce que l'agent doit savoir (fichiers .txt, .md ou .csv pour l'instant).">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2 text-sm hover:bg-zinc-50">
              ＋ Ajouter un document
              <input type="file" multiple accept=".txt,.md,.csv,text/plain,text/markdown,text/csv" className="hidden" onChange={(e) => addDocuments(e.target.files)} />
            </label>
            {docs.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {docs.map((d, i) => (
                  <li key={i} className="flex items-center gap-2">
                    📄 <span className="flex-1 truncate">{d.name}</span>
                    <button onClick={() => setDocs(docs.filter((_, j) => j !== i))} className="text-zinc-400 hover:text-red-600" aria-label="Retirer">
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Block>

          <Block title="Détails">
            <label className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">
              Nom de l&apos;agent <span className="text-red-500">*</span>
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ex. Assistant commercial"
              className="mt-1.5 w-full rounded-xl border border-zinc-200 px-4 py-2.5 text-sm outline-none focus:border-zinc-400"
            />
            <label className="mt-4 block text-xs font-semibold tracking-wide text-zinc-500 uppercase">Langue</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="mt-1.5 w-full rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-zinc-400"
            >
              {LANGS.map(([code, label]) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-zinc-500">
              La langue principale de l&apos;agent, utilisée pour ses instructions. Il répond automatiquement dans la langue du contact.
            </p>
            <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
              ℹ️ Un agent répond aux personnes qui te contactent. Il n&apos;écrit jamais en premier.
            </p>
          </Block>
        </div>

        <footer className="flex items-center justify-end gap-3 border-t border-zinc-100 px-7 py-4">
          {error ? (
            <p className="mr-auto text-sm text-red-600">{error}</p>
          ) : (
            missing && <p className="mr-auto text-sm text-zinc-500">{missing}</p>
          )}
          <button onClick={onClose} className="rounded-xl px-4 py-2.5 text-sm text-zinc-600 hover:bg-zinc-100">
            Annuler
          </button>
          <button
            onClick={create}
            disabled={!canCreate}
            className="rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-green-300"
          >
            {saving ? (mode === "site" && pages === null ? "Recherche des pages…" : "Création…") : "Créer l'agent"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-semibold tracking-wide text-zinc-500 uppercase">{title}</h3>
      {hint && <p className="mt-1 text-sm text-zinc-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Choice({ active, onClick, title, text }: { active: boolean; onClick: () => void; title: string; text: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-xl border px-4 py-3 text-left transition-colors ${
        active ? "border-green-500 bg-green-50" : "border-zinc-200 bg-zinc-50 hover:bg-zinc-100"
      }`}
    >
      <span className="flex items-center justify-between font-semibold text-zinc-900">
        {title}
        {active && <span className="text-green-600">✓</span>}
      </span>
      <span className="mt-1 block text-sm text-zinc-500">{text}</span>
    </button>
  );
}
