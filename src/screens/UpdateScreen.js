// Update: a status update. The Move controls folded to one line, a title, the summary (which goes on the card), and
// paragraph and photo blocks.
import { useState } from "react";
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { dropDraft, readDraft, useDesk, useDraft, writeDraft } from "../state/desk.js";
import { headerOf } from "../lib/statusFile.js";
import { cardFor } from "../lib/card.js";
import { dateTitle } from "../lib/titles.js";
import { dayOf, nowKey } from "../lib/time.js";
import { GantryControls } from "../components/GantryControls.js";
import { TimeStampField } from "../components/TimeStampField.js";
import { TitleField, titleProblems } from "../components/TitleField.js";
import { BlockEditor, blockProblems, blockTexts, emptyBlocks } from "../components/BlockEditor.js";
import { StyleHints } from "../components/StyleHints.js";
import { CardPreview } from "../components/CardPreview.js";
import { StagePicker, chosenStage } from "../components/StagePicker.js";
import { stageFloor } from "../lib/stages.js";
import { memoAt, postedStage } from "../lib/deskFile.js";
import { Button, Confirm, Link, Notice } from "../components/ui.js";

/**
 * @param {object} props
 * @param {(change: object, opts: object) => void} props.onReview
 * @param {(page: string) => void} [props.onSwitch] Turns this page into another one (Forget it: Position).
 */
export function UpdateScreen({ onReview, onSwitch, draftKey = "update", seed }) {
  const { tw } = useTw();
  const desk = useDesk();
  const notes = desk.parsed.notes;
  const head = headerOf(desk.parsed);
  const [saved, update, reset] = useDraft(
    draftKey,
    () =>
      seed ?? {
        time: nowKey(),
        span: head.span,
        complete: head.complete,
        title: "",
        titleSet: false,
        blocks: emptyBlocks(),
        memo: undefined, // untouched: the one already at this time stamp, if any
      },
  );
  // until the gantry is changed here, the draft shows the gantry as it is now, even if it moved since the draft was saved
  const d = saved.gantrySet || seed ? saved : { ...saved, span: head.span, complete: head.complete };
  // a position at the same time stamp may have a note to self: it fills the field, and stays unless it is deleted here
  const memo = d.memo ?? memoAt(desk.deskEntries, d.time);
  // until a title is typed, it's the date title
  const title = d.titleSet ? d.title : dateTitle(d.time);
  // notes are keyed by time stamp, so two can't share one
  const taken = notes.some((n) => n.key === d.time);
  const problems = [
    ...titleProblems("update", d.time, title),
    ...blockProblems(d.blocks),
    ...(taken ? ["There's already an update at this time stamp. Move it a quarter hour."] : []),
  ];
  const floor = stageFloor(d.complete, postedStage(desk.deskEntries, d.span));
  const change = {
    kind: "update",
    time: d.time,
    span: d.span,
    complete: d.complete,
    title: title.trim(),
    blocks: d.blocks,
    memo: { noteKey: d.time, text: memo },
    stage: chosenStage(d.stage, floor),
  };
  const preview = desk.preview(change);
  const discard = () => {
    desk.dropPhotos(d.blocks.map((b) => b.photoId).filter(Boolean));
    reset();
  };
  // Forget it, just post the position: the same time stamp, gantry, step and notes as a position, and the text and photos
  // thrown away. A position draft already started takes these values.
  const [forgetting, setForgetting] = useState(false);
  const forgetIt = () => {
    writeDraft("move", desk.draftsCleared, {
      ...readDraft("move", desk.draftsCleared),
      time: d.time,
      manualUntil: d.manualUntil,
      span: d.span,
      complete: d.complete,
      stage: d.stage,
      memo,
    });
    desk.dropPhotos(d.blocks.map((b) => b.photoId).filter(Boolean));
    dropDraft(draftKey);
    onSwitch("move");
  };
  return (
    <View style={tw`gap-3`}>
      <GantryControls
        value={d}
        current={head}
        onChange={(g) => update({ ...g, gantrySet: g.span !== head.span || g.complete !== head.complete })}
      />
      <TimeStampField
        value={d.time}
        onChange={(time) => update({ time })}
        auto={!seed}
        manualUntil={d.manualUntil}
        onManual={(manualUntil) => update({ manualUntil })}
      />
      <StagePicker
        text={blockTexts(d.blocks).join("\n")}
        value={d.stage}
        onChange={(stage) => update({ stage })}
        floor={floor}
        span={d.span}
        notes={memo}
        onNotes={(memo) => update({ memo })}
      />
      {onSwitch && !seed && (
        <View style={tw`gap-2`}>
          <Link title="Forget it, just post the position" onPress={() => setForgetting(true)} />
          {forgetting && (
            <Confirm action="Forget it" onCancel={() => setForgetting(false)} onConfirm={forgetIt}>
              Forget this update's title, summary, paragraphs and photos? The position keeps its time stamp, gantry,
              step and notes.
            </Confirm>
          )}
        </View>
      )}
      <TitleField
        kind="update"
        stamp={d.time}
        title={title}
        onChange={(t) =>
          update(t === dateTitle(d.time) ? { title: "", titleSet: false } : { title: t, titleSet: true })
        }
        notes={notes}
      />
      <BlockEditor
        blocks={d.blocks}
        onChange={(blocks) => update({ blocks })}
        day={dayOf(d.time)}
        nameHint={d.titleSet ? title : d.blocks[0].text}
      />
      <StyleHints texts={[title, ...blockTexts(d.blocks)]} />
      <CardPreview card={cardFor(preview.text, preview.deskText)} />
      {problems.map((p) => (
        <Notice key={p} tone="problem">
          {p}
        </Notice>
      ))}
      <View style={tw`flex-row gap-2`}>
        <Button title="Clear" onPress={discard} />
        <Button
          kind="green"
          title="Review the update"
          disabled={problems.length > 0}
          style={tw`flex-1`}
          onPress={() => onReview(change, { after: reset })}
        />
      </View>
    </View>
  );
}
