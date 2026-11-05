// Position: the gantry's span, Complete and a time stamp. No text, so the card shows a Trackside button. The steps of the
// cycle seen and a note to self go in desk.yaml; a move logs "arrived" and marking a span complete logs "hung" by itself, so
// the velocity has them even when there's no update about them.
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk, useDraft } from "../state/desk.js";
import { headerOf } from "../lib/statusFile.js";
import { cardFor } from "../lib/card.js";
import { autoStages } from "../lib/deskChanges.js";
import { compareKeys, nowKey, asOf } from "../lib/time.js";
import { GantryControls } from "../components/GantryControls.js";
import { TimeStampField } from "../components/TimeStampField.js";
import { CardPreview } from "../components/CardPreview.js";
import { NoteToSelf } from "../components/NoteToSelf.js";
import { StagePicker, chosenStages } from "../components/StagePicker.js";
import { Button, Notice } from "../components/ui.js";

export function MoveScreen({ onReview, draftKey = "move", seed }) {
  const { tw } = useTw();
  const desk = useDesk();
  const head = headerOf(desk.parsed);
  const [d, update, reset] = useDraft(
    draftKey,
    () => seed ?? { time: nowKey(), span: head.span, complete: head.complete },
  );
  const memo = d.memo ?? "";
  const change = {
    kind: "move",
    time: d.time,
    span: d.span,
    complete: d.complete,
    noteToSelf: memo,
    stages: chosenStages(d.stages, memo),
  };
  const preview = desk.preview(change);
  return (
    <View style={tw`gap-3`}>
      <GantryControls value={d} current={head} onChange={(g) => update(g)} />
      <TimeStampField value={d.time} onChange={(time) => update({ time })} />
      {compareKeys(d.time, head.updated) < 0 && (
        <Notice>That's earlier than the last update ({asOf(head.updated)}).</Notice>
      )}
      <StagePicker
        text={memo}
        value={d.stages}
        onChange={(stages) => update({ stages })}
        auto={autoStages(head, d)}
        span={d.span}
      />
      <NoteToSelf value={memo} onChange={(m) => update({ memo: m })} where="Its steps are picked from it too." />
      <CardPreview card={cardFor(preview.text)} />
      <Button kind="green" title="Review the position" onPress={() => onReview(change, { after: reset })} />
    </View>
  );
}
