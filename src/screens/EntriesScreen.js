// Entries: everything already saved, newest first. Tap one to change or delete it. Either way it's an ordinary change, so
// nothing leaves the site until it's pushed, and it can be discarded until then. What's being edited is its own draft, so
// opening an entry never touches a half-written new post on another tab.
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk, useDraft } from "../state/desk.js";
import { listEntries, positionName, shorten, waitingAt } from "../lib/entries.js";
import { clock, stamp } from "../lib/time.js";
import { isDateTitle } from "../lib/titles.js";
import { EntryEditor, seedFor } from "../components/EntryEditor.js";
import { Body, Button, Label, Notice, Panel } from "../components/ui.js";

const PAGE = 20;
const TYPE = { update: "Update", blog: "Blog post", position: "Position", followup: "Follow-up" };

/** A date title says no more than the time stamp beside it, so those show the start of their summary. */
const noteName = (n) => shorten(n.title && !isDateTitle(n.title) ? n.title : n.fields.summary);

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

export function EntriesScreen({ onReview }) {
  const { tw } = useTw();
  const desk = useDesk();
  const [shown, setShown] = useState(PAGE);
  const [d, update, reset] = useDraft("edit", () => ({ target: null }));
  const [waitingTarget, setWaitingTarget] = useState(null);
  const entries = listEntries(desk.parsed, desk.deskEntries);

  const open = (target) => {
    const waiting = waitingAt(desk.changes, target.key);
    if (waiting) setWaitingTarget({ target, change: waiting });
    else update({ target, ...seedFor(desk, target) });
  };
  const close = () => {
    desk.dropPhotos((d.blocks ?? []).map((b) => b.photoId).filter(Boolean));
    reset();
  };

  if (d.target) return <EntryEditor target={d.target} draft={d} update={update} onClose={close} onReview={onReview} />;

  if (waitingTarget)
    return (
      <View style={tw`gap-3`}>
        <Notice>This hasn't been pushed yet. Change it under "Waiting to push" above, or discard it here.</Notice>
        <View style={tw`flex-row gap-2`}>
          <Button title="Back" onPress={() => setWaitingTarget(null)} style={tw`flex-1`} />
          <Button
            kind="danger"
            title="Discard the waiting change"
            style={tw`flex-1`}
            onPress={() => {
              desk.removeChange(waitingTarget.change.id);
              setWaitingTarget(null);
            }}
          />
        </View>
      </View>
    );

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
              onPress={() => open({ type: e.type, key: e.key })}
            />
            {(e.followUps ?? []).map((f) => (
              <EntryRow
                key={f.key}
                nested
                type="followup"
                name={shorten(f.fields.summary)}
                when={clock(f.key)}
                waiting={!!waitingAt(desk.changes, f.key)}
                onPress={() => open({ type: "followup", key: f.key, noteKey: e.key })}
              />
            ))}
          </View>
        ))}
        {shown < entries.length && <Button title="Show more" onPress={() => setShown(shown + PAGE)} />}
      </Panel>
    </View>
  );
}
