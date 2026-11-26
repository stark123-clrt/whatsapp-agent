import "server-only";

import { generateReply } from "./ai";
import { agentMarketingContext } from "./campaign-context";
import { getCampaign, listCampaigns } from "./campaigns";
import { db, setChatAgent } from "./db";
import { dmUser, fetchComments, instagramConnected, replyToComment } from "./instagram";
import { getAgent } from "./kb";
import { buildAgentPrompt } from "./knowledge";

/**
 * Commentaires des publications de campagne : l'IA les lit, les classe (question, intérêt, compliment,
 * négatif, spam), prépare une réponse publique, un message privé avec le lien et un « j'aime ».
 * Validation par toi (campagne « je valide ») ou envoi automatique avec un délai humain.
 * Négatif → alerte, jamais de réponse automatique. Spam → ignoré. Limites par jour respectées.
 */

db.exec(`
  CREATE TABLE IF NOT EXISTS campaign_comments (
    comment_id TEXT PRIMARY KEY,
    campaign_id INTEGER NOT NULL,
    post_id INTEGER NOT NULL,
    media_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    full_name TEXT,
    text TEXT NOT NULL,
    ts INTEGER NOT NULL,
    category TEXT,
    reply_text TEXT,
    dm_text TEXT,
    do_like INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'new',
    do_at INTEGER,
    done_at INTEGER,
    dm_jid TEXT,
    note TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS campaign_comments_campaign ON campaign_comments(campaign_id, status);
`);

export type CommentCategory = "question" | "interest" | "compliment" | "negative" | "spam" | "other";
export type CommentStatus = "new" | "pending" | "scheduled" | "done" | "ignored" | "alert" | "skipped" | "failed";
export type CampaignComment = {
  commentId: string;
  campaignId: number;
  postId: number;
  username: string;
  fullName: string | null;
  text: string;
  ts: number;
  category: CommentCategory | null;
  replyText: string | null;
  dmText: string | null;
  like: boolean;
  status: CommentStatus;
  doAt: number | null;
  doneAt: number | null;
  dmJid: string | null;
  note: string | null;
  postHeadline: string | null;
};

type Row = {
  comment_id: string;
  campaign_id: number;
  post_id: number;
  media_id: string;
  user_id: string;
  username: string;
  full_name: string | null;
  text: string;
  ts: number;
  category: CommentCategory | null;
  reply_text: string | null;
  dm_text: string | null;
  do_like: number;
  status: CommentStatus;
  do_at: number | null;
  done_at: number | null;
  dm_jid: string | null;
  note: string | null;
  headline?: string | null;
};
const toComment = (r: Row): CampaignComment => ({
  commentId: r.comment_id,
  campaignId: r.campaign_id,
  postId: r.post_id,
  username: r.username,
  fullName: r.full_name,
  text: r.text,
  ts: r.ts,
  category: r.category,
  replyText: r.reply_text,
  dmText: r.dm_text,
  like: r.do_like === 1,
  status: r.status,
  doAt: r.do_at,
  doneAt: r.done_at,
  dmJid: r.dm_jid,
  note: r.note,
  postHeadline: r.headline ?? null,
});

export function listComments(campaignId: number): CampaignComment[] {
  return (
    db
      .prepare(`SELECT cc.*, p.headline FROM campaign_comments cc LEFT JOIN campaign_posts p ON p.id = cc.post_id WHERE cc.campaign_id = ? ORDER BY cc.ts DESC LIMIT 200`)
      .all(campaignId) as Row[]
  ).map(toComment);
}

function getRow(commentId: string) {
  return db.prepare(`SELECT * FROM campaign_comments WHERE comment_id = ?`).get(commentId) as Row | undefined;
}

const DAY = 86_400_000;
const humanDelay = () => (2 + Math.random() * 10) * 60_000; // 2 à 12 minutes, comme un humain

// ---------- Préparation de la réponse ----------

type Draft = { category: CommentCategory; reply: string; dm: string | null; like: boolean };

