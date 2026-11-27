import type { Metadata } from "next";
import Image from "next/image";
import { Suspense } from "react";
import { Icon, type IconName } from "../icons";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Connexion — Stark Marketing" };

// Schéma : la messagerie au centre, les fonctions autour (positions en % du cadre).
const ORBIT: { label: string; icon: IconName; x: number; y: number }[] = [
  { label: "Agent IA 24 h/24", icon: "robot", x: 50, y: 6 },
  { label: "Campagnes Instagram", icon: "instagram", x: 90, y: 30 },
  { label: "Diffusions WhatsApp", icon: "megaphone", x: 90, y: 72 },
  { label: "Opportunités", icon: "briefcase", x: 50, y: 95 },
  { label: "Reprise humaine", icon: "user", x: 10, y: 72 },
  { label: "Widget du site", icon: "globe", x: 10, y: 30 },
];

const FEATURES: { icon: IconName; title: string; text: string }[] = [
  { icon: "spark", title: "Répondez en quelques secondes.", text: "Votre agent IA répond sur WhatsApp, Instagram et votre site, jour et nuit, avec vos prix et vos produits." },
  { icon: "chart", title: "Faites grandir votre audience.", text: "Publications, stories et sondages préparés par l'IA, commentaires traités, nouveaux abonnés suivis." },
  { icon: "users", title: "Ne perdez plus un client.", text: "Contacts, tags, opportunités et relances : chaque conversation devient une vente suivie." },
];

