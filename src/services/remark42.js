// The site's comment server, Remark42 at comments.olund.ca: how many comments each update and blog post has, for the
// Comments page. One request for all of them; the thread addresses are the site's (threadUrl() in molund/omc5's
// src/lib/comments.js): the update's own Trackside page.
const HOST = "https://comments.olund.ca";
const SITE_ID = "trackside";
const SITE = "https://clayton-clipper.olund.ca/";

/** A note's thread address, from its `?post=` slug. */
export const threadUrl = (slug) => `${SITE}trackside/${slug}/`;

/** Where the site keeps update photos: a photo file's address there. */
export const photoUrl = (file) => `${SITE}images/sorry-im-a-shitty-photographer/${file}`;

/**
 * The comment counts of several notes, by slug.
 * @param {string[]} slugs
 * @returns {Promise<Map<string, number>>} A slug missing from it has no thread yet: no comments.
 * @throws When the server can't be reached or answers with an error.
 */
export async function commentCounts(slugs) {
  const res = await fetch(`${HOST}/api/v1/counts?site=${SITE_ID}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(slugs.map(threadUrl)),
  });
  if (!res.ok) throw new Error(`The comment server answered ${res.status}.`);
  const bySlug = new Map(slugs.map((s) => [threadUrl(s), s]));
  return new Map((await res.json()).map((p) => [bySlug.get(p.url), p.count]));
}
