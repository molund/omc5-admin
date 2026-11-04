// The desk's waiting changes, drafts and photos, kept on the phone (a SQLite key-value store) until they're pushed. Its
// calls are synchronous, like localStorage's, so this has the same shape as storage.web.js. Reads and writes are guarded:
// a full or unavailable store shouldn't stop the desk working.
import Storage from "expo-sqlite/kv-store";

const PREFIX = "status-desk.";

export function load(key, fallback) {
  try {
    const v = Storage.getItemSync(PREFIX + key);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}

/** @returns {boolean} Whether it was kept. */
export function save(key, value) {
  try {
    if (value === undefined) Storage.removeItemSync(PREFIX + key);
    else Storage.setItemSync(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
