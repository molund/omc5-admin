// The desk's state. Its database is its own copy of status.yaml (published with the artifact as status.yaml) plus the list of
// waiting changes on top of it, kept on this device. What every screen shows is that copy with the changes applied.
// Pushing hands the list to a Claude Code session, which syncs with main first, then commits each change and refreshes the
// copy, listing what it committed in pushed.json; the desk then drops those from its list.
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { applyAll, applyChange, commitMessage, photosOf } from "../lib/changes.js";
import { parseStatus } from "../lib/statusFile.js";
import { ownFile } from "../platform/claude.web.js";
import { load, save } from "../platform/storage.web.js";

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
  const [copy, setCopy] = useState({ text: null, error: null, meta: null });
  const [changes, setChanges, changesKept] = usePersisted("changes", []);
  const [photos, setPhotos, photosKept] = usePersisted("photos", {});
  const [push, setPush] = usePersisted("push", null); // { requestId, kind: "push"|"refresh", ids, requestedAt }

  // read the copy, and what the last push committed
  const reload = useCallback(async () => {
    try {
      const text = await ownFile("status.yaml");
      const meta = await ownFile("copy.json")
        .then(JSON.parse)
        .catch(() => null);
      const pushed = await ownFile("pushed.json")
        .then(JSON.parse)
        .catch(() => null);
      setCopy({ text, error: null, meta });
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

  const working = useMemo(() => (copy.text == null ? null : applyAll(copy.text, changes)), [copy.text, changes]);
  const parsed = useMemo(() => (working ? parseStatus(working.text) : null), [working]);

  const value = useMemo(
    () => ({
      ready: copy.text != null,
      error: copy.error,
      meta: copy.meta,
      base: copy.text,
      text: working?.text ?? null,
      parsed,
      results: working?.results ?? new Map(),
      changes,
      photos,
      push,
      kept: changesKept && photosKept,
      reload,
      /** What a draft change would do to the file as it stands: { text, hunks, error }. */
      preview(change) {
        try {
          return { ...applyChange(working.text, change), error: null };
        } catch (e) {
          return { text: working?.text, hunks: [], error: e.message };
        }
      },
      suggestMessage: (change) => commitMessage(change, working?.text),
      addChange(change, message) {
        const id = newId();
        setChanges((cs) => [...cs, { ...change, id, message, savedAt: new Date().toISOString() }]);
        // its photos belong to the change now, not a draft
        const ids = photosOf(change).map((b) => b.photoId).filter(Boolean);
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
    }),
    [copy, working, parsed, changes, photos, push, changesKept, photosKept, reload],
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
