/**
 * Exécuté une fois au démarrage du serveur : WhatsApp se reconnecte tout de suite
 * (sans attendre qu'on ouvre l'appli), pour ne manquer aucun message après un redémarrage.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  await resetIfRequested();
  const { ensureWhatsApp } = await import("./lib/whatsapp");
  // Sans attendre : le serveur doit pouvoir répondre pendant que WhatsApp se connecte.
  void ensureWhatsApp().catch(() => {});
  // Opportunités : règle « après N jours sans activité, déplacer vers… ».
  const { startDealsScheduler } = await import("./lib/deals");
  startDealsScheduler();
  // Instagram : relance le service et reprend la session enregistrée (si un compte est connecté).
  const { ensureInstagram } = await import("./lib/instagram");
  ensureInstagram();
  // Campagnes Instagram : calendrier, préparation des contenus et publication (toutes les minutes).
  const { startCampaignScheduler } = await import("./lib/campaigns");
  startCampaignScheduler();
  // Commentaires des publications de campagne : relève, réponses, messages privés.
  const { startCommentsScheduler } = await import("./lib/campaign-comments");
  startCommentsScheduler();
  // Croissance Instagram : nouveaux abonnés, suivi en retour, message de bienvenue, relevé quotidien.
  const { startGrowthScheduler } = await import("./lib/followers");
  startGrowthScheduler();
  // Diffusions WhatsApp : envoi au compte-gouttes, programmation, relances.
  const { startBroadcastScheduler } = await import("./lib/broadcasts");
  startBroadcastScheduler();
}

/**
 * Remise à zéro complète, une seule fois, demandée par l'administrateur via la variable RESET_ALL_DATA
 * (valeur unique, par exemple une date). Efface la base, les médias, la session Instagram et la session
 * WhatsApp AVANT que quoi que ce soit ne les ouvre. Un témoin empêche de recommencer au redémarrage suivant.
 */
async function resetIfRequested() {
  const token = (process.env.RESET_ALL_DATA ?? "").trim().replace(/[^\w-]/g, "");
  if (!token) return;
  const { existsSync, readdirSync, rmSync, writeFileSync } = await import("node:fs");
  const path = await import("node:path");
  const dataDir = path.join(process.cwd(), "data");
  const marker = path.join(dataDir, `.reset-${token}`);
  if (existsSync(marker)) return;
  for (const dir of [dataDir, path.join(process.cwd(), ".wa-auth")]) {
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir)) rmSync(path.join(dir, f), { recursive: true, force: true });
  }
  writeFileSync(marker, new Date().toISOString());
  console.log(`[remise à zéro] données effacées (${token})`);
}
