// The desk's state. Its database is its own copy of status.yaml (published with the artifact as status.yaml) plus the list of
// waiting changes on top of it, kept on this device. What every screen shows is that copy with the changes applied.
// Pushing hands the list to a Claude Code session, which syncs with main first, then commits each change and refreshes the
// copy, listing what it committed in pushed.json; the desk then drops those from its list. A request saved in the outbox and
// not yet handled is `pending`; the desk starts the session for it once (`started`, services/outbox.js).
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { commitMessage, photosOf } from "../lib/changes.js";
import { applyAllBoth, applyBoth } from "../lib/deskChanges.js";
import { EMPTY_DESK, parseDesk } from "../lib/deskFile.js";
import { replaceChangeIn } from "../lib/entries.js";
import { velocity } from "../lib/velocity.js";
import { parseStatus } from "../lib/statusFile.js";
import { ownFile } from "../platform/claude";
import { startSession } from "../services/outbox.js";
import { load, save } from "../platform/storage";

const DeskContext = createContext(null);
export const useDesk = () => useContext(DeskContext);

const newId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** State kept on this device under a key; with no key, only for as long as it's on screen. */
function usePersisted(key, initial) {
  const [value, setValue] = useState(() => (key ? load(key, initial) : initial));
  const [kept, setKept] = useState(true);
  useEffect(() => {
    if (key) setKept(save(key, value));
  }, [key, value]);
  return [value, setValue, kept];
}

/** Everything a screen reads from the files, for one state of them. */
function viewOf(files) {
  const parsed = parseStatus(files.status);
  const deskEntries = parseDesk(files.desk);
  return {
    text: files.status,
    deskText: files.desk,
    parsed,
    deskEntries,
    /** What a draft change would do to the files as they stand: { text, hunks, deskText, deskHunks, error }. */
    preview(change) {
      try {
        const r = applyBoth({ status: files.status, desk: files.desk }, change);
        return { text: r.status, hunks: r.hunks, deskText: r.desk, deskHunks: r.deskHunks, error: null };
      } catch (e) {
        return { text: files.status, hunks: [], deskText: files.desk, deskHunks: [], error: e.message };
      }
    },
    suggestMessage: (change) => commitMessage(change, files.status),
  };
}

