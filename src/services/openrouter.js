// OpenRouter, for asking a cheap model to write from the phone: the models the Leash Log allows, and checking a pasted key.
// The key itself is kept in the iPhone's Keychain (platform/secrets) and only ever sent to openrouter.ai. Nothing asks a
// model yet; Settings keeps the key and the chosen model ready for it.

const API = "https://openrouter.ai/api/v1";
export const NEW_KEY_URL = "https://openrouter.ai/settings/keys";

/** The models allowed, for writing only, cheapest output first. Prices are OpenRouter's, per million tokens in / out (2026-11-12). */
export const MODELS = [
  { id: "xiaomi/mimo-v2.6-flash", label: "MiMo-V2.6-Flash", price: "$0.14 / $0.28" },
  { id: "minimax/minimax-m3.1-flash", label: "MiniMax M3.1 Flash", price: "$0.07 / $0.30" },
  { id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5", price: "$0.10 / $0.50" },
  { id: "openai/gpt-6-luna", label: "GPT-6 Luna", price: "$0.10 / $0.50" },
];
export const DEFAULT_MODEL = "anthropic/claude-haiku-5.5";

export class OpenRouterError extends Error {
  /**
   * @param {string} code
   * @param {string} message What to do, in plain words.
   */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

/**
 * Checks a pasted key with OpenRouter, and reads its credit limit.
 * @returns {Promise<{ last4: string, limit: number|null, limitRemaining: number|null, checkedAt: string }>} The limits in
 *   dollars; null when the key has none.
 */
export async function checkKey(raw) {
  const key = raw.trim();
  if (!key) throw new OpenRouterError("empty", "Paste the key first.");
  if (!key.startsWith("sk-or-"))
    throw new OpenRouterError("not_a_key", "That doesn't look like an OpenRouter key (they start with sk-or-).");
  let res;
  try {
    res = await fetch(`${API}/key`, { headers: { Authorization: `Bearer ${key}` } });
  } catch {
    throw new OpenRouterError("offline", "Couldn't reach OpenRouter. Check the connection and try again.");
  }
  if (res.status === 401 || res.status === 403)
    throw new OpenRouterError("rejected", "OpenRouter doesn't know that key. Check it, or make a new one.");
  if (!res.ok) throw new OpenRouterError("failed", `OpenRouter said ${res.status}. Try again in a minute.`);
  const { data } = await res.json();
  return {
    last4: key.slice(-4),
    limit: data?.limit ?? null,
    limitRemaining: data?.limit_remaining ?? null,
    checkedAt: new Date().toISOString(),
  };
}
