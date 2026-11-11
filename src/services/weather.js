// Each day's rain or snow in Cloverdale, BC, for the day bars in Velocity, from Open-Meteo (free, no key). Kept on the phone so
// the icons show at once and with no signal; fetched again only when it's over an hour old or today or yesterday is missing.
// Anywhere the request can't be made (the Claude app can't reach outside servers), it just stays empty.
import { load, save } from "../platform/storage";
import { dayOf, todayKey } from "../lib/time.js";

const KEY = "weather";
const URL =
  "https://api.open-meteo.com/v1/forecast?latitude=49.10&longitude=-122.72&daily=rain_sum,snowfall_sum" +
  "&timezone=America%2FVancouver&forecast_days=1&past_days=";
const RAIN_MM = 5;
const HEAVY_RAIN_MM = 15;
// Open-Meteo gives snowfall in cm: this is 1 mm
const SNOW_CM = 0.1;
const STALE_MS = 60 * 60 * 1000;
const KEEP_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

/** A day's weather icon, or null for a dry one: snow over rain when it had both. */
function kind(rainMm, snowCm) {
  if (snowCm >= SNOW_CM) return "snow";
  if (rainMm >= HEAVY_RAIN_MM) return "heavyRain";
  if (rainMm >= RAIN_MM) return "rain";
  return null;
}

/** @returns {Record<string, "rain" | "heavyRain" | "snow" | null>} The stored days, by BC date. */
export const cachedWeather = () => load(KEY, null)?.days ?? {};

/**
 * Fetches the latest days when the cache needs it, and keeps them.
 * @returns {Promise<Record<string, "rain" | "heavyRain" | "snow" | null> | null>} The new days, or null when nothing changed.
 */
export async function refreshWeather() {
  const cache = load(KEY, null) ?? { fetchedAt: 0, days: {} };
  const yesterday = dayOf(new Date(Date.now() - DAY_MS));
  const fresh = Date.now() - cache.fetchedAt < STALE_MS;
  if (fresh && todayKey() in cache.days && yesterday in cache.days) return null;
  try {
    const res = await fetch(URL + (Object.keys(cache.days).length ? 2 : 31));
    if (!res.ok) return null;
    const { daily } = await res.json();
    const days = { ...cache.days };
    daily.time.forEach((day, i) => {
      days[day] = kind(daily.rain_sum[i] ?? 0, daily.snowfall_sum[i] ?? 0);
    });
    const oldest = dayOf(new Date(Date.now() - KEEP_DAYS * DAY_MS));
    for (const day of Object.keys(days)) if (day < oldest) delete days[day];
    save(KEY, { fetchedAt: Date.now(), days });
    return days;
  } catch {
    return null;
  }
}
