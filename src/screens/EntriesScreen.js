// Entries: everything already saved, newest first. Tap one to open it. Deleting goes through the review like any other
// change, so nothing leaves the site until it's pushed, and it can be discarded until then.
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk } from "../state/desk.js";
import { listEntries, waitingAt } from "../lib/entries.js";
import { STAGE_LABELS } from "../lib/stages.js";
import { clock, stamp } from "../lib/time.js";
import { isDateTitle, slugsOf } from "../lib/titles.js";
import { Body, Button, Label, Notice, Panel, Row } from "../components/ui.js";

const PAGE = 20;
const TYPE = { update: "Update", blog: "Blog post", position: "Position", followup: "Follow-up" };

const shorten = (s, n = 90) => (s.length > n ? `${s.slice(0, n - 2)}…` : s);

/** A date title says no more than the time stamp beside it, so those show the start of their summary. */
const noteName = (n) => shorten(n.title && !isDateTitle(n.title) ? n.title : n.fields.summary);

const positionName = (e) => {
  const steps = (e.record?.stages ?? []).map((s) => STAGE_LABELS[s]).join(", ");
  const memo = e.record?.noteToSelf || e.note?.fields.memo || "";
  return (
    [e.record?.span ? `Span ${e.record.span}` : "", steps, shorten(memo)].filter(Boolean).join(" · ") || "No details"
  );
};

function EntryRow({ type, name, when, waiting, nested, onPress }) {
  const { tw } = useTw();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed, hovered }) => [
        tw`gap-0.5 rounded-md px-2 py-1.5`,
        nested && tw`ml-4 border-l border-line`,
        (pressed || hovered) && tw`bg-bg`,
      ]}
    >
      <Body>{name}</Body>
      <Body small mute>
        {[TYPE[type], when, waiting ? "waiting to push" : ""].filter(Boolean).join(" · ")}
      </Body>
    </Pressable>
  );
}

/** What deleting does, for the review. */
function deleteWarning(target, note, address) {
  if (target.type === "followup")
    return "This follow-up comes off the site when you push. Its photo files stay in the repo.";
  if (!note?.fields.summary)
    return "This record comes out of desk.yaml when you push, and any steps in it leave the velocity. The gantry's span and Complete stay as they are.";
  const count = note.followUps.length;
  return [
    `This comes off the site when you push, and ?post=${address} stops working.`,
    count ? `${count === 1 ? "Its follow-up goes" : `Its ${count} follow-ups go`} with it.` : "",
    "Its comment thread stays on GitHub with nothing linking to it, and its photo files stay in the repo.",
    "Any steps logged with it leave the velocity.",
  ]
    .filter(Boolean)
    .join(" ");
}

export function EntriesScreen({ onReview }) {
  const { tw } = useTw();
  const desk = useDesk();
  const [shown, setShown] = useState(PAGE);
  const [target, setTarget] = useState(null); // { type, key, noteKey }
  const entries = listEntries(desk.parsed, desk.deskEntries);
  const close = () => setTarget(null);

  if (target) {
    const note = desk.parsed.notes.find((n) => n.key === (target.noteKey ?? target.key)) ?? null;
    const fu = target.type === "followup" ? note?.followUps.find((f) => f.key === target.key) : null;
    const record = desk.deskEntries.find((e) => e.key === target.key);
    const gone = target.type === "followup" ? !fu : !note && !record;
    const waiting = waitingAt(desk.changes, target.key);
    const change =
      target.type === "followup"
        ? { kind: "followup-delete", noteKey: target.noteKey, fuKey: target.key }
        : note
          ? { kind: "note-delete", noteKey: target.key }
          : { kind: "desk-delete", key: target.key };
    return (
      <View style={tw`gap-3`}>
        <Panel>
          <Row>
            <Label>{TYPE[target.type]}</Label>
            <Button kind="link" small title="Back to the list" onPress={close} />
          </Row>
          {gone ? (
            <Notice>That entry isn't in the working copy any more.</Notice>
          ) : (
            <Body>
              {target.type === "followup" ? fu.fields.summary : note?.fields.summary || positionName({ note, record })}{" "}
              <Body mute>· {stamp(target.key)}</Body>
            </Body>
          )}
        </Panel>
        {!gone && waiting && (
          <>
            <Notice>This hasn't been pushed yet, so there's nothing to delete from the site.</Notice>
            <Button
              kind="danger"
              title="Discard the waiting change"
              onPress={() => {
                desk.removeChange(waiting.id);
                close();
              }}
            />
          </>
        )}
        {!gone && !waiting && (
          <Button
            kind="danger"
            title={`Delete this ${TYPE[target.type].toLowerCase()}`}
            onPress={() =>
              onReview(change, {
                after: close,
                warning: deleteWarning(target, note, note && slugsOf(desk.parsed.notes).get(note.key)),
              })
            }
          />
        )}
      </View>
    );
  }

  if (!entries.length) return <Notice>Nothing has been saved yet.</Notice>;
  return (
    <View style={tw`gap-3`}>
      <Panel>
        <Label>{`Entries (${entries.length})`}</Label>
        {entries.slice(0, shown).map((e) => (
          <View key={e.key} style={tw`border-t border-line pt-1`}>
            <EntryRow
              type={e.type}
              name={e.type === "position" ? positionName(e) : noteName(e.note)}
              when={stamp(e.key)}
              waiting={!!waitingAt(desk.changes, e.key)}
              onPress={() => setTarget({ type: e.type, key: e.key })}
            />
            {(e.followUps ?? []).map((f) => (
              <EntryRow
                key={f.key}
                nested
                type="followup"
                name={shorten(f.fields.summary)}
                when={clock(f.key)}
                waiting={!!waitingAt(desk.changes, f.key)}
                onPress={() => setTarget({ type: "followup", key: f.key, noteKey: e.key })}
              />
            ))}
          </View>
        ))}
        {shown < entries.length && <Button title="Show more" onPress={() => setShown(shown + PAGE)} />}
      </Panel>
    </View>
  );
}
