// Entries: everything already saved, newest first. Tap one to change or delete it, on its own page (EntryScreen.js). Either
// way it's an ordinary change, so nothing leaves the site until it's pushed, and it can be discarded until then. Home shows
// the newest few with EntryRows.
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk } from "../state/desk.js";
import { listEntries, positionMemo, positionName, shorten, waitingAt } from "../lib/entries.js";
import { clock, stamp } from "../lib/time.js";
import { isDateTitle } from "../lib/titles.js";
import { Body, Button, Label, Notice, Panel } from "../components/ui.js";
import { Icon } from "../components/Icon";

const PAGE = 20;
const TYPE = { update: "Update", blog: "Blog post", position: "Position", followup: "Addendum" };
// the tabs' icons, and a page without lines for a blog post
const ICON = { update: "fileLines", blog: "file", position: "crosshair", followup: "messageArrowDown" };

/** A date title says no more than the time stamp beside it, so those show the start of their summary. */
const noteName = (n) => shorten(n.title && !isDateTitle(n.title) ? n.title : n.fields.summary);

/** How many paragraphs and photos go with the summary: the note's photo and its blocks. */
const countsOf = (fields) => ({
  paragraphs: fields.block.filter((b) => !b.photo).length,
  photos: (fields.photo?.file ? 1 : 0) + fields.block.filter((b) => b.photo).length,
});

/** The counts as icons with numbers, leaving out a zero; nothing at all when both are. */
function Counts({ paragraphs = 0, photos = 0 }) {
  const { tw, colors } = useTw();
  const one = (icon, n, word) =>
    n > 0 && (
      <View key={icon} accessibilityLabel={`${n} ${word}${n === 1 ? "" : "s"}`} style={tw`flex-row items-center gap-1`}>
        <Icon name={icon} size={14} color={colors.mute} />
        <Body small mute>
          {n}
        </Body>
      </View>
    );
  if (!paragraphs && !photos) return null;
  return (
    <View style={tw`flex-row items-center gap-3`}>
      {one("paragraph", paragraphs, "paragraph")}
      {one("photo", photos, "photo")}
    </View>
  );
}

function EntryRow({ type, name, memo, when, waiting, nested, counts, onPress }) {
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
        {!!name && <Body>{name}</Body>}
        {!!memo && (
          <Body mute style={tw`italic`}>
            {memo}
          </Body>
        )}
        {counts && <Counts {...counts} />}
        <Body small mute>
          {[TYPE[type], when, waiting ? "waiting to push" : ""].filter(Boolean).join(" · ")}
        </Body>
      </View>
    </Pressable>
  );
}

/**
 * Entries as rows, each with its follow-ups under it.
 * @param {object} props
 * @param {object[]} props.entries From listEntries.
 * @param {(target: object) => void} props.onOpen
 */
export function EntryRows({ entries, onOpen }) {
  const { tw } = useTw();
  const desk = useDesk();
  return entries.map((e) => (
    <View key={e.key} style={tw`border-t border-line pt-1`}>
      <EntryRow
        type={e.type}
        name={e.type === "position" ? positionName(e) : noteName(e.note)}
        memo={e.type === "position" ? positionMemo(e) : ""}
        when={stamp(e.key)}
        waiting={!!waitingAt(desk.changes, e.key)}
        counts={e.type !== "position" && countsOf(e.note.fields)}
        onPress={() => onOpen({ type: e.type, key: e.key })}
      />
      {(e.followUps ?? []).map((f) => (
        <EntryRow
          key={f.key}
          nested
          type="followup"
          name={shorten(f.fields.summary)}
          when={clock(f.key)}
          waiting={!!waitingAt(desk.changes, f.key)}
          counts={countsOf(f.fields)}
          onPress={() => onOpen({ type: "followup", key: f.key, noteKey: e.key })}
        />
      ))}
    </View>
  ));
}

/**
 * @param {object} props
 * @param {(target: object) => void} props.onOpen Opens an entry: { type, key, noteKey? }.
 */
export function EntriesScreen({ onOpen }) {
  const { tw } = useTw();
  const desk = useDesk();
  const [shown, setShown] = useState(PAGE);
  const entries = listEntries(desk.parsed, desk.deskEntries);

  const intro = (
    <Body small mute>
      Open any update, blog post, addendum or position record to fix its title, text, photos, gantry step or note to
      self, or to delete it. Each change gets a review first, and nothing reaches the site until you push. Anything
      still waiting to push can be changed here too.
    </Body>
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
        <EntryRows entries={entries.slice(0, shown)} onOpen={onOpen} />
        {shown < entries.length && <Button title="Show more" onPress={() => setShown(shown + PAGE)} />}
      </Panel>
    </View>
  );
}
