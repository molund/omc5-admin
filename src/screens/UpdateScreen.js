// Update: a status update. The Move controls folded to one line, a title, the summary (which goes on the card), and
// paragraph and photo blocks.
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk, useDraft } from "../state/desk.js";
import { headerOf } from "../lib/statusFile.js";
import { cardFor } from "../lib/card.js";
import { dateTitle, titleAdvice } from "../lib/titles.js";
import { dayOf, nowKey } from "../lib/time.js";
import { GantryFold } from "../components/GantryControls.js";
import { TimeStampField } from "../components/TimeStampField.js";
import { TitleField, retitleList, titleProblems } from "../components/TitleField.js";
import { BlockEditor, blockProblems, blockTexts, emptyBlocks } from "../components/BlockEditor.js";
import { StyleHints } from "../components/StyleHints.js";
import { CardPreview } from "../components/CardPreview.js";
import { NoteToSelf, whereIs } from "../components/NoteToSelf.js";
import { StagePicker, chosenStages } from "../components/StagePicker.js";
import { autoStages } from "../lib/deskChanges.js";
import { Button, Notice } from "../components/ui.js";

export function UpdateScreen({ onReview, draftKey = "update", seed }) {
  const { tw } = useTw();
  const desk = useDesk();
  const notes = desk.parsed.notes;
  const head = headerOf(desk.parsed);
  const [d, update, reset] = useDraft(
    draftKey,
    () =>
      seed ?? {
        time: nowKey(),
        span: head.span,
        complete: head.complete,
        title: "",
        titleSet: false,
        blocks: emptyBlocks(),
        retitles: {},
        memo: "",
      },
  );
  // until a title is typed, it follows the rules: the date title for the day's only update, a headline otherwise
  const auto = titleAdvice("update", d.time, "", notes).sameDay.length ? "" : dateTitle(d.time);
  const title = d.titleSet ? d.title : auto;
  // notes are keyed by time stamp, so two can't share one
  const taken = notes.some((n) => n.key === d.time);
  const problems = [
    ...titleProblems("update", d.time, title, notes, d.retitles),
    ...blockProblems(d.blocks),
    ...(taken ? ["There's already an update at this time stamp. Move it a quarter hour."] : []),
  ];
  const change = {
    kind: "update",
    time: d.time,
    span: d.span,
    complete: d.complete,
    title: title.trim(),
    blocks: d.blocks,
    retitle: problems.length ? [] : retitleList(d.time, title, notes, d.retitles),
    memo: { noteKey: d.time, text: d.memo ?? "" },
    stages: chosenStages(d.stages, blockTexts(d.blocks).join("\n")),
  };
  const preview = desk.preview(change);
  const discard = () => {
    desk.dropPhotos(d.blocks.map((b) => b.photoId).filter(Boolean));
    reset();
  };
  return (
    <View style={tw`gap-3`}>
      <GantryFold value={d} current={head} onChange={(g) => update(g)} />
      <TimeStampField value={d.time} onChange={(time) => update({ time })} />
      <StagePicker
        text={blockTexts(d.blocks).join("\n")}
        value={d.stages}
        onChange={(stages) => update({ stages })}
        auto={autoStages(head, d)}
        span={d.span}
      />
      <TitleField
        kind="update"
        stamp={d.time}
        title={title}
        onChange={(t) =>
          update(t === dateTitle(d.time) ? { title: "", titleSet: false } : { title: t, titleSet: true })
        }
        notes={notes}
        retitles={d.retitles}
        onRetitle={(retitles) => update({ retitles })}
      />
      <BlockEditor
        blocks={d.blocks}
        onChange={(blocks) => update({ blocks })}
        summaryLabel="Summary · goes on the card"
        day={dayOf(d.time)}
        nameHint={d.titleSet ? title : d.blocks[0].text}
      />
      <NoteToSelf value={d.memo ?? ""} onChange={(memo) => update({ memo })} />
      <StyleHints texts={[title, ...blockTexts(d.blocks)]} />
      <CardPreview card={cardFor(preview.text)} />
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
