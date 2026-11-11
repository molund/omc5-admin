// Position: the gantry's span, Hung and a time stamp. No text, so the card shows a Trackside button. The steps of the
// cycle seen and a note to self go in gantry-cycles.yaml; a move logs "arrived at span" and marking a span hung logs "hung" by itself, so
// the velocity has them even when there's no update about them.
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { dropDraft, readDraft, useDesk, useDraft, writeDraft } from "../state/desk.js";
import { recentUpdates } from "../lib/entries.js";
import { headerOf } from "../lib/statusFile.js";
import { cardFor } from "../lib/card.js";
import { stageFloor } from "../lib/stages.js";
import { postedStage } from "../lib/deskFile.js";
import { compareKeys, nowKey, asOf } from "../lib/time.js";
import { GantryControls } from "../components/GantryControls.js";
import { TimeStampField } from "../components/TimeStampField.js";
import { CardPreview } from "../components/CardPreview.js";
import { StagePicker, stageToPost } from "../components/StagePicker.js";
import { emptyBlocks } from "../components/BlockEditor.js";
import { TurnIntoLinks } from "../components/TurnIntoLinks.js";
import { Button, Notice } from "../components/ui.js";

/**
 * @param {object} props
 * @param {(change: object, opts: object) => void} props.onReview
 * @param {(page: string, seed?: object) => void} [props.onSwitch] Turns this page into another one (Turn it into an update).
 *   A waiting position reopened (with a seed) is handed the new page's seed instead of a draft, so it's only replaced when
 *   the new version is saved.
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
    stage: stageToPost(d.stage, floor, memo, undefined, d.span),
  };
  const preview = desk.preview(change);
  // an addendum goes under the newest update from today or yesterday (blog posts aren't updates, so they're left out)
  const under = recentUpdates(desk.parsed)[0];
  // Turn it into an update: the same time stamp, gantry, step and notes, as an update, with its text still to write. An update draft
  // already started keeps its text, and takes these values.
  const sayIt = () => {
    if (seed) {
      const { time, span, complete, stage, memo } = d;
      return onSwitch("update", {
        time,
        span,
        complete,
        stage,
        memo,
        title: "",
        titleSet: false,
        blocks: emptyBlocks(),
      });
    }
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
  // Turn it into an addendum: the same time stamp, gantry, step and notes, under the newest update from today or yesterday,
  // with its text still to write. An addendum draft already started keeps its text, and takes these values.
  const toAddendum = () => {
    if (seed) {
      const { time, span, complete, stage, memo } = d;
      return onSwitch("followup", {
        noteKey: under.key,
        editing: null,
        time,
        span,
        complete,
        stage,
        // an addendum's notes are its update's: an empty one would clear them, so it's left out
        memo: memo || undefined,
        blocks: emptyBlocks(),
      });
    }
    const addendum = readDraft("followup", desk.draftsCleared) ?? {};
    writeDraft("followup", desk.draftsCleared, {
      ...addendum,
      noteKey: under.key,
      editing: null,
      time: d.time,
      manualUntil: d.manualUntil,
      span: d.span,
      complete: d.complete,
      stage: d.stage,
      ...(d.memo !== undefined && { memo: d.memo }),
      blocks: addendum.blocks ?? emptyBlocks(),
    });
    dropDraft(draftKey);
    onSwitch("followup");
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
      {onSwitch && <TurnIntoLinks under={under} onUpdate={sayIt} onAddendum={toAddendum} />}
      <CardPreview card={cardFor(preview.text, preview.deskText)} />
      <Button kind="green" title="Review the position" onPress={() => onReview(change, { after: reset })} />
    </View>
  );
}
