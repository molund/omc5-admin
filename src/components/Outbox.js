// The desk's copy and its waiting changes: where the copy came from, what's waiting to go to main, and the push.
// Push and Refresh save a request into the desk's outbox, and the desk starts a Claude Code session to answer it
// (see services/outbox.js). The desk reloads when that session publishes the new copy. On the phone, Push asks for Face ID
// and goes straight to GitHub (services/phonePush.js); the desk then follows the site's check until main has the changes.
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, Platform, View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk } from "../state/desk.js";
import { requestPush, requestRefresh } from "../services/outbox.js";
import { pushFromPhone } from "../services/phonePush.js";
import { followingWithToken, pushStatus, stopFollowing } from "../services/github.js";
import { canReopen } from "../lib/entries.js";
import { asOf, dateOf, toKey } from "../lib/time.js";
import { copyText } from "../platform/clipboard";
import { Body, Button, Confirm, Field, Label, Link, Notice, Panel, Row } from "./ui.js";

const PHONE = Platform.OS !== "web";
const WEEK = 7 * 24 * 60 * 60 * 1000;

const KIND = {
  move: "Position",
  update: "Update",
  followup: "Addendum",
  "followup-edit": "Addendum edit",
  blog: "Blog",
  "note-edit": "Edit",
  "note-delete": "Delete",
  "followup-delete": "Addendum delete",
  "desk-edit": "Position record edit",
  "desk-delete": "Position record delete",
};

/** What went wrong, the platform's own words, and the request to send by hand. */
function Failure({ error, onCopied, onSettings }) {
  const { tw } = useTw();
  return (
    <View style={tw`gap-2`}>
      <Notice tone="problem">{error.message}</Notice>
      {error.settings && onSettings && (
        <Row style={tw`justify-end`}>
          <Button small title="Open Settings" onPress={onSettings} />
        </Row>
      )}
      {error.detail ? (
        <Body small mute style={tw`font-mono`}>
          {error.detail}
        </Body>
      ) : null}
      {error.manual && (
        <View style={tw`gap-1.5 rounded-md bg-bg p-2.5`}>
          <Body small>By hand: copy the request and paste it into a new Claude Code chat.</Body>
          <Row style={tw`justify-end`}>
            {error.copied === true && (
              <Body small mute>
                Copied
              </Body>
            )}
            <Button
              small
              title="Copy the request"
              onPress={() => copyText(error.manual).then((ok) => onCopied(ok ? true : "failed"))}
            />
          </Row>
          {error.copied === "failed" && (
            <Field
              multiline
              small
              mono
              value={error.manual}
              onChangeText={() => {}}
              label="The request"
              noPrompt
              style={tw`min-h-40`}
            />
          )}
        </View>
      )}
    </View>
  );
}

/** In the Claude app, after a request is saved: the Claude Code session the desk starts to answer it. */
function Starting() {
  const { tw } = useTw();
  const desk = useDesk();
  const [copied, setCopied] = useState(null);
  const req = desk.pending;
  if (!req) return null;
  const s = desk.started;
  const again = s && s.state !== "starting" && s.state !== "started";
  return (
    <View style={tw`gap-1.5`}>
      {!s || s.state === "starting" ? (
        <Body small mute>
          Starting a Claude Code session to answer it…
        </Body>
      ) : s.state === "started" ? (
        <Body small mute>
          {`Claude Code session started ${asOf(toKey(new Date(s.at)))}. It takes a few minutes.`}
        </Body>
      ) : (
        <Notice tone={s.state === "failed" ? "problem" : "warn"}>
          {s.error?.message ??
            "The desk may have started Claude Code before it reloaded. If nothing happens, start it again."}
        </Notice>
      )}
      {s?.error?.detail ? (
        <Body small mute style={tw`font-mono`}>
          {s.error.detail}
        </Body>
      ) : null}
      {again && (
        <Row style={tw`justify-end`}>
          {copied === true && (
            <Body small mute>
              Copied
            </Body>
          )}
          {s.error?.manual && (
            <Button
              small
              title="Copy the request"
              onPress={() => copyText(s.error.manual).then((ok) => setCopied(ok ? true : "failed"))}
            />
          )}
          <Button small title="Start Claude Code again" onPress={desk.startAgain} />
        </Row>
      )}
      {copied === "failed" && s?.error?.manual && (
        <Field multiline small mono value={s.error.manual} onChangeText={() => {}} label="The request" noPrompt />
      )}
    </View>
  );
}

