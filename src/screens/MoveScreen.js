// Position: the gantry's span, Hung and a time stamp. No text, so the card shows a Trackside button. The steps of the
// cycle seen and a note to self go in desk.yaml; a move logs "arrived at span" and marking a span hung logs "hung" by itself, so
// the velocity has them even when there's no update about them.
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk, useDraft } from "../state/desk.js";
import { headerOf } from "../lib/statusFile.js";
import { cardFor } from "../lib/card.js";
import { stageFloor } from "../lib/stages.js";
import { postedStage } from "../lib/deskFile.js";
import { compareKeys, nowKey, asOf } from "../lib/time.js";
import { GantryControls } from "../components/GantryControls.js";
import { TimeStampField } from "../components/TimeStampField.js";
import { CardPreview } from "../components/CardPreview.js";
import { NoteToSelf } from "../components/NoteToSelf.js";
import { StagePicker, chosenStage } from "../components/StagePicker.js";
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
  const floor = stageFloor(d.complete, postedStage(desk.deskEntries, d.span));
  const change = {
    kind: "move",
    time: d.time,
    span: d.span,
    complete: d.complete,
    noteToSelf: memo,
    stage: chosenStage(d.stage, floor),
  };
  const preview = desk.preview(change);
  return (
    <View style={tw`gap-3`}>
      <GantryControls value={d} current={head} onChange={(g) => update(g)} />
      <TimeStampField
        value={d.time}
        onChange={(time) => update({ time })}
        auto={!seed}
        manualUntil={d.manualUntil}
        onManual={(manualUntil) => update({ manualUntil })}
      />
      {compareKeys(d.time, head.updated) < 0 && (
        <Notice>That's earlier than the last update ({asOf(head.updated)}).</Notice>
      )}
      <StagePicker text={memo} value={d.stage} onChange={(stage) => update({ stage })} floor={floor} span={d.span} />
      <NoteToSelf value={memo} onChange={(m) => update({ memo: m })} />
      <CardPreview card={cardFor(preview.text, preview.deskText)} />
      <Button kind="green" title="Review the position" onPress={() => onReview(change, { after: reset })} />
    </View>
  );
}