async function draftFor(campaignId: number, postId: number, comment: { username: string; text: string }): Promise<Draft> {
  const c = getCampaign(campaignId)!;
  const agent = c.agentId ? getAgent(c.agentId) : null;
  const post = db
    .prepare(`SELECT p.kind, p.headline, p.caption, pr.title, pr.url, pr.price_cents FROM campaign_posts p LEFT JOIN products pr ON pr.id = p.product_id WHERE p.id = ?`)
    .get(postId) as { kind: string; headline: string | null; caption: string | null; title: string | null; url: string | null; price_cents: number | null } | undefined;
  const s = c.settings.interactions;
  const system = [
    agent ? buildAgentPrompt(agent, comment.text, null) : "Tu es le community manager de la marque.",
    agent ? agentMarketingContext(agent.id, comment.text) : "",
    [
      "TU RÉPONDS À UN COMMENTAIRE PUBLIC SOUS UNE PUBLICATION INSTAGRAM DE LA MARQUE.",
      `Publication concernée : « ${post?.headline ?? ""} »${post?.title ? ` — produit « ${post.title} »${post.url ? ` (${post.url})` : ""}` : ""}.`,
      "Règles :",
      "- La réponse publique est courte (1 à 2 phrases), chaleureuse, naturelle, avec 0 à 1 émoji. Pas de lien dans la réponse publique (Instagram ne les rend pas cliquables).",
      s.dmCommenters
        ? "- Si la personne pose une question ou montre de l'intérêt (prix, taille, livraison, « je veux », « dispo ? »…), la réponse publique dit que tu lui écris en privé, et tu rédiges le message privé : réponse précise + lien complet de la fiche produit."
        : "- Ne propose pas de message privé : réponds directement en public, sans lien.",
      "- Compliment : remercie simplement (pas de message privé).",
      "- Critique, plainte ou ton agressif : catégorie « negative », réponse vide (un humain s'en occupe).",
      "- Spam, pub d'un autre compte, arnaque : catégorie « spam », réponse vide.",
      "N'invente jamais un prix, une taille ou un délai : utilise uniquement les informations fournies.",
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n\n");
  const user = [
    `Commentaire de @${comment.username} : « ${comment.text} »`,
    'Réponds UNIQUEMENT avec un objet JSON : {"category": "question | interest | compliment | negative | spam | other", "reply": "réponse publique (vide si negative ou spam)", "dm": "message privé ou null", "like": true ou false}',
  ].join("\n\n");

  const raw = await generateReply([{ role: "system", content: system }, { role: "user", content: user }], { temperature: 0.6, maxTokens: 1500 });
  const json = JSON.parse(raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1)) as Partial<Draft>;
  const categories: CommentCategory[] = ["question", "interest", "compliment", "negative", "spam", "other"];
  const category = categories.includes(json.category as CommentCategory) ? (json.category as CommentCategory) : "other";
  return {
    category,
    reply: category === "negative" || category === "spam" ? "" : String(json.reply ?? "").slice(0, 400),
    dm: s.dmCommenters && json.dm && typeof json.dm === "string" ? json.dm.slice(0, 900) : null,
    like: category !== "negative" && category !== "spam" && json.like !== false,
  };
}

function countToday(campaignId: number, what: "reply" | "dm") {
  const col = what === "reply" ? "reply_text" : "dm_jid";
  return (db.prepare(`SELECT COUNT(*) AS n FROM campaign_comments WHERE campaign_id = ? AND status = 'done' AND done_at > ? AND ${col} IS NOT NULL AND ${col} != ''`).get(campaignId, Date.now() - DAY) as { n: number }).n;
}

async function prepare(row: Row) {
  const c = getCampaign(row.campaign_id);
  if (!c) return;
  try {
    const d = await draftFor(row.campaign_id, row.post_id, { username: row.username, text: row.text });
    const s = c.settings.interactions;
    // Mot-clé : message privé seulement si le commentaire le contient.
    const keywordOk = !s.keyword.trim() || row.text.toLowerCase().includes(s.keyword.trim().toLowerCase());
    let dm = s.dmCommenters && keywordOk ? d.dm : null;
    let reply = s.replyComments ? d.reply : "";
    let status: CommentStatus = c.settings.approval === "auto" ? "scheduled" : "pending";
    let note: string | null = null;
    if (d.category === "negative") {
      status = "alert";
      note = "Commentaire négatif : à traiter par toi (aucune réponse automatique).";
    } else if (d.category === "spam") {
      status = "ignored";
      note = "Spam ignoré.";
    } else if (!reply && !dm && !d.like) {
      status = "ignored";
      note = "Rien à répondre.";
    }
    if (status === "scheduled" || status === "pending") {
      if (reply && countToday(c.id, "reply") >= s.maxReplies) {
        reply = "";
        note = `Limite de ${s.maxReplies} réponses par jour atteinte.`;
      }
      if (dm && countToday(c.id, "dm") >= s.maxDms) {
        dm = null;
        note = `Limite de ${s.maxDms} messages privés par jour atteinte.`;
      }
      if (!reply && !dm && !d.like) status = "skipped";
    }
    db.prepare(`UPDATE campaign_comments SET category = ?, reply_text = ?, dm_text = ?, do_like = ?, status = ?, do_at = ?, note = ? WHERE comment_id = ?`).run(
      d.category, reply || null, dm, d.like ? 1 : 0, status, status === "scheduled" ? Date.now() + humanDelay() : null, note, row.comment_id,
    );
  } catch (err) {
    db.prepare(`UPDATE campaign_comments SET status = 'failed', note = ? WHERE comment_id = ?`).run(err instanceof Error ? err.message.slice(0, 200) : "Préparation impossible.", row.comment_id);
  }
}

// ---------- Envoi ----------

async function execute(row: Row) {
  const c = getCampaign(row.campaign_id);
  try {
    if (row.reply_text || row.do_like) await replyToComment(row.media_id, row.comment_id, row.reply_text ?? "", row.do_like === 1);
    let jid: string | null = null;
    if (row.dm_text) {
      jid = await dmUser(row.user_id, row.dm_text, row.full_name || `@${row.username}`);
      if (jid && c?.agentId) setChatAgent(jid, c.agentId); // la suite de la conversation reste avec l'agent de la campagne
    }
    db.prepare(`UPDATE campaign_comments SET status = 'done', done_at = ?, dm_jid = ? WHERE comment_id = ?`).run(Date.now(), jid, row.comment_id);
  } catch (err) {
    db.prepare(`UPDATE campaign_comments SET status = 'failed', note = ? WHERE comment_id = ?`).run(err instanceof Error ? err.message.slice(0, 200) : "Envoi impossible.", row.comment_id);
  }
}

/** Action depuis l'interface : valider (avec modifications éventuelles), ignorer, ou réessayer. */
export function actOnComment(commentId: string, action: "approve" | "ignore" | "retry", edit: { reply?: string; dm?: string | null } = {}) {
  const row = getRow(commentId);
  if (!row) throw new Error("Commentaire introuvable.");
  if (row.status === "done") throw new Error("Déjà traité.");
  if (action === "ignore") {
    db.prepare(`UPDATE campaign_comments SET status = 'ignored', note = 'Ignoré par toi.' WHERE comment_id = ?`).run(commentId);
    return;
  }
  if (action === "retry") {
    db.prepare(`UPDATE campaign_comments SET status = 'new', note = NULL WHERE comment_id = ?`).run(commentId);
    return;
  }
  const reply = edit.reply !== undefined ? edit.reply.trim().slice(0, 400) : row.reply_text;
  const dm = edit.dm !== undefined ? (edit.dm?.trim().slice(0, 900) || null) : row.dm_text;
  // Validé à la main : envoi dans 30 à 90 secondes.
  db.prepare(`UPDATE campaign_comments SET reply_text = ?, dm_text = ?, status = 'scheduled', do_at = ?, note = NULL WHERE comment_id = ?`).run(
    reply || null, dm, Date.now() + (30 + Math.random() * 60) * 1000, commentId,
  );
}

// ---------- Tâche de fond ----------

const g = globalThis as typeof globalThis & { __commentsTimer?: NodeJS.Timeout; __commentsBusy?: boolean; __commentsPolledAt?: number };

async function tick() {
  if (g.__commentsBusy) return;
  const connected = instagramConnected();
  g.__commentsBusy = true;
  try {
    // Relève toutes les 3 minutes : publications de campagne des 7 derniers jours.
    if (connected && Date.now() - (g.__commentsPolledAt ?? 0) > 3 * 60_000) {
      g.__commentsPolledAt = Date.now();
      for (const c of listCampaigns()) {
        if (c.status !== "active" && c.status !== "paused") continue;
        if (!c.settings.interactions.replyComments && !c.settings.interactions.dmCommenters) continue;
        const posts = db
          .prepare(`SELECT id, media_id, published_at FROM campaign_posts WHERE campaign_id = ? AND kind = 'post' AND status = 'published' AND media_id IS NOT NULL AND published_at > ?`)
          .all(c.id, Date.now() - 7 * DAY) as { id: number; media_id: string; published_at: number }[];
        for (const p of posts) {
          const list = await fetchComments(p.media_id).catch(() => []);
          for (const cm of list) {
            if (cm.ts < Date.now() - 2 * DAY) continue; // on ne répond jamais à de vieux commentaires
            db.prepare(
              `INSERT OR IGNORE INTO campaign_comments (comment_id, campaign_id, post_id, media_id, user_id, username, full_name, text, ts, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
            ).run(cm.id, c.id, p.id, p.media_id, cm.userId, cm.username, cm.fullName, cm.text, cm.ts, Date.now());
          }
          await new Promise((r) => setTimeout(r, 1500 + Math.random() * 1500)); // pas de rafale de requêtes
        }
      }
    }
    // Préparation : 3 commentaires par minute au maximum.
    const fresh = db.prepare(`SELECT * FROM campaign_comments WHERE status = 'new' ORDER BY ts LIMIT 3`).all() as Row[];
    for (const r of fresh) await prepare(r);
    // Envoi : un à la fois, campagne active uniquement.
    const due = db
      .prepare(`SELECT cc.* FROM campaign_comments cc JOIN campaigns c ON c.id = cc.campaign_id WHERE cc.status = 'scheduled' AND cc.do_at <= ? AND c.status = 'active' ORDER BY cc.do_at LIMIT 1`)
      .get(Date.now()) as Row | undefined;
    if (due && connected) await execute(due);
  } catch (err) {
    console.error(`[commentaires] ${err instanceof Error ? err.message : err}`);
  } finally {
    g.__commentsBusy = false;
  }
}

export function startCommentsScheduler() {
  if (g.__commentsTimer) return;
  g.__commentsTimer = setInterval(() => void tick(), 60_000);
}
export const runCommentsTick = tick;
