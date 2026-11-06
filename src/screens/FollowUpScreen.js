// Follow-up: pick an update or blog post, then add a follow-up or edit one it has. A new follow-up becomes the card's newest
// word; the Move controls are folded in, since follow-ups often report a move.
import { useState } from "react";
import { Pressable, View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk, useDraft } from "../state/desk.js";
import { headerOf, newestFirst, followUpsNewestFirst } from "../lib/statusFile.js";
import { cardFor } from "../lib/card.js";
import { clock, dayOf, nowKey, stamp } from "../lib/time.js";
import { isDateTitle } from "../lib/titles.js";
import { GantryFold } from "../components/GantryControls.js";
import { TimeStampField } from "../components/TimeStampField.js";
import { BlockEditor, blockProblems, blockTexts, blocksOf, emptyBlocks } from "../components/BlockEditor.js";
import { StyleHints } from "../components/StyleHints.js";
import { CardPreview } from "../components/CardPreview.js";
import { NoteToSelf, whereIs } from "../components/NoteToSelf.js";
import { StagePicker, chosenStage } from "../components/StagePicker.js";
import { memoAt } from "../lib/deskFile.js";
import { floorStage } from "../lib/stages.js";
import { Body, Button, Label, Notice, Panel, Row } from "../components/ui.js";

// a date title says no more than the time stamp beside it, so those show the start of their summary
const noteName = (n) =>
  n.title && !isDateTitle(n.title)
    ? n.title
    : n.fields.summary.length > 90
      ? `${n.fields.summary.slice(0, 88)}…`
      : n.fields.summary;

