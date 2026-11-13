// OpenRouter, for asking a cheap model to write from the phone: the models the Leash Log allows, checking a pasted key, and
// asking the model chosen in Settings (Write with AI, components/WalkNotes.js). The key itself is kept in the iPhone's
// Keychain (platform/secrets) and only ever sent to openrouter.ai.

const API = "https://openrouter.ai/api/v1";
export const NEW_KEY_URL = "https://openrouter.ai/settings/keys";

/**
 * The models allowed, for writing only, in the order Settings lists them.
 * - `rates`: OpenRouter's dollars per million tokens, [in, out], as of 2026-11-12, used until the day's live ones are
 *   fetched (modelPrices.js).
 * - `tokens`: what the model's reply to a Write with AI prompt usually comes to, thinking included, [low, high]: the
 *   10th to 90th percentile of its runs in the Nov. 12 tests (docs/ai-writing-helper.md). With PROMPT_TOKENS, they give
 *   the cost of a post that Settings and the split button show.
 */
export const MODELS = [
  { id: "anthropic/claude-haiku-5.5", label: "Claude Haiku 5.5", rates: [0.1, 0.5], tokens: [1800, 2800] },
  { id: "anthropic/claude-sonnet-5.5", label: "Claude Sonnet 5.5", rates: [2, 10], tokens: [1200, 2000] },
  { id: "openai/gpt-6-luna", label: "GPT-6 Luna", rates: [0.1, 0.5], tokens: [500, 1600] },
  { id: "openai/gpt-6.1-sol", label: "GPT-6.1 Sol", rates: [2, 10], tokens: [500, 900] },
  { id: "minimax/minimax-m3.1-flash", label: "MiniMax M3.1 Flash", rates: [0.15, 0.6], tokens: [1400, 4900] },
];

/** A Write with AI prompt's size in tokens, [low, high]: the style guide and instructions, plus the notes and captions. */
export const PROMPT_TOKENS = [1000, 1700];
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

/** Where OpenRouter lists every model with its price, public and with no key. */
export const MODELS_URL = `${API}/models`;

const perMillion = (perToken) => Math.round(Number(perToken) * 1e6 * 1e4) / 1e4;

/**
 * The allowed models' rates from OpenRouter's list of models (MODELS_URL's reply), as MODELS' `rates`.
 * @returns {Record<string, [number, number] | null>} By model id, dollars per million tokens [in, out]; null for one
 *   OpenRouter no longer lists.
 */
export function pricesFrom(list) {
  const byId = new Map((list?.data ?? []).map((m) => [m.id, m.pricing]));
  return Object.fromEntries(
    MODELS.map(({ id }) => {
      const p = byId.get(id);
      return [id, p ? [perMillion(p.prompt), perMillion(p.completion)] : null];
    }),
  );
}

/** Cents, roughly: one significant figure under a cent, two from there (0.04, 0.2, 1.4), whole from 10. */
function cents(n) {
  if (n >= 10) return String(Math.round(n));
  return String(Number(n.toPrecision(n < 1 ? 1 : 2)));
}

/**
 * What a Write with AI post usually costs with a model, in cents, as a range: "0.1–0.2¢ a post". From the day's rates
 * when there are some (`prices`, from modelPrices.js), or the ones written in MODELS.
 */
export function priceText(model, prices) {
  const rates = model.id in prices ? prices[model.id] : model.rates;
  if (!rates) return "No longer on OpenRouter";
  const cost = (i) => ((PROMPT_TOKENS[i] * rates[0] + model.tokens[i] * rates[1]) / 1e6) * 100;
  const [low, high] = [cents(cost(0)), cents(cost(1))];
  return `${low === high ? low : `${low}–${high}`}¢ a post`;
}

/** The model to write with: the one chosen in Settings, or the default when it's one that has since been dropped. */
export const modelOf = (id) => MODELS.find((m) => m.id === id) ?? MODELS.find((m) => m.id === DEFAULT_MODEL);

/**
 * Asks a model to write: the prompt goes in as one message, and its reply comes back as text, with what it cost. The
 * budget is generous because some models think for thousands of tokens before they write, and the thinking counts.
 * @param {{ key: string, model: string, prompt: string, signal?: AbortSignal }} args `signal` stops it (Stop).
 * @returns {Promise<{ text: string, cost: number | null }>} `cost` in dollars, as OpenRouter charged it.
 * @throws {OpenRouterError} When it can't be asked, doesn't answer (with its `cost`), or is stopped (code "stopped").
 */
export async function askModel({ key, model, prompt, signal }) {
  const stopped = () => new OpenRouterError("stopped", "Stopped.");
  let res;
  try {
    res = await fetch(`${API}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 8000,
        usage: { include: true },
      }),
      signal,
    });
  } catch {
    if (signal?.aborted) throw stopped();
    throw new OpenRouterError("offline", "Couldn't reach OpenRouter. Check the connection and try again.");
  }
  if (res.status === 401 || res.status === 403)
    throw new OpenRouterError("rejected", "OpenRouter doesn't know the saved key. Replace it in Settings.");
  if (res.status === 402)
    throw new OpenRouterError("no_credit", "The key is out of credit. Add some, or raise its limit, on OpenRouter.");
  if (!res.ok) throw new OpenRouterError("failed", `OpenRouter said ${res.status}. Try again in a minute.`);
  let body;
  try {
    body = await res.json();
  } catch (e) {
    if (signal?.aborted) throw stopped();
    throw e;
  }
  const choice = body.choices?.[0];
  const text = choice?.message?.content?.trim();
  const cost = body.usage?.cost ?? null;
  if (!text) {
    const e = new OpenRouterError(
      "empty",
      choice?.finish_reason === "length"
        ? "The model ran out of room thinking and wrote nothing. Try again, or pick another model in Settings."
        : "The model sent back nothing. Try again, or pick another model in Settings.",
    );
    // an empty reply is still charged for its thinking
    e.cost = cost;
    throw e;
  }
  return { text, cost };
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
