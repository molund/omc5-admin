// The desk's copy and its waiting changes: where the copy came from, what's waiting to go to main, and the push.
// Push and Refresh save a request into the desk's outbox, which wakes the Claude Code session that watches the desk
// (see services/outbox.js). The desk reloads when that session publishes the new copy. On the phone, Push asks for Face ID
// and goes straight to GitHub (services/phonePush.js); the desk then follows the site's check until main has the changes.
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform, View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk } from "../state/desk.js";
import { requestPush, requestRefresh } from "../services/outbox.js";
import { pushFromPhone } from "../services/phonePush.js";
import { landingStatus } from "../services/github.js";
import { canReopen } from "../lib/entries.js";
import { asOf, dateOf, toKey } from "../lib/time.js";
import { copyText } from "../platform/clipboard";
import { Body, Button, Field, Label, Link, Notice, Panel, Row } from "./ui.js";

const PHONE = Platform.OS !== "web";
const WEEK = 7 * 24 * 60 * 60 * 1000;

const KIND = {
  move: "Position",
  update: "Update",
  followup: "Follow-up",
  "followup-edit": "Follow-up edit",
  blog: "Blog",
  "note-edit": "Edit",
  "note-delete": "Delete",
  "followup-delete": "Follow-up delete",
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
          <Body small>
            By hand: copy the request and paste it into the "Status.yaml block editor" chat in Claude Code.
          </Body>
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

/** On the phone, after a push: follows the site's "Land Status Desk changes" run until main has the changes. */
function Landing({ p }) {
  const { tw } = useTw();
  const desk = useDesk();
  const [status, setStatus] = useState({ state: "waiting", url: null });
  const [problem, setProblem] = useState(null);
  const final = useRef(false);
  const tooOld = () => Date.now() - new Date(p.requestedAt) > 10 * 60 * 1000;

  const check = useCallback(
    async (byHand) => {
      if (final.current || (!byHand && tooOld())) return;
      try {
        const s = await landingStatus(p.head);
        setProblem(null);
        setStatus(s);
        if (s.state === "failed") final.current = true;
        if (s.state === "landed") {
          final.current = true;
          desk.dropChanges(p.ids);
          desk.setPush(null);
          desk.reload();
        }
      } catch (e) {
        setProblem(e.message);
      }
    },
    [p.head],
  );
  useEffect(() => {
    check();
    const timer = setInterval(check, 15 * 1000);
    return () => clearInterval(timer);
  }, [check]);

  const when = asOf(toKey(new Date(p.requestedAt)));
  const text = {
    waiting: `Pushed to desk branch ${when}. Waiting for GitHub to start the check.`,
    running: `Pushed to desk branch ${when}. The check is running: it checks the commits, builds the site and moves main up. It takes about two minutes.`,
    failed: "The check failed, so nothing reached main. The changes are still waiting here.",
  }[status.state];
  return (
    <View style={tw`gap-1.5 rounded-md bg-bg p-2.5`}>
      {status.state === "failed" ? <Notice tone="problem">{text}</Notice> : <Body small>{text}</Body>}
      {p.skipped?.length > 0 && (
        <Notice>{`${p.skipped.length === 1 ? "One change" : `${p.skipped.length} changes`} didn't fit main and wasn't pushed. It's still waiting here.`}</Notice>
      )}
      {problem && <Notice tone="problem">{problem}</Notice>}
      {status.state !== "failed" && tooOld() && (
        <Body small mute>
          No answer from the check yet.
        </Body>
      )}
      <Row style={tw`justify-end`}>
        {status.url && <Link href={status.url} title={status.state === "failed" ? "See what failed" : "Watch it"} />}
        {status.state !== "failed" && <Button small title="Check again" onPress={() => check(true)} />}
        <Button small title="Stop waiting" onPress={() => desk.setPush(null)} />
      </Row>
    </View>
  );
}

export function Outbox({ onSettings, onEdit }) {
  const { tw } = useTw();
  const desk = useDesk();
  const [confirm, setConfirm] = useState(null); // "push" | "refresh"
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
          !p &&
          !sending && (
            <Button
              kind="link"
              small
              title="Refresh from main"
              // on the phone the desk reads main itself; in the Claude app it asks Claude Code to
              onPress={() =>
                Platform.OS === "web" ? setConfirm(confirm === "refresh" ? null : "refresh") : desk.reload()
              }
            />
          )
        }
      >
        Desk copy
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
          <Label>{`${p?.via === "github" ? "Waiting for fast-forward to main" : "Waiting to push"} (${desk.changes.length})`}</Label>
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
                  {!sent && <Button kind="danger" small title="Discard" onPress={() => desk.removeChange(c.id)} />}
                </Row>
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
      {p?.via === "github" && <Landing p={p} />}
      {p && p.via !== "github" && (
        <View style={tw`gap-1.5 rounded-md bg-bg p-2.5`}>
          <Body small>
            {p.kind === "push"
              ? `Sent ${asOf(toKey(new Date(p.requestedAt)))}. Claude Code is syncing with main, committing and pushing. The desk reloads with the new copy when it's done.`
              : `Asked ${asOf(toKey(new Date(p.requestedAt)))}. The desk reloads with main's copy when Claude Code has published it.`}
          </Body>
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
      {!p && !sending && desk.changes.length > 0 && (
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
