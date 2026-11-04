// Sending the desk's waiting changes to Claude. The desk can't reach GitHub or start a Claude Code session itself, but it
// can save files into its own artifact: Push saves outbox.json (the changes, in order) and the new photos under outbox/.
// Saving republishes the artifact, which wakes the Claude Code session that watches it. That session syncs with main,
// applies each change with tools/apply-changes.mjs, commits and pushes, then publishes main's status.yaml back into the
// desk with copy.json and pushed.json, and clears the outbox.
import { capability } from "../platform/claude.web.js";
import { toBlob } from "../platform/photos.web.js";
import { photosOf } from "../lib/changes.js";

export class DeskError extends Error {
  /**
   * @param {string} code
   * @param {string} message What to do, in plain words.
   * @param {string} [detail] The platform's own words.
   * @param {string} [manual] The request as text, to paste into the session by hand.
   */
  constructor(code, message, detail = "", manual = null) {
    super(message);
    this.code = code;
    this.detail = detail;
    this.manual = manual;
  }
}

const newId = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** The request, as outbox.json holds it. */
function request(kind, changes = [], photos = []) {
  return {
    request: kind,
    id: newId(),
    requestedAt: new Date().toISOString(),
    changes: changes.map((c) => ({
      ...c,
      ...(c.blocks && { blocks: c.blocks.map(({ photoId, k, ...b }) => b) }),
    })),
    photos,
  };
}

/** The request as text to paste into the session, when the desk can't save it. */
function manual(req, hasPhotos) {
  return `Clipper Status Desk ${req.request} request${
    hasPhotos ? " (its photos couldn't be saved: attach them to this message, named as listed)" : ""
  }:\n\n${JSON.stringify(req, null, 1)}\n`;
}

function explain(e, req, hasPhotos) {
  const detail = [e?.code, e?.message].filter(Boolean).join(" · ");
  const text = manual(req, hasPhotos);
  switch (e?.code) {
    case "conflict":
      return new DeskError(
        e.code,
        "The desk was updated while you worked, and it's reloading. Push again once it has.",
        detail,
      );
    case "too_large":
      return new DeskError(
        e.code,
        "The photos are too big to send together. Push fewer changes at a time.",
        detail,
        text,
      );
    case "rate_limited":
      return new DeskError(e.code, "The desk saved too often just now. Wait a minute, then push again.", detail);
    case "not_writer":
    case "not_granted":
    case "not_declared":
    case "capability_disabled":
    case "capability_removed":
    case "consent_required":
      return new DeskError(
        e.code,
        "This view of the desk can't save to it. Open it in the Claude app, signed in as its owner, or send the request by hand.",
        detail,
        text,
      );
    default:
      return new DeskError(
        e?.code ?? "unknown",
        "The request wasn't saved. Try again, or send it by hand.",
        detail,
        text,
      );
  }
}

async function send(req, files, hasPhotos) {
  const artifact = await capability("artifact");
  if (!artifact)
    throw new DeskError(
      "no_artifact",
      "This view of the desk can't save to it. Open it in the Claude app, signed in as its owner, or send the request by hand.",
      'claude.use("artifact") resolved null',
      manual(req, hasPhotos),
    );
  try {
    await artifact.publish({ "outbox.json": JSON.stringify(req, null, 1), ...files });
  } catch (e) {
    throw explain(e, req, hasPhotos);
  }
  return req;
}

/**
 * Sends the waiting changes, with their photos.
 * @returns {Promise<object>} The request sent.
 */
export async function requestPush(changes, photos) {
  const files = {},
    list = [];
  for (const c of changes)
    for (const b of photosOf(c)) {
      if (!b.photoId) continue; // already on the site
      const p = photos[b.photoId];
      if (!p)
        throw new DeskError(
          "photo_missing",
          `The photo for ${b.file} isn't on this device any more. Remove it and add it again.`,
        );
      const path = `outbox/photos/${b.file}`;
      files[path] = { content: await toBlob(p.dataUrl), contentType: "image/jpeg" };
      list.push({ file: b.file, path });
    }
  return send(request("push", changes, list), files, list.length > 0);
}

/** Asks for a fresh copy of main's status.yaml. */
export const requestRefresh = () => send(request("refresh"), {}, false);
