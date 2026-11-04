// Position: the gantry's span, Complete and a time stamp. No text, so the card shows a Trackside button.
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk, useDraft } from "../state/desk.js";
import { headerOf } from "../lib/statusFile.js";
import { cardFor } from "../lib/card.js";
import { compareKeys, nowKey, asOf } from "../lib/time.js";
import { GantryControls } from "../components/GantryControls.js";
import { TimeStampField } from "../components/TimeStampField.js";
import { CardPreview } from "../components/CardPreview.js";
import { NoteToSelf } from "../components/NoteToSelf.js";
import { Button, Notice } from "../components/ui.js";

export function MoveScreen({ onReview }) {
  const { tw } = useTw();
  const desk = useDesk();
  const head = headerOf(desk.parsed);
  const [d, update, reset] = useDraft("move", () => ({ time: nowKey(), span: head.span, complete: head.complete }));
  const memo = d.memo ?? "";
  // a position has no entry of its own: a note to self makes one, which the site never shows
  const change = { kind: "move", time: d.time, span: d.span, complete: d.complete, noteToSelf: memo };
  // entries are keyed by time stamp, so a note to self can't go at a time that already has one
  const taken = !!memo.trim() && desk.parsed.notes.some((n) => n.key === d.time);
  const preview = desk.preview(change);
  return (
    <View style={tw`gap-3`}>
      <GantryControls value={d} current={head} onChange={(g) => update(g)} />
      <TimeStampField value={d.time} onChange={(time) => update({ time })} />
      {compareKeys(d.time, head.updated) < 0 && (
        <Notice>That's earlier than the last update ({asOf(head.updated)}).</Notice>
      )}
      <NoteToSelf
        value={memo}
        onChange={(m) => update({ memo: m })}
        where="Adding one makes an entry for this position. It doesn't appear on Trackside, the card or the comments."
      />
      <CardPreview card={cardFor(preview.text)} />
      {taken && <Notice tone="problem">There's already an entry at this time stamp. Move it a quarter hour.</Notice>}
      <Button
        kind="green"
        title="Review the position"
        disabled={taken}
        onPress={() => onReview(change, { after: reset })}
      />
    </View>
  );
}
