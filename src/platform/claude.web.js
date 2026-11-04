// The Claude app's runtime capabilities, when the desk runs as an artifact there: `artifact`, which lets the desk save
// files into itself (its outbox, see services/outbox.js). Anywhere else it's null, and the desk still edits, but can only
// send its requests by hand.

/** @returns {Promise<object|null>} */
export function capability(name) {
  try {
    return window.claude?.use ? window.claude.use(name).catch(() => null) : Promise.resolve(null);
  } catch {
    return Promise.resolve(null);
  }
}

/** The desk's settings, from the page (index.html sets window.DESK). */
export const config = () => window.DESK ?? {};

/** Fetches one of the artifact's own published files, fresh. */
export async function ownFile(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.text();
}