/** On the phone, after a push: follows the site's "Land Leash Log changes" run until main has the changes. */
function Landing({ p }) {
  const { tw } = useTw();
  const desk = useDesk();
  const [status, setStatus] = useState({ stage: p.landed ? "deploying" : "waiting", url: null });
  const [problem, setProblem] = useState(null);
  const final = useRef(false);
  const tooOld = () => Date.now() - new Date(p.requestedAt) > 10 * 60 * 1000;

  const check = useCallback(
    async (byHand) => {
      if (final.current || (!byHand && tooOld())) return;
      try {
        const s = await pushStatus(p.head);
        setProblem(null);
        setStatus(s);
        if (["deploying", "live", "deploy-failed"].includes(s.stage) && !p.landed) {
          // on main: the changes are done here, and the copy is main's again; the panel stays for the deploy
          desk.dropChanges(p.ids);
          desk.setPush((q) => (q && q.head === p.head ? { ...q, landed: true } : q));
          desk.reload();
        }
        if (["failed", "live", "deploy-failed"].includes(s.stage)) {
          final.current = true;
          stopFollowing(p.head);
        }
        // live: say so for a moment, then the panel goes
        if (s.stage === "live") setTimeout(() => desk.setPush((q) => (q && q.head === p.head ? null : q)), 15 * 1000);
      } catch (e) {
        setProblem(e.message);
      }
    },
    [p.head, p.landed],
  );
  // every 5 seconds with the token, every 15 without (GitHub allows far fewer checks without one); none while the desk is
  // in the background, and one as soon as it's back, however long it was away
  useEffect(() => {
    let on = true,
      timer;
    const loop = async () => {
      if (AppState.currentState === "active") await check();
      if (on) timer = setTimeout(loop, followingWithToken(p.head) ? 5 * 1000 : 15 * 1000);
    };
    loop();
    const sub = AppState.addEventListener("change", (s) => s === "active" && check(true));
    return () => {
      on = false;
      clearTimeout(timer);
      sub.remove();
    };
  }, [check]);
  // the push isn't followed any more (done, or Stop waiting): the token goes
  useEffect(() => () => stopFollowing(p.head), [p.head]);

  const when = asOf(toKey(new Date(p.requestedAt)));
  const text = {
    waiting: `Pushed to the desk branch ${when}. Waiting for GitHub to start landing it on main.`,
    landing: `Landing on main: GitHub checks the commits, builds the site and moves main up. It takes a minute or so.`,
    failed: "The landing check failed, so nothing reached main. The changes are still waiting here.",
    deploying: status.started
      ? "On main. The site is deploying now, which takes about a minute."
      : "On main. Waiting for GitHub to start the site's deploy.",
    live: "Live on the site.",
    "deploy-failed": "On main, but the site's deploy failed, so the site doesn't show it yet.",
  }[status.stage];
  const bad = status.stage === "failed" || status.stage === "deploy-failed";
  return (
    <View style={tw`gap-1.5 rounded-md bg-bg p-2.5`}>
      {bad ? <Notice tone="problem">{text}</Notice> : <Body small>{text}</Body>}
      {p.skipped?.length > 0 && (
        <Notice>{`${p.skipped.length === 1 ? "One change" : `${p.skipped.length} changes`} didn't fit main and wasn't pushed. It's still waiting here.`}</Notice>
      )}
      {problem && <Notice tone="problem">{problem}</Notice>}
      {!bad && status.stage !== "live" && tooOld() && (
        <Body small mute>
          No answer from GitHub yet.
        </Body>
      )}
      <Row style={tw`justify-end`}>
        {status.url && <Link href={status.url} title={bad ? "See what failed" : "Watch it"} />}
        {!bad && status.stage !== "live" && <Button small title="Check again" onPress={() => check(true)} />}
        <Button small title={status.stage === "live" ? "Done" : "Stop waiting"} onPress={() => desk.setPush(null)} />
      </Row>
    </View>
  );
}

