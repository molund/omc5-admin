// Follow-up: pick today's or yesterday's update, then add a follow-up or edit one it has. A new follow-up becomes the card's newest
// word; the Move controls are folded in, since follow-ups often report a move.
import { useRef, useState } from "react";
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
import { StagePicker, chosenStage } from "../components/StagePicker.js";
import { memoAt, postedStage } from "../lib/deskFile.js";
import { recentUpdates } from "../lib/entries.js";
import { floorStage, stageFloor } from "../lib/stages.js";
import { Body, Button, Label, Notice, Panel, Row, useTapAway, Warning } from "../components/ui.js";

// a date title says no more than the time stamp beside it, so those show the start of their summary
const noteName = (n) =>
  n.title && !isDateTitle(n.title)
    ? n.title
    : n.fields.summary.length > 90
      ? `${n.fields.summary.slice(0, 88)}…`
      : n.fields.summary;

const RULE = "An addendum can only go under an update from today or yesterday (BC time), and not under a blog post.";

/** In place of the page when no update qualifies. */
export const NoUpdateWarning = () => <Warning>{RULE} There isn't one right now, so there's nothing to add to.</Warning>;

export function FollowUpScreen({ onReview, draftKey = "followup", seed }) {
  const { tw } = useTw();
  const desk = useDesk();
  const head = headerOf(desk.parsed);
  // a new follow-up goes under today's or yesterday's update; a waiting one reopened keeps the update or blog post it's under
  // (entries with no summary, a position's note to self, aren't updates, so they can't be followed up)
  const notes = seed ? newestFirst(desk.parsed.notes).filter((n) => n.fields.summary) : recentUpdates(desk.parsed);
  const first = notes.find((n) => !n.fields.post) ?? notes[0];
  const fresh = (noteKey) => ({
    noteKey,
    editing: null,
    memo: undefined, // untouched: the parent's own
    time: nowKey(),
    manualUntil: null,
    blocks: emptyBlocks(),
    span: head.span,
    complete: head.complete,
  });
  const [d, update, reset] = useDraft(draftKey, () => seed ?? fresh(first?.key));
  const [picking, setPicking] = useState(false);
  const [why, setWhy] = useState(false); // the note on why Change is off, shown after it's pressed
  // pressing Change while the note is open is a tap anywhere too, so it closes it, and Change mustn't open it again
  const closedAt = useRef(0);
  useTapAway(why, () => {
    closedAt.current = Date.now();
    setWhy(false);
  });
  const note = notes.find((n) => n.key === d.noteKey) ?? first;
  if (!note) return <NoUpdateWarning />;

  const fus = followUpsNewestFirst(note);
  const gantryChanged = d.span !== head.span || d.complete !== head.complete;
  // a follow-up has no note to self of its own: this is its parent's (in desk.yaml)
  const memo = d.memo ?? memoAt(desk.deskEntries, note.key);
  const text = blockTexts(d.blocks).join("\n");
  // a follow-up that doesn't change the gantry is about the span as it is; one being edited has no say about the span's state
  // nor earlier than the furthest step already posted for the span (not when editing: that may be a correction)
  const floor = d.editing ? floorStage(false) : stageFloor(d.complete, postedStage(desk.deskEntries, d.span));
  const withMemo = { memo: { noteKey: note.key, text: memo }, stage: chosenStage(d.stage, floor) };
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
      {/* over the panels below it, while its note on why Change is off is open */}
      <Panel style={notes.length <= 1 && why && { zIndex: 10 }}>
        <Label
          // with only one to choose from, there's nothing to change to: Change shows dimmed, and says why when it's pressed
          right={
            notes.length > 1 ? (
              <Button kind="link" small title={picking ? "Close" : "Change"} onPress={() => setPicking(!picking)} />
            ) : (
              <Button
                kind="link"
                small
                title="Change"
                label="Change, not available: press to see why"
                style={tw`opacity-40`}
                onPress={() => Date.now() - closedAt.current > 100 && setWhy(true)}
              />
            )
          }
        >
          {note.fields.post ? "Blog post" : "Follow-up which post?"}
        </Label>
        {notes.length <= 1 && why && (
          // a tap or click anywhere closes it (useTapAway)
          <Warning style={{ position: "absolute", top: 44, right: 12, maxWidth: 300, zIndex: 10 }}>
            {RULE} This is the only update that qualifies right now, so there's nothing else to choose.
          </Warning>
        )}
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
        <Label>{fus.length ? `Existing addendums (${fus.length})` : "No addendums yet"}</Label>
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
          <Label>{d.editing ? `Editing the ${clock(d.editing)} addendum` : "New addendum"}</Label>
          {d.editing && <Button kind="link" small title="Cancel edit" onPress={() => start({})} />}
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
          notes={memo}
          onNotes={(m) => update({ memo: m })}
          notesWhere={`An addendum has none of its own: this is the ${note.fields.post ? "blog post's" : "update's"} (${stamp(note.key)}).`}
        />
        <BlockEditor
          blocks={d.blocks}
          onChange={(blocks) => update({ blocks })}
          day={dayOf(d.time)}
          nameHint={d.blocks[0].text}
          followUp
        />
        {!d.editing && <GantryFold value={d} current={head} onChange={(g) => update(g)} offLabel="Gantry unchanged" />}
      </View>

      <StyleHints texts={blockTexts(d.blocks)} />
      <CardPreview card={cardFor(preview.text, preview.deskText)} />
      {problems.map((p) => (
        <Notice key={p} tone="problem">
          {p}
        </Notice>
      ))}
      <View style={tw`flex-row gap-2`}>
        {/* editing: back to a new follow-up under the same update */}
        <Button
          title={d.editing ? "Cancel edit" : "Clear"}
          onPress={() => {
            if (d.editing) return start({});
            drop();
            reset();
          }}
        />
        <Button
          kind="green"
          title={d.editing ? "Review the edit" : "Review the addendum"}
          disabled={problems.length > 0}
          style={tw`flex-1`}
          onPress={() => onReview(change, { after: reset })}
        />
      </View>
    </View>
  );
}
