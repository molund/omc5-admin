// The allowed models' prices, from OpenRouter's public list of models (no key), as weather.js keeps the weather: kept on
// the phone so they show at once and with no signal, and fetched again only once they're a day old. Until the first fetch,
// and anywhere it can't be made (the Claude app can't reach outside servers), the prices written in openrouter.js show.
import { load, save } from "../platform/storage";
import { MODELS_URL, pricesFrom } from "./openrouter.js";

const KEY = "model-prices";
const STALE_MS = 24 * 60 * 60 * 1000;

/** @returns {Record<string, string | null>} The kept prices, by model id; {} before the first fetch. */
export const cachedPrices = () => load(KEY, null)?.prices ?? {};

/**
 * Fetches the day's prices when the kept ones are a day old, and keeps them.
 * @returns {Promise<Record<string, string | null> | null>} The new prices, or null when nothing was fetched.
 */
export async function refreshPrices(now = Date.now()) {
  const cache = load(KEY, null);
  if (cache && now - cache.fetchedAt < STALE_MS) return null;
  try {
    const res = await fetch(MODELS_URL);
    if (!res.ok) return null;
    const prices = pricesFrom(await res.json());
    save(KEY, { fetchedAt: now, prices });
    return prices;
  } catch {
    return null;
  }
}