export function FollowUpScreen({ onReview, draftKey = "followup", seed }) {
  const { tw } = useTw();
  const desk = useDesk();
  const head = headerOf(desk.parsed);
  // entries with no summary (a position's note to self) aren't updates, so they can't be followed up
  const notes = newestFirst(desk.parsed.notes).filter((n) => n.fields.summary);
  const first = notes.find((n) => !n.fields.post) ?? notes[0];
  const fresh = (noteKey) => ({
    noteKey,
    editing: null,
    memo: undefined, // untouched: the parent's own
    time: nowKey(),
    blocks: emptyBlocks(),
    span: head.span,
    complete: head.complete,
  });
  const [d, update, reset] = useDraft(draftKey, () => seed ?? fresh(first?.key));
  const [picking, setPicking] = useState(false);
  const note = notes.find((n) => n.key === d.noteKey) ?? first;
  if (!note) return <Notice>There are no updates to follow up yet.</Notice>;

  const fus = followUpsNewestFirst(note);
  const gantryChanged = d.span !== head.span || d.complete !== head.complete;
  // a follow-up has no note to self of its own: this is its parent's (in desk.yaml)
  const memo = d.memo ?? memoAt(desk.deskEntries, note.key);
  const text = blockTexts(d.blocks).join("\n");
  // a follow-up that doesn't change the gantry is about the span as it is; one being edited has no say about the span's state
  const floor = d.editing ? floorStage(false) : floorStage(d.complete);
  const withMemo = { memo: { noteKey: note.key, text: memo }, stage: chosenStage(d.stage, text, floor) };
  const change = d.editing
    ? {
        kind: "followup-edit",
        noteKey: note.key,
        fuKey: d.editing,
        time: d.time,
        blocks: d.blocks,
        ...withMemo,
      }
    : {
        kind: "followup",
        noteKey: note.key,
        time: d.time,
        blocks: d.blocks,
        gantry: gantryChanged ? { span: d.span, complete: d.complete } : null,
        ...withMemo,
      };
  const problems = blockProblems(d.blocks);
  const preview = desk.preview(change);
  const drop = () => desk.dropPhotos(d.blocks.map((b) => b.photoId).filter(Boolean));
  const start = (patch) => {
    drop();
    update({ ...fresh(note.key), ...patch });
  };

  return (
    <View style={tw`gap-3`}>
      <Panel>
        <Label
          right={<Button kind="link" small title={picking ? "Close" : "Change"} onPress={() => setPicking(!picking)} />}
        >
          {note.fields.post ? "Blog post" : "Update"}
        </Label>
        {!picking && (
          <Body>
            {noteName(note)} <Body mute>· {stamp(note.key)}</Body>
          </Body>
        )}
        {picking &&
          notes.slice(0, 20).map((n) => (
            <Pressable
              key={n.key}
              accessibilityRole="button"
              onPress={() => {
                setPicking(false);
                drop();
                update(fresh(n.key));
              }}
              style={({ hovered }) => [tw`rounded-md px-2 py-1.5`, (hovered || n.key === note.key) && tw`bg-bg`]}
            >
              <Body>
                {noteName(n)}
                <Body mute>
                  {" "}
                  · {stamp(n.key)}
                  {n.fields.post ? " · blog" : ""}
                </Body>
              </Body>
            </Pressable>
          ))}
      </Panel>

      <Panel>
        <Label>{fus.length ? `Follow-ups (${fus.length})` : "No follow-ups yet"}</Label>
        {fus.map((f) => (
          <Row key={f.key} style={tw`flex-nowrap items-start border-t border-line pt-2`}>
            <Body small mute style={{ width: 64 }}>
              {dayOf(f.key) === dayOf(note.key) ? clock(f.key) : stamp(f.key)}
            </Body>
            <Body style={tw`flex-1`}>{f.fields.summary}</Body>
            {d.editing === f.key ? (
              <Body small mute>
                editing
              </Body>
            ) : (
              <Button
                kind="link"
                small
                title="Edit"
                onPress={() => {
                  const stage = desk.deskEntries.find((e) => e.key === f.key)?.stage ?? undefined;
                  start({ editing: f.key, time: f.key, blocks: blocksOf(f.fields), stage });
                }}
              />
            )}
          </Row>
        ))}
      </Panel>

      <View style={tw`gap-3 rounded-lg border border-accent p-2.5`}>
        <Row>
          <Label>{d.editing ? `Editing the ${clock(d.editing)} follow-up` : "New follow-up"}</Label>
          {d.editing && <Button kind="link" small title="Write a new one instead" onPress={() => start({})} />}
        </Row>
        <TimeStampField
          value={d.time}
          onChange={(time) => update({ time })}
          auto={!seed && !d.editing}
          manualUntil={d.manualUntil}
          onManual={(manualUntil) => update({ manualUntil })}
          note={d.editing ? "Moving it changes only its own time stamp." : undefined}
        />
        <StagePicker
          text={text}
          value={d.stage}
          onChange={(stage) => update({ stage })}
          floor={floor}
          span={d.editing ? null : d.span}
        />
        <BlockEditor
          blocks={d.blocks}
          onChange={(blocks) => update({ blocks })}
          summaryLabel={note.fields.post ? "Summary" : "Summary · goes on the card"}
          day={dayOf(d.time)}
          nameHint={d.blocks[0].text}
          followUp
        />
        {!d.editing && <GantryFold value={d} current={head} onChange={(g) => update(g)} offLabel="Gantry unchanged" />}
      </View>

      <NoteToSelf
        value={memo}
        onChange={(m) => update({ memo: m })}
        where={`A follow-up has none of its own: this is the ${note.fields.post ? "blog post's" : "update's"} (${stamp(note.key)}).`}
      />
      <StyleHints texts={blockTexts(d.blocks)} />
      <CardPreview card={cardFor(preview.text)} />
      {problems.map((p) => (
        <Notice key={p} tone="problem">
          {p}
        </Notice>
      ))}
      <View style={tw`flex-row gap-2`}>
        <Button
          title="Clear"
          onPress={() => {
            drop();
            reset();
          }}
        />
        <Button
          kind="green"
          title={d.editing ? "Review the edit" : "Review the follow-up"}
          disabled={problems.length > 0}
          style={tw`flex-1`}
          onPress={() => onReview(change, { after: () => update(fresh(note.key)) })}
        />
      </View>
    </View>
  );
}