export function DeskProvider({ children }) {
  // status.yaml's text, desk.yaml's (the desk's own records: notes to self and the gantry's steps), and where they came from
  const [copy, setCopy] = useState({ text: null, desk: null, error: null, meta: null });
  const [changes, setChanges, changesKept] = usePersisted("changes", []);
  const [photos, setPhotos, photosKept] = usePersisted("photos", {});
  const [push, setPush] = usePersisted("push", null); // { requestId, kind: "push"|"refresh", ids, requestedAt }; on the phone { via: "github", head, … }
  // on the phone, what the desk shows about the GitHub token (the token itself is in the Keychain): { last4, expiresAt, checkedAt, rejected }
  const [tokenInfo, setTokenInfo] = usePersisted("token", null);
  // the request in the desk's outbox that no session has answered yet, and the session started for it:
  // { id, state: "starting"|"started"|"failed"|"unsure", at?, error? }
  const [pending, setPending] = useState(null);
  const [started, setStarted] = usePersisted("started", null);

  // read the copy, and what the last push committed
  const reload = useCallback(async () => {
    try {
      const text = await ownFile("status.yaml");
      // a repo (or a desk published) before desk.yaml existed has none yet
      const deskText = await ownFile("desk.yaml").catch(() => EMPTY_DESK);
      const meta = await ownFile("copy.json")
        .then(JSON.parse)
        .catch(() => null);
      const pushed = await ownFile("pushed.json")
        .then(JSON.parse)
        .catch(() => null);
      const outbox = await ownFile("outbox.json")
        .then(JSON.parse)
        .catch(() => null);
      setCopy({ text, desk: deskText, error: null, meta });
      setPending(outbox?.id && outbox.id !== meta?.handled ? outbox : null);
      if (pushed?.pushed?.length) {
        const done = new Set(pushed.pushed);
        setChanges((cs) => cs.filter((c) => !done.has(c.id)));
        setPush((p) => (p && p.kind === "push" && p.ids.every((id) => done.has(id)) ? null : p));
      }
      // the request the copy says it handled is done
      setPush((p) => (p && meta?.handled && meta.handled === p.requestId ? null : p));
    } catch (e) {
      setCopy((c) => ({ ...c, error: `The desk's copy of status.yaml didn't load (${e.message}).` }));
    }
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  // and every minute after, while the desk is on screen, and as soon as it's back on screen (on the phone, a look at main
  // that finds it unchanged costs nothing against GitHub's limit: platform/claude.native.js)
  useEffect(() => {
    const timer = setInterval(() => AppState.currentState === "active" && reload(), 60 * 1000);
    const sub = AppState.addEventListener("change", (s) => s === "active" && reload());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [reload]);

  // a start the page reloaded in the middle of may or may not have reached Claude Code
  useEffect(() => {
    setStarted((s) => (s?.state === "starting" ? { ...s, state: "unsure" } : s));
  }, []);

  const start = useCallback(async (req) => {
    setStarted({ id: req.id, state: "starting" });
    try {
      await startSession(req);
      setStarted({ id: req.id, state: "started", at: new Date().toISOString() });
    } catch (e) {
      setStarted({
        id: req.id,
        state: e.unsure ? "unsure" : "failed",
        error: { message: e.message, detail: e.detail ?? "", manual: e.manual ?? null },
      });
    }
  }, []);
  // each saved request starts its session once; starting it again is the person's choice
  useEffect(() => {
    if (pending && started?.id !== pending.id) start(pending);
  }, [pending, started?.id, start]);

  // photos nothing refers to any more are forgotten
  useEffect(() => {
    const used = new Set(changes.flatMap((c) => photosOf(c).map((b) => b.photoId)));
    const unused = Object.keys(photos).filter((id) => !used.has(id) && !photos[id].draft);
    if (unused.length) setPhotos((ps) => Object.fromEntries(Object.entries(ps).filter(([id]) => !unused.includes(id))));
  }, [changes]);

  const working = useMemo(
    () => (copy.text == null ? null : applyAllBoth({ status: copy.text, desk: copy.desk ?? EMPTY_DESK }, changes)),
    [copy.text, copy.desk, changes],
  );
  const view = useMemo(() => (working ? viewOf(working) : null), [working]);
  const deskEntries = view?.deskEntries ?? [];

  // its photos belong to the change now, not a draft
  const keepPhotos = (change) => {
    const ids = photosOf(change)
      .map((b) => b.photoId)
      .filter(Boolean);
    if (ids.length)
      setPhotos((ps) => {
        const out = { ...ps };
        for (const pid of ids) if (out[pid]) out[pid] = { ...out[pid], draft: false };
        return out;
      });
  };

  const value = useMemo(
    () => ({
      ready: copy.text != null,
      error: copy.error,
      meta: copy.meta,
      base: copy.text,
      text: null,
      deskText: null,
      parsed: null,
      deskEntries,
      preview: () => ({ text: null, hunks: [], deskText: null, deskHunks: [], error: null }),
      suggestMessage: () => "",
      ...view,
      /** The gantry's velocity from desk.yaml (lib/velocity.js), with the waiting changes in it. */
      velocity: velocity(deskEntries),
      results: working?.results ?? new Map(),
      changes,
      photos,
      push,
      pending,
      /** The session started for the pending request, if any. */
      started: pending && started?.id === pending.id ? started : null,
      /** Starts the session for the pending request again. */
      startAgain: () => pending && start(pending),
      kept: changesKept && photosKept,
      reload,
      /** The files as they were just before a waiting change, for changing that change. */
      before(id) {
        const i = changes.findIndex((c) => c.id === id);
        return viewOf(
          applyAllBoth({ status: copy.text, desk: copy.desk ?? EMPTY_DESK }, i < 0 ? changes : changes.slice(0, i)),
        );
      },
      addChange(change, message) {
        const id = newId();
        setChanges((cs) => [...cs, { ...change, id, message, savedAt: new Date().toISOString() }]);
        keepPhotos(change);
        return id;
      },
      /** A waiting change, changed: it keeps its place in the list, so its commit keeps its place too. */
      replaceChange(id, change, message) {
        setChanges((cs) => replaceChangeIn(cs, id, change, message, new Date().toISOString()));
        keepPhotos(change);
      },
      removeChange: (id) => setChanges((cs) => cs.filter((c) => c.id !== id)),
      addPhoto(info) {
        const id = `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        setPhotos((ps) => ({ ...ps, [id]: { ...info, draft: true } }));
        return id;
      },
      dropPhotos: (ids) =>
        setPhotos((ps) => Object.fromEntries(Object.entries(ps).filter(([id]) => !ids.includes(id) || !ps[id].draft))),
      notePhoto: (id, patch) => setPhotos((ps) => (ps[id] ? { ...ps, [id]: { ...ps[id], ...patch } } : ps)),
      setPush,
      tokenInfo,
      setTokenInfo,
      /** Drops changes that are on main now (pushed from the phone). */
      dropChanges: (ids) => setChanges((cs) => cs.filter((c) => !ids.includes(c.id))),
    }),
    [copy, working, view, changes, photos, push, pending, started, tokenInfo, changesKept, photosKept, reload, start],
  );
  return createElement(DeskContext.Provider, { value }, children);
}

/** Its screens see the files as they were before a waiting change, so that changing it doesn't clash with itself. */
export function BeforeChange({ id, children }) {
  const desk = useDesk();
  const value = useMemo(() => ({ ...desk, ...desk.before(id) }), [desk, id]);
  return createElement(DeskContext.Provider, { value }, children);
}

/** A screen's draft, kept on this device until it's saved as a change. With a null key, only while it's on screen. */
export function useDraft(key, initial) {
  const [draft, setDraft] = usePersisted(key ? `draft.${key}` : null, null);
  const value = draft ?? (typeof initial === "function" ? initial() : initial);
  const update = useCallback((patch) => setDraft((d) => ({ ...(d ?? value), ...patch })), [value]);
  const reset = useCallback(() => setDraft(null), []);
  return [value, update, reset, draft != null];
}