export default function LoginPage() {
  return (
    <main className="fixed inset-0 z-50 overflow-y-auto">
      <div className="mx-auto grid min-h-full max-w-7xl gap-10 px-6 py-8 lg:grid-cols-[1.15fr_1fr] lg:gap-16 lg:px-10">
        {/* Présentation */}
        <section className="order-2 lg:order-1">
          <div className="flex items-center justify-between">
            <Image src="/brand/logo.png" alt="Stark Marketing" width={105} height={48} priority className="h-11 w-auto" />
            <a href="#a-propos" className="rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-white/70 hover:text-zinc-900">
              À propos
            </a>
          </div>

          <p className="mt-12 text-sm font-semibold text-blue-700">Bon retour</p>
          <h1 className="mt-3 text-4xl leading-tight font-bold tracking-tight text-zinc-900 sm:text-5xl">
            Toutes vos conversations clients, <span className="text-blue-600">gérées par l&apos;IA.</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-600">
            Répondez, vendez et fidélisez sur WhatsApp, Instagram et votre site web, depuis une seule messagerie, avec un agent IA qui connaît votre entreprise.
          </p>

          <div className="mt-10 grid items-center gap-10 xl:grid-cols-[1fr_15rem]">
            {/* Schéma */}
            <div className="relative mx-auto aspect-square w-full max-w-md">
              <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full" aria-hidden>
                <circle cx="50" cy="50" r="38" fill="none" stroke="#2a6cdc" strokeOpacity="0.15" strokeDasharray="1.5 2" />
                <circle cx="50" cy="50" r="26" fill="none" stroke="#2a6cdc" strokeOpacity="0.1" />
                {ORBIT.map((o) => (
                  <line key={o.label} x1="50" y1="50" x2={o.x} y2={o.y} stroke="#2a6cdc" strokeOpacity="0.18" strokeWidth="0.4" />
                ))}
              </svg>
              <div className="absolute top-1/2 left-1/2 flex w-40 -translate-x-1/2 -translate-y-1/2 flex-col items-center rounded-3xl border border-blue-100 bg-white/90 px-4 py-5 text-center shadow-lg shadow-blue-600/10 backdrop-blur">
                <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-md shadow-blue-600/30">
                  <Icon name="chat" size={26} />
                </span>
                <p className="mt-3 text-sm leading-snug font-semibold text-zinc-900">Messagerie unifiée</p>
                <p className="mt-0.5 text-[11px] text-blue-700">WhatsApp · Instagram · Site</p>
              </div>
              {ORBIT.map((o) => (
                <div key={o.label} className="absolute flex w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center" style={{ left: `${o.x}%`, top: `${o.y}%` }}>
                  <span className="flex h-11 w-11 items-center justify-center rounded-full border border-blue-100 bg-white text-blue-600 shadow-sm">
                    <Icon name={o.icon} size={19} />
                  </span>
                  <span className="mt-1.5 text-[11px] leading-tight font-medium text-zinc-700">{o.label}</span>
                </div>
              ))}
            </div>
            <div className="hidden space-y-3 xl:block">
              {[
                ["Un seul endroit", "Toutes vos conversations clients."],
                ["Toujours disponible", "Réponses en quelques secondes, même la nuit."],
                ["Vous gardez la main", "L'IA passe le relais dès qu'un humain est demandé."],
              ].map(([t, d]) => (
                <div key={t} className="rounded-2xl border border-zinc-200 bg-white/80 p-4 shadow-sm backdrop-blur">
                  <p className="text-sm font-semibold text-zinc-900">{t}</p>
                  <p className="mt-0.5 text-sm text-zinc-500">{d}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-zinc-200 bg-white/85 p-5 shadow-sm backdrop-blur">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Icon name={f.icon} size={20} />
                </span>
                <p className="mt-4 font-semibold text-zinc-900">{f.title}</p>
                <p className="mt-1 text-sm leading-relaxed text-zinc-500">{f.text}</p>
              </div>
            ))}
          </div>

          {/* À propos */}
          <section id="a-propos" className="mt-14 scroll-mt-8 rounded-3xl border border-zinc-200 bg-white/90 p-7 shadow-sm backdrop-blur">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900">À propos de Stark Marketing</h2>
            <p className="mt-3 leading-relaxed text-zinc-600">
              Stark Marketing est une plateforme qui confie vos conversations clients à un <strong className="text-zinc-900">agent IA formé sur votre entreprise</strong> : il lit votre site,
              apprend vos produits, vos prix et vos réponses habituelles, puis répond à vos clients comme le ferait votre meilleur vendeur.
            </p>
            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              {(
                [
                  ["chat", "Une messagerie pour tout", "WhatsApp, Instagram et le chat de votre site arrivent au même endroit. L'IA répond, vous voyez tout et reprenez la main quand vous voulez."],
                  ["instagram", "Instagram qui travaille pour vous", "Campagnes de publications et de stories avec vos vrais produits, sondages, réponses aux commentaires et suivi des nouveaux abonnés."],
                  ["megaphone", "Des envois qui respectent votre numéro", "Diffusions WhatsApp au compte-gouttes, avec variantes de messages, horaires et désinscription « STOP »."],
                  ["briefcase", "Un vrai suivi commercial", "Contacts, tags posés par l'IA, opportunités qui avancent seules, tableau de bord et alertes quand un client veut un humain."],
                ] as [IconName, string, string][]
              ).map(([icon, t, d]) => (
                <div key={t} className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                    <Icon name={icon} size={18} />
                  </span>
                  <div>
                    <p className="font-semibold text-zinc-900">{t}</p>
                    <p className="mt-0.5 text-sm leading-relaxed text-zinc-500">{d}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-6 text-sm text-zinc-500">
              Pour qui ? Les boutiques en ligne, marques, salons, agences et indépendants qui reçoivent des messages clients chaque jour et veulent y répondre vite, sans y passer leurs soirées.
            </p>
          </section>
          <p className="mt-8 pb-4 text-center text-xs text-zinc-400 lg:text-left">© 2026 Stark Marketing</p>
        </section>

        {/* Formulaire */}
        <section className="order-1 lg:order-2">
          <div className="lg:sticky lg:top-8">
            <Suspense fallback={<div className="h-[34rem] rounded-3xl border border-zinc-200 bg-white" />}>
              <LoginForm />
            </Suspense>
          </div>
        </section>
      </div>
    </main>
  );
}
