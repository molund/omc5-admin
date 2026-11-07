// Sending the desk's waiting changes to Claude. The desk can't reach GitHub itself, but it can save files into its own
// artifact: Push saves outbox.json (the changes, in order) and the new photos under outbox/. The desk then starts the
// "Answer the Status Desk" scheduled task (pushTrigger in desk.config.json) through the Claude Code Remote connector, which
// wakes the Claude Code session it's bound to; that session follows docs/push-session.md. It syncs with main, applies each change with
// tools/apply-changes.mjs, commits and pushes, then publishes main's status.yaml back into the desk with copy.json and
// pushed.json, and clears the outbox.
import { Platform } from "react-native";
import { capability, config } from "../platform/claude";
import { toBlob } from "../platform/photos";
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
      Platform.OS === "web"
        ? "This view of the desk can't save to it. Open it in the Claude app, signed in as its owner, or send the request by hand."
        : "The phone can't push to main yet. Copy the request and send it to Claude Code by hand.",
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

const CONNECTOR = "Claude Code Remote";

/** What to paste into a new Claude Code chat when the desk can't start one itself. */
export const byHand = (req) =>
  `Answer the Clipper Status Desk's ${req.request} request ${req.id} in ${config().artifactUrl}, following docs/push-session.md in molund/omc5-admin.`;

function explainStart(e, req) {
  const detail = [e?.code, e?.message].filter(Boolean).join(" · ");
  const fail = (message, unsure = false) =>
    Object.assign(new DeskError(e?.code ?? "unknown", message, detail, byHand(req)), { unsure });
  switch (e?.code) {
    case "approval_required":
    case "not_in_manifest":
    case "consent_required":
      return fail(
        "Claude Code wasn't allowed to start from the desk. Allow Claude Code Remote when the desk asks (or in its Permissions menu), then start it again.",
      );
    case "server_not_connected":
    case "server_not_found":
    case "selection_required":
      return fail(
        "Claude Code Remote isn't connected. Add it in claude.ai Settings → Connectors, then start it again.",
      );
    case "needs_reauth":
      return fail("Claude Code Remote needs reconnecting in claude.ai Settings → Connectors. Then start it again.");
    case "blocked_by_policy":
      return fail(
        "Starting Claude Code from the desk isn't allowed for this account. Copy the request into a new chat.",
      );
    case "tool_error":
      return fail("The scheduled task didn't start. Start it again, or copy the request into a new chat.");
    case "not_granted":
    case "capability_disabled":
    case "capability_removed":
      return fail("This view of the desk can't start Claude Code. Copy the request into a new Claude Code chat.");
    default:
      // the call may have reached Claude Code: don't start another unasked
      return fail(
        "The desk couldn't tell whether Claude Code started. Give it a few minutes; if nothing happens, start it again.",
        true,
      );
  }
}

/** Starts the Claude Code session that answers a saved request: the desk's scheduled task. */
export async function startSession(req) {
  const trigger = config().pushTrigger;
  const mcp = trigger ? await capability("mcp") : null;
  if (!mcp)
    throw new DeskError(
      "no_mcp",
      "This view of the desk can't start Claude Code. Copy the request into a new Claude Code chat.",
      trigger ? 'claude.use("mcp") resolved null' : "no pushTrigger in desk.config.json",
      byHand(req),
    );
  try {
    await mcp.callTool(
      CONNECTOR,
      "fire_trigger",
      { trigger_id: trigger, text: `The desk's ${req.request} request ${req.id}, saved ${req.requestedAt}.` },
      { cache: false },
    );
  } catch (e) {
    throw explainStart(e, req);
  }
}
