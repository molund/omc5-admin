// Comments on updates: one Remark42 thread per update, on the comment server at comments.olund.ca. Shared by the
// progress card and the Trackside page: each update's page anchor, its thread's address and its comment count, and the
// links to the earlier comments on GitHub Discussions (giscus, before the move).

/**
 * The site's public address, for links that leave it: the comment threads' addresses and the Open Graph tags.
 * @type {string}
 */
export const SITE = "https://clayton-clipper.olund.ca/";

/**
 * An update's id on the Trackside page, from its time stamp in UTC, e.g. "2026-10-31T16-30".
 * @param {Date} t The update's time stamp.
 * @returns {string}
 */
export const anchor = (t) => t.toISOString().slice(0, 16).replace(/:/g, "-");

/**
 * An update's GitHub Discussion title from before the move to Remark42, its BC time (UTC−7), e.g. "Update 2026-10-31
 * 09:30": what {@link earlierComments} looks the earlier threads up by.
 * @param {Date} t The update's time stamp.
 * @returns {string}
 */
export const term = (t) =>
  "Update " +
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Dawson_Creek",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  })
    .format(t)
    .replace(",", "");

/**
 * Remark42, the self-hosted comments (comments.olund.ca, on a Google Cloud e2-micro): its address and site ID (the
 * server's SITE).
 */
export const REMARK42 = { host: "https://comments.olund.ca", site: "trackside" };

/**
 * An update's comment thread on Remark42: its own page's address, in full, so it's the same thread wherever the update
 * shows.
 * @param {string} slug The update's slug.
 * @returns {string}
 */
export const threadUrl = (slug) => new URL(`trackside/${slug}/`, SITE).href;

/**
 * The updates that had comments on GitHub Discussions (giscus) before the move to Remark42, by thread title (see
 * {@link term}), and the number of their discussion on GitHub: Trackside links to them as earlier comments.
 * @type {Record<string, number>}
 */
const EARLIER = {
  "Update 2026-10-31 09:30": 23,
  "Update 2026-11-06 08:45": 71,
  "Update 2026-11-16 09:00": 96,
  "Update 2026-11-19 16:00": 99,
};

/**
 * The address of an update's earlier comments on GitHub, if it had any before the move to Remark42.
 * @param {Date} t The update's time stamp.
 * @returns {string|undefined}
 */
export const earlierComments = (t) =>
  EARLIER[term(t)] && `https://github.com/molund/omc5/discussions/${EARLIER[term(t)]}`;

/**
 * Comment counts for several Remark42 threads at once, in one request.
 * @param {string[]} urls The threads' addresses (see {@link threadUrl}).
 * @returns {Promise<Record<string, number>>} The counts by address; empty if the server can't be reached.
 */
export function fetchRemarkCounts(urls) {
  return fetch(`${REMARK42.host}/api/v1/counts?site=${REMARK42.site}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(urls),
  })
    .then((r) => (r.ok ? r.json() : []))
    .then((list) => Object.fromEntries(list.map((p) => [p.url, p.count])))
    .catch(() => ({}));
}

/**
 * @typedef {object} FrozenComment A comment as it was when the site was built.
 * @property {string} name Its author's name.
 * @property {string} time When it was posted, as an ISO time stamp.
 * @property {string} html Its text, as the HTML Remark42 made from it (Remark42 cleans it of scripts and the like).
 * @property {FrozenComment[]} replies The replies to it, oldest first.
 */

/**
 * The comments of a thread, read from Remark42 when the site is built (trackside/prerender.js), for an update whose comments
 * are read-only (`comments: readonly` in status.yaml); deleted ones are left out, but their replies stay.
 * @param {string} url The thread's address (see {@link threadUrl}).
 * @returns {Promise<{ count: number, comments: FrozenComment[] }>}
 */
export async function freezeThread(url) {
  const q = new URLSearchParams({ site: REMARK42.site, url, format: "tree", sort: "+time" });
  const r = await fetch(`${REMARK42.host}/api/v1/find?${q}`);
  if (!r.ok) throw new Error(`Remark42 answered ${r.status} for ${url}`);
  let count = 0;
  const shape = (nodes = []) =>
    nodes.flatMap(({ comment: c, replies }) => {
      const below = shape(replies);
      if (c.delete) return below;
      count++;
      return [{ name: c.user?.name ?? "", time: c.time, html: c.text, replies: below }];
    });
  const comments = shape((await r.json()).comments);
  return { count, comments };
}

/** Where trackside/prerender.js writes the read-only threads, by update slug, beside Trackside's pages. */
export const FROZEN = "trackside/comments.json";

/**
 * The read-only threads, by update slug, from the site itself (GitHub Pages), not from the comment server.
 * @returns {Promise<Record<string, { count: number, comments: FrozenComment[] }>>} Empty if it can't be read.
 */
export function fetchFrozen() {
  return fetch(`${import.meta.env.BASE_URL}${FROZEN}`)
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
}
