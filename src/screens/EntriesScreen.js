// Entries: everything already saved, newest first. Tap one to change or delete it. Either way it's an ordinary change, so
// nothing leaves the site until it's pushed, and it can be discarded until then. What's being edited is its own draft, so
// opening an entry never touches a half-written new post on a tab.
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk, useDraft } from "../state/desk.js";
import { listEntries, positionName, shorten, waitingAt } from "../lib/entries.js";
import { clock, stamp } from "../lib/time.js";
import { isDateTitle } from "../lib/titles.js";
import { EntryEditor, seedFor } from "../components/EntryEditor.js";
import { Body, Button, Label, Link, Notice, Panel } from "../components/ui.js";
import { Icon } from "../components/Icon";

const PAGE = 20;
const TYPE = { update: "Update", blog: "Blog post", position: "Position", followup: "Follow-up" };
// the tabs' icons, and a page without lines for a blog post
const ICON = { update: "fileLines", blog: "file", position: "crosshair", followup: "messageArrowDown" };

/** A date title says no more than the time stamp beside it, so those show the start of their summary. */
const noteName = (n) => shorten(n.title && !isDateTitle(n.title) ? n.title : n.fields.summary);

function EntryRow({ type, name, when, waiting, nested, onPress }) {
  const { tw, colors } = useTw();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed, hovered }) => [
        tw`flex-row items-start gap-2 rounded-md px-2 py-1.5`,
        nested && tw`ml-4 border-l border-line`,
        (pressed || hovered) && tw`bg-bg`,
      ]}
    >
      <View style={tw`pt-0.5`}>
        <Icon name={ICON[type]} size={18} color={colors.mute} />
      </View>
      <View style={tw`flex-1 gap-0.5`}>
        <Body>{name}</Body>
        <Body small mute>
          {[TYPE[type], when, waiting ? "waiting to push" : ""].filter(Boolean).join(" · ")}
        </Body>
      </View>
    </Pressable>
  );
}

export function EntriesScreen({ onReview, onEditWaiting, onLeave }) {
  const { tw } = useTw();
  const desk = useDesk();
  const [shown, setShown] = useState(PAGE);
  const [d, update, reset] = useDraft("edit", () => ({ target: null }));
  const entries = listEntries(desk.parsed, desk.deskEntries);

  const open = (target) => {
    const waiting = waitingAt(desk.changes, target.key);
    if (waiting) onEditWaiting(waiting);
    else update({ target, ...seedFor(desk, target) });
  };
  const close = () => {
    desk.dropPhotos((d.blocks ?? []).map((b) => b.photoId).filter(Boolean));
    reset();
  };

  if (d.target)
    return (
      <View style={tw`gap-3`}>
        <Link title="← Back to the list of entries" onPress={close} />
        <EntryEditor target={d.target} draft={d} update={update} onClose={close} onReview={onReview} noBack />
      </View>
    );

  const intro = (
    <View style={tw`gap-1`}>
      <Link title="← Back to adding something new" onPress={onLeave} />
      <Body small mute>
        Open any update, blog post, follow-up or position record to fix its title, text, photos, gantry step or note to
        self, or to delete it. Each change gets a review first, and nothing reaches the site until you push. Anything
        still waiting to push can be changed here too.
      </Body>
    </View>
  );
  if (!entries.length)
    return (
      <View style={tw`gap-3`}>
        {intro}
        <Notice>Nothing has been saved yet.</Notice>
      </View>
    );
  return (
    <View style={tw`gap-3`}>
      {intro}
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
