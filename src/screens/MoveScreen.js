// Position: the gantry's span, Hung and a time stamp. No text, so the card shows a Trackside button. The steps of the
// cycle seen and a note to self go in desk.yaml; a move logs "arrived at span" and marking a span hung logs "hung" by itself, so
// the velocity has them even when there's no update about them.
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { dropDraft, readDraft, useDesk, useDraft, writeDraft } from "../state/desk.js";
import { headerOf } from "../lib/statusFile.js";
import { cardFor } from "../lib/card.js";
import { stageFloor } from "../lib/stages.js";
import { postedStage } from "../lib/deskFile.js";
import { compareKeys, nowKey, asOf } from "../lib/time.js";
import { GantryControls } from "../components/GantryControls.js";
import { TimeStampField } from "../components/TimeStampField.js";
import { CardPreview } from "../components/CardPreview.js";
import { StagePicker, chosenStage } from "../components/StagePicker.js";
import { emptyBlocks } from "../components/BlockEditor.js";
import { Button, Link, Notice } from "../components/ui.js";

/**
 * @param {object} props
 * @param {(change: object, opts: object) => void} props.onReview
 * @param {(page: string) => void} [props.onSwitch] Turns this page into another one (Turn it into an update).
 */
export function MoveScreen({ onReview, onSwitch, draftKey = "move", seed }) {
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
  // Turn it into an update: the same time stamp, gantry, step and notes, as an update, with its text still to write. An update draft
  // already started keeps its text, and takes these values.
  const sayIt = () => {
    const update = readDraft("update", desk.draftsCleared) ?? { title: "", titleSet: false, blocks: emptyBlocks() };
    writeDraft("update", desk.draftsCleared, {
      ...update,
      time: d.time,
      manualUntil: d.manualUntil,
      span: d.span,
      complete: d.complete,
      gantrySet: d.span !== head.span || d.complete !== head.complete,
      stage: d.stage,
      memo: d.memo,
    });
    dropDraft(draftKey);
    onSwitch("update");
  };
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
      <StagePicker
        text={memo}
        value={d.stage}
        onChange={(stage) => update({ stage })}
        floor={floor}
        span={d.span}
        notes={memo}
        onNotes={(m) => update({ memo: m })}
      />
      {onSwitch && !seed && <Link title="Turn it into an update" onPress={sayIt} />}
      <CardPreview card={cardFor(preview.text, preview.deskText)} />
      <Button kind="green" title="Review the position" onPress={() => onReview(change, { after: reset })} />
    </View>
  );
}
