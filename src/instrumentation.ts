/**
 * Exécuté une fois au démarrage du serveur : WhatsApp se reconnecte tout de suite
 * (sans attendre qu'on ouvre l'appli), pour ne manquer aucun message après un redémarrage.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { ensureWhatsApp } = await import("./lib/whatsapp");
  // Sans attendre : le serveur doit pouvoir répondre pendant que WhatsApp se connecte.
  void ensureWhatsApp().catch(() => {});
  // Opportunités : règle « après N jours sans activité, déplacer vers… ».
  const { startDealsScheduler } = await import("./lib/deals");
  startDealsScheduler();
}
