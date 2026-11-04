// The desk's copy and its waiting changes: where the copy came from, what's waiting to go to main, and the push.
// Push and Refresh save a request into the desk's outbox, which wakes the Claude Code session that watches the desk
// (see services/outbox.js). The desk reloads when that session publishes the new copy.
import { useState } from "react";
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk } from "../state/desk.js";
import { requestPush, requestRefresh } from "../services/outbox.js";
import { asOf, toKey } from "../lib/time.js";
import { Body, Button, Field, Label, Notice, Panel, Row } from "./ui.js";

const KIND = {
  move: "Position",
  update: "Update",
  followup: "Follow-up",
  "followup-edit": "Follow-up edit",
  blog: "Blog",
};

/** Copies text inside the press, as the frame requires; false when the clipboard refuses. */
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** What went wrong, the platform's own words, and the request to send by hand. */
function Failure({ error, onCopied }) {
  const { tw } = useTw();
  return (
    <View style={tw`gap-2`}>
      <Notice tone="problem">{error.message}</Notice>
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
              onPress={() => copy(error.manual).then((ok) => onCopied(ok ? true : "failed"))}
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
              style={tw`min-h-40`}
            />
          )}
        </View>
      )}
    </View>
  );
}

export function Outbox() {
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
      const req = kind === "push" ? await requestPush(fitting, desk.photos) : await requestRefresh();
      desk.setPush({ kind, requestId: req.id, ids: req.changes.map((c) => c.id), requestedAt: req.requestedAt });
    } catch (e) {
      setError({ message: e.message, detail: e.detail ?? "", manual: e.manual ?? null, copied: false });
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
              onPress={() => setConfirm(confirm === "refresh" ? null : "refresh")}
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
          <Label>{`Waiting to push (${desk.changes.length})`}</Label>
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
            {confirm === "push"
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
      {p && (
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

      {error && <Failure error={error} onCopied={(copied) => setError({ ...error, copied })} />}
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
