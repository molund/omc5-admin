// The Leash Log's waiting changes, drafts and photos, kept in this browser until they're pushed. Storage can be missing or full
// (a private window, cleared site data), so every read and write is guarded and the Leash Log works without it.
const PREFIX = "status-desk.";

export function load(key, fallback) {
  try {
    const v = window.localStorage.getItem(PREFIX + key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

/** @returns {boolean} Whether it was kept. */
export function save(key, value) {
  try {
    if (value === undefined) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