export function Outbox({ onSettings, onEdit }) {
  const { tw, colors } = useTw();
  const desk = useDesk();
  const [confirm, setConfirm] = useState(null); // "push" | "refresh"
  const [refreshing, setRefreshing] = useState(false);
  const [discarding, setDiscarding] = useState(null); // the waiting change Discard was pressed on, wanting its confirmation

  // the phone reads main itself: a spinner while it does, for long enough to see even when it's instant
  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([desk.reload(), new Promise((r) => setTimeout(r, 300))]);
    } finally {
      setRefreshing(false);
    }
  }
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);
  const p = desk.push;
  const fitting = desk.changes.filter((c) => desk.results.get(c.id)?.ok !== false);

  async function go(kind) {
    setConfirm(null);
    setError(null);
    setSending(true);
    try {
      if (kind === "push" && PHONE) {
        const r = await pushFromPhone({ ...desk, changes: fitting });
        desk.setPush({
          kind,
          via: "github",
          head: r.head,
          ids: r.pushed,
          skipped: r.skipped,
          requestedAt: new Date().toISOString(),
        });
        return;
      }
      const req = kind === "push" ? await requestPush(fitting, desk.photos) : await requestRefresh();
      desk.setPush({ kind, requestId: req.id, ids: req.changes.map((c) => c.id), requestedAt: req.requestedAt });
    } catch (e) {
      setError({
        message: e.message,
        detail: e.detail ?? "",
        manual: e.manual ?? null,
        settings: !!e.settings,
        copied: false,
      });
    } finally {
      setSending(false);
    }
  }

  const copyLine = desk.meta?.syncedAt
    ? `Copy of main from ${asOf(toKey(new Date(desk.meta.syncedAt)))}${desk.meta.commit ? ` (${desk.meta.commit.slice(0, 7)})` : ""}.`
    : "Copy of main from when the desk was published.";

  return (
    <Panel>
      <Label
        right={
          (!p || p.landed) &&
          !sending &&
          (refreshing ? (
            <ActivityIndicator size="small" color={colors.accent} accessibilityLabel="Refreshing from main" />
          ) : (
            <Button
              kind="link"
              small
              title="Refresh from main"
              // on the phone the desk reads main itself; in the Claude app it asks Claude Code to
              onPress={() => (Platform.OS === "web" ? setConfirm(confirm === "refresh" ? null : "refresh") : refresh())}
            />
          ))
        }
      >
        GitHub sync
      </Label>
      <Body small mute>
        {copyLine}
      </Body>
      {!desk.kept && (
        <Notice tone="problem">
          This device isn't keeping the desk's changes (storage is off or full). Push before closing.
        </Notice>
      )}

      {desk.changes.length ? (
        <View style={tw`gap-2`}>
          <Label>
            {p?.via === "github"
              ? `Landing on main (${desk.changes.filter((c) => p.ids?.includes(c.id)).length})`
              : `Waiting to push (${desk.changes.length})`}
          </Label>
          {desk.changes.map((c) => {
            const r = desk.results.get(c.id);
            const sent = !!p?.ids?.includes(c.id);
            return (
              <View key={c.id} style={tw`gap-1 border-t border-line pt-2`}>
                <Row style={tw`flex-nowrap items-start`}>
                  <View style={tw`flex-1 gap-0.5`}>
                    <Body>{c.message}</Body>
                    <Body small mute>
                      {KIND[c.kind]} · saved {asOf(toKey(new Date(c.savedAt)))}
                      {sent ? " · sent" : ""}
                    </Body>
                  </View>
                  {!sent && canReopen(c) && <Button small kind="link" title="Edit" onPress={() => onEdit(c)} />}
                  {!sent && <Button kind="danger" small title="Discard" onPress={() => setDiscarding(c.id)} />}
                </Row>
                {discarding === c.id && (
                  <Confirm
                    action="Discard"
                    onCancel={() => setDiscarding(null)}
                    onConfirm={() => {
                      setDiscarding(null);
                      desk.removeChange(c.id);
                    }}
                  >
                    Discard this waiting change? It won't be pushed.
                  </Confirm>
                )}
                {r && !r.ok && <Notice tone="problem">{`Doesn't fit the copy any more: ${r.error}`}</Notice>}
              </View>
            );
          })}
        </View>
      ) : (
        <Body small mute>
          Nothing waiting. Saved changes collect here until you push.
        </Body>
      )}

      {confirm && (
        <View style={tw`gap-2 rounded-md bg-bg p-2.5`}>
          <Body small>
            {confirm === "push" && PHONE
              ? `After Face ID, this pushes ${fitting.length === 1 ? "the change" : `the ${fitting.length} changes`} to GitHub${
                  fitting.length === 1 ? "" : ", each as its own commit"
                }, on top of main. A check there lands ${fitting.length === 1 ? "it" : "them"} on main, and the site deploys.`
              : confirm === "push"
                ? `This sends ${fitting.length === 1 ? "the change" : `the ${fitting.length} changes`} to Claude Code, which syncs with main first, then commits ${
                    fitting.length === 1 ? "it" : "each one on its own"
                  } and pushes. The site deploys from main.`
                : "This asks Claude Code for a fresh copy of main's status.yaml. Waiting changes stay, on top of the new copy."}
          </Body>
          <Row style={tw`justify-end`}>
            <Button small title="Cancel" onPress={() => setConfirm(null)} />
            <Button
              small
              kind="green"
              title={confirm === "push" ? "Push to main" : "Refresh"}
              onPress={() => go(confirm)}
            />
          </Row>
        </View>
      )}

      {sending && (
        <Body small mute>
          Sending…
        </Body>
      )}
      {/* keyed by the push, so a new one starts its own */}
      {p?.via === "github" && <Landing key={p.head} p={p} />}
      {p && p.via !== "github" && (
        <View style={tw`gap-1.5 rounded-md bg-bg p-2.5`}>
          <Body small>
            {p.kind === "push"
              ? `Sent ${asOf(toKey(new Date(p.requestedAt)))}. Claude Code syncs with main, commits and pushes. The desk reloads with the new copy when it's done.`
              : `Asked ${asOf(toKey(new Date(p.requestedAt)))}. The desk reloads with main's copy when Claude Code has published it.`}
          </Body>
          <Starting />
          <Row style={tw`justify-end`}>
            <Button small title="Check again" onPress={desk.reload} />
            <Button small title="Stop waiting" onPress={() => desk.setPush(null)} />
          </Row>
        </View>
      )}

      {PHONE && desk.tokenInfo?.expiresAt && new Date(desk.tokenInfo.expiresAt) - Date.now() < WEEK && (
        <Notice tone={new Date(desk.tokenInfo.expiresAt) < Date.now() ? "problem" : "warn"}>
          {`The GitHub token ${new Date(desk.tokenInfo.expiresAt) < Date.now() ? "expired" : "expires"} on ${dateOf(
            desk.tokenInfo.expiresAt,
          )}. Make a new one and paste it in Settings.`}
        </Notice>
      )}
      {error && <Failure error={error} onSettings={onSettings} onCopied={(copied) => setError({ ...error, copied })} />}
      {/* a push already on main can still be deploying: the next one can go meanwhile */}
      {(!p || p.landed) && !sending && desk.changes.length > 0 && (
        <Button
          kind="green"
          title={`Push ${fitting.length} change${fitting.length === 1 ? "" : "s"} to main`}
          disabled={!fitting.length}
          onPress={() => setConfirm(confirm === "push" ? null : "push")}
        />
      )}
    </Panel>
  );
}
