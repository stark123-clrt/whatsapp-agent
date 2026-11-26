import "server-only";

/**
 * Client IA : Cloudflare Workers AI.
 * - Texte + images : DeepSeek (API compatible OpenAI, le modèle lit les images).
 * - Messages vocaux : Whisper large v3 turbo.
 * Configuration dans `.env.local` (voir `.env.example`).
 */

export type ContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
};

const DEFAULT_MODEL = "@cf/deepseek-ai/deepseek-v4.1-flash-1017";
const WHISPER_MODEL = "@cf/openai/whisper-large-v3-turbo";

function config() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    throw new Error(
      "CLOUDFLARE_ACCOUNT_ID et CLOUDFLARE_API_TOKEN doivent être définis dans .env.local",
    );
  }
  return {
    baseUrl: `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai`,
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
    model: process.env.AI_MODEL || DEFAULT_MODEL,
    // Le modèle « réfléchit » avant de répondre : "low" garde des réponses rapides.
    reasoningEffort: process.env.AI_REASONING_EFFORT || "low",
  };
}

async function post<T>(url: string, headers: Record<string, string>, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Cloudflare AI a répondu ${res.status} : ${detail.slice(0, 300)}`);
  }
  return (await res.json()) as T;
}

/** Envoie la conversation au modèle et renvoie le texte de sa réponse. */
export async function generateReply(
  messages: ChatMessage[],
  opts: { maxTokens?: number; temperature?: number; model?: string; reasoningEffort?: string } = {},
): Promise<string> {
  const { baseUrl, headers, model, reasoningEffort } = config();
  const data = await post<{ choices?: { message?: { content?: string | null } }[] }>(
    `${baseUrl}/v1/chat/completions`,
    headers,
    {
      model: opts.model || model,
      messages,
      // Large, car le raisonnement du modèle compte aussi dans cette limite.
      max_tokens: opts.maxTokens ?? 2000,
      temperature: opts.temperature ?? 0.6,
      reasoning_effort: opts.reasoningEffort || reasoningEffort,
    },
  );
  const text = data.choices?.[0]?.message?.content ?? "";
  // Par sécurité, si un modèle renvoie son raisonnement entre <think></think>.
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

// Phrases que Whisper invente sur du silence ou du bruit.
const WHISPER_HALLUCINATIONS = [
  /^sous-titr/i,
  /^merci d'avoir regardé/i,
  /amara\.org/i,
  /^\W*$/,
];

/** Transcrit un message vocal. Renvoie null s'il n'y a rien de compréhensible. */
export async function transcribeAudio(audio: Buffer): Promise<string | null> {
  const { baseUrl, headers } = config();
  const data = await post<{ result?: { text?: string } }>(
    `${baseUrl}/run/${WHISPER_MODEL}`,
    headers,
    { audio: audio.toString("base64"), vad_filter: true },
  );
  const text = data.result?.text?.trim() ?? "";
  if (!text || WHISPER_HALLUCINATIONS.some((re) => re.test(text))) return null;
  return text;
}

const IMAGE_MODEL = "@cf/black-forest-labs/flux-1-schnell";

/** Crée une image (JPEG) à partir d'une description en anglais (campagnes Instagram). */
export async function generateImage(prompt: string): Promise<Buffer> {
  const { baseUrl, headers } = config();
  const data = await post<{ result?: { image?: string } }>(`${baseUrl}/run/${IMAGE_MODEL}`, headers, { prompt: prompt.slice(0, 2000), steps: 8 });
  if (!data.result?.image) throw new Error("Cloudflare n'a pas renvoyé d'image.");
  return Buffer.from(data.result.image, "base64");
}
