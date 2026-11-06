// The desk's state. Its database is its own copy of status.yaml (published with the artifact as status.yaml) plus the list of
// waiting changes on top of it, kept on this device. What every screen shows is that copy with the changes applied.
// Pushing hands the list to a Claude Code session, which syncs with main first, then commits each change and refreshes the
// copy, listing what it committed in pushed.json; the desk then drops those from its list.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { commitMessage, photosOf } from "../lib/changes.js";
import { applyAllBoth, applyBoth } from "../lib/deskChanges.js";
import { EMPTY_DESK, parseDesk } from "../lib/deskFile.js";
import { velocity } from "../lib/velocity.js";
import { parseStatus } from "../lib/statusFile.js";
import { ownFile } from "../platform/claude";
import { load, save } from "../platform/storage";

const DeskContext = createContext(null);
export const useDesk = () => useContext(DeskContext);

const newId = () => `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function usePersisted(key, initial) {
  const [value, setValue] = useState(() => load(key, initial));
  const [kept, setKept] = useState(true);
  useEffect(() => setKept(save(key, value)), [key, value]);
  return [value, setValue, kept];
}

export function DeskProvider({ children }) {
  // status.yaml's text, desk.yaml's (the desk's own records: notes to self and the gantry's steps), and where they came from
  const [copy, setCopy] = useState({ text: null, desk: null, error: null, meta: null });
  const [changes, setChanges, changesKept] = usePersisted("changes", []);
  const [photos, setPhotos, photosKept] = usePersisted("photos", {});
  const [push, setPush] = usePersisted("push", null); // { requestId, kind: "push"|"refresh", ids, requestedAt }; on the phone { via: "github", head, … }
  // on the phone, what the desk shows about the GitHub token (the token itself is in the Keychain): { last4, expiresAt, checkedAt, rejected }
  const [tokenInfo, setTokenInfo] = usePersisted("token", null);

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
      setCopy({ text, desk: deskText, error: null, meta });
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
  const parsed = useMemo(() => (working ? parseStatus(working.status) : null), [working]);
  const deskEntries = useMemo(() => (working ? parseDesk(working.desk) : []), [working]);

  const value = useMemo(
    () => ({
      ready: copy.text != null,
      error: copy.error,
      meta: copy.meta,
      base: copy.text,
      text: working?.status ?? null,
      deskText: working?.desk ?? null,
      parsed,
      deskEntries,
      /** The gantry's velocity from desk.yaml (lib/velocity.js), with the waiting changes in it. */
      velocity: velocity(deskEntries),
      results: working?.results ?? new Map(),
      changes,
      photos,
      push,
      kept: changesKept && photosKept,
      reload,
      /** What a draft change would do to the files as they stand: { text, hunks, deskText, deskHunks, error }. */
      preview(change) {
        try {
          const r = applyBoth({ status: working.status, desk: working.desk }, change);
          return { text: r.status, hunks: r.hunks, deskText: r.desk, deskHunks: r.deskHunks, error: null };
        } catch (e) {
          return { text: working?.status, hunks: [], deskText: working?.desk, deskHunks: [], error: e.message };
        }
      },
      suggestMessage: (change) => commitMessage(change, working?.status),
      addChange(change, message) {
        const id = newId();
        setChanges((cs) => [...cs, { ...change, id, message, savedAt: new Date().toISOString() }]);
        // its photos belong to the change now, not a draft
        const ids = photosOf(change)
          .map((b) => b.photoId)
          .filter(Boolean);
        if (ids.length)
          setPhotos((ps) => {
            const out = { ...ps };
            for (const pid of ids) if (out[pid]) out[pid] = { ...out[pid], draft: false };
            return out;
          });
        return id;
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
    [copy, working, parsed, deskEntries, changes, photos, push, tokenInfo, changesKept, photosKept, reload],
  );
  return createElement(DeskContext.Provider, { value }, children);
}

/** A screen's draft, kept on this device until it's saved as a change. */
export function useDraft(key, initial) {
  const [draft, setDraft] = usePersisted(`draft.${key}`, null);
  const value = draft ?? (typeof initial === "function" ? initial() : initial);
  const update = useCallback((patch) => setDraft((d) => ({ ...(d ?? value), ...patch })), [value]);
  const reset = useCallback(() => setDraft(null), []);
  return [value, update, reset, draft != null];
}
