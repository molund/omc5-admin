// Changing something already saved: an update or blog post (its time stamp is locked, because its comment thread and page
// anchor come from it), a follow-up, or a position record. It makes an ordinary change: reviewed, kept on this device and
// not on the site until it's pushed.
import { useState } from "react";
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk } from "../state/desk.js";
import { cardFor } from "../lib/card.js";
import { memoAt, stageBefore } from "../lib/deskFile.js";
import { STAGES } from "../lib/stages.js";
import { positionName } from "../lib/entries.js";
import { dayOf, stamp } from "../lib/time.js";
import { slugsOf } from "../lib/titles.js";
import { BlockEditor, blockProblems, blockTexts, blocksOf } from "./BlockEditor.js";
import { CardPreview } from "./CardPreview.js";
import { NoteToSelf } from "./NoteToSelf.js";
import { StagePicker, stageToPost } from "./StagePicker.js";
import { StyleHints } from "./StyleHints.js";
import { TimeStampField } from "./TimeStampField.js";
import { TitleField, titleProblems } from "./TitleField.js";
import { Body, Button, Confirm, Label, Notice, Panel, Row } from "./ui.js";

const TYPE = { update: "Update", blog: "Blog post", position: "Position", followup: "Addendum" };

/** What's being edited, from the working copy: { note, fu, record, gone }. */
export function findTarget(desk, target) {
  const note = desk.parsed.notes.find((n) => n.key === (target.noteKey ?? target.key)) ?? null;
  const fu = target.type === "followup" ? (note?.followUps.find((f) => f.key === target.key) ?? null) : null;
  const record = desk.deskEntries.find((e) => e.key === target.key) ?? null;
  return { note, fu, record, gone: target.type === "followup" ? !fu : !note && !record };
}

/** The fields an editor starts with, from what's saved. */
export function seedFor(desk, target) {
  const { note, fu, record } = findTarget(desk, target);
  const steps = { stage: record?.stage ?? undefined };
  if (target.type === "followup")
    return { ...steps, time: target.key, blocks: blocksOf(fu.fields), memo: memoAt(desk.deskEntries, note.key) };
  if (target.type === "position") return { ...steps, memo: record?.noteToSelf ?? "" };
  return { ...steps, title: note.title, blocks: blocksOf(note.fields), memo: memoAt(desk.deskEntries, note.key) };
}

/** Whether a note's or addendum's fields have a photo: its own, or in a block. */
const hasPhoto = (fields) => !!fields.photo?.file || fields.block.some((b) => b.photo);

/** What deleting does, for the review. Photos are only mentioned when the entry has some. */
function deleteWarning(target, note, address, fu) {
  if (target.type === "followup")
    return `This addendum comes off the site when you push.${hasPhoto(fu.fields) ? " Its photo files stay in the repo." : ""}`;
  if (!note?.fields.summary)
    return "This record comes out of gantry-cycles.yaml when you push, and any steps in it leave the velocity. The gantry's span and Hung stay as they are.";
  const count = note.followUps.length;
  const photos = hasPhoto(note.fields) || note.followUps.some((f) => hasPhoto(f.fields));
  return [
    `This comes off the site when you push, and ?post=${address} stops working.`,
    count ? `${count === 1 ? "Its addendum goes" : `Its ${count} addendums go`} with it.` : "",
    `Its comment thread stays on GitHub with nothing linking to it${photos ? ", and its photo files stay in the repo" : ""}.`,
    "Any steps logged with it leave the velocity.",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * @param {object} props
 * @param {{ type: string, key: string, noteKey?: string }} props.target
 * @param {object} props.draft The fields being edited (seedFor's, then the edits).
 * @param {(patch: object) => void} props.update
 * @param {() => void} props.onClose
 * @param {(change: object, opts: object) => void} props.onReview
 * @param {boolean} [props.noDelete] A waiting edit has only Discard, in the waiting list.
 * @param {boolean} [props.noBack] The way back is already on the page.
 */
export function EntryEditor({ target, draft: d, update, onClose, onReview, noDelete, noBack }) {
  const { tw } = useTw();
  const desk = useDesk();
  const [asking, setAsking] = useState(false); // Delete was pressed, and wants its confirmation
  const { note, fu, record, gone } = findTarget(desk, target);

  const header = (
    <Panel>
      <Row>
        <Label>{`Editing: ${TYPE[target.type]}`}</Label>
        {!noBack && <Button kind="link" small title="Back" onPress={onClose} />}
      </Row>
      {gone ? (
        <Notice>That entry isn't in the working copy any more.</Notice>
      ) : (
        target.type !== "followup" && (
          <Body small mute>
            {stamp(target.key)}
            {target.type === "position" ? "" : ". Locked: its comment thread and links come from it."}
          </Body>
        )
      )}
    </Panel>
  );
  if (gone) return header;

  const isPost = target.type === "blog";
  const text = target.type === "position" ? (d.memo ?? "") : blockTexts(d.blocks).join("\n");
  // a step is always reported, except by a position that's only a note in status.yaml (no record here) and a blog post
  const before = stageBefore(desk.deskEntries, target.key);
  const stage = target.type === "position" && !record ? undefined : stageToPost(d.stage, STAGES[0], text, before);
  const memo = d.memo ?? "";
  let change, problems;
  if (target.type === "followup") {
    change = {
      kind: "followup-edit",
      noteKey: note.key,
      fuKey: target.key,
      time: d.time,
      blocks: d.blocks,
      memo: { noteKey: note.key, text: memo },
      stage,
    };
    problems = blockProblems(d.blocks);
  } else if (target.type === "position") {
    change = { kind: "desk-edit", key: target.key, stage, noteToSelf: memo };
    problems = [];
  } else {
    const title = d.title.trim();
    change = {
      kind: "note-edit",
      noteKey: note.key,
      title,
      blocks: d.blocks,
      memo: { noteKey: note.key, text: memo },
      ...(isPost ? {} : { stage }),
    };
    problems = [
      // a title left as it was isn't a new problem, whatever the rules say about it now
      ...(title === note.title ? [] : titleProblems(isPost ? "blog" : "update", note.key, title)),
      ...blockProblems(d.blocks),
    ];
  }
  const preview = desk.preview(change);
  const unchanged = !preview.error && !preview.hunks.length && !preview.deskHunks.length;
  const steps = (
    <StagePicker
      text={text}
      value={d.stage}
      onChange={(s) => update({ stage: s })}
      span={record?.span}
      fallback={before}
      notes={memo}
      onNotes={(m) => update({ memo: m })}
      notesWhere={
        target.type === "followup"
          ? `An addendum has none of its own: this is the ${note.fields.post ? "blog post's" : "update's"} (${stamp(note.key)}).`
          : ""
      }
    />
  );
  const warning = deleteWarning(target, note, note && slugsOf(desk.parsed.notes).get(note.key), fu);
  const deleteChange =
    target.type === "followup"
      ? { kind: "followup-delete", noteKey: note.key, fuKey: target.key }
      : note
        ? { kind: "note-delete", noteKey: target.key }
        : { kind: "desk-delete", key: target.key };

  return (
    <View style={tw`gap-3`}>
      {header}
      {target.type === "followup" && (
        <TimeStampField
          value={d.time}
          onChange={(time) => update({ time })}
          note="Moving it changes only its own time stamp."
        />
      )}
      {target.type === "position" ? (
        record ? (
          <Body small mute>
            {positionName({ note, record })}
          </Body>
        ) : (
          <Notice>This has no record in gantry-cycles.yaml to edit. It can only be deleted.</Notice>
        )
      ) : null}
      {(target.type === "position" ? !!record : !isPost) && steps}
      {(target.type === "update" || isPost) && (
        <TitleField
          kind={isPost ? "blog" : "update"}
          stamp={note.key}
          title={d.title}
          onChange={(title) => update({ title })}
          notes={desk.parsed.notes}
          address={slugsOf(desk.parsed.notes).get(note.key)}
        />
      )}
      {target.type !== "position" && (
        <BlockEditor
          blocks={d.blocks}
          onChange={(blocks) => update({ blocks })}
          day={dayOf(target.key)}
          nameHint={d.title ?? d.blocks[0].text}
          followUp={target.type === "followup"}
        />
      )}
      {/* a blog post has no step, so its notes aren't in a step box */}
      {isPost && <NoteToSelf value={memo} onChange={(m) => update({ memo: m })} />}
      {target.type !== "position" && <StyleHints texts={[...(d.title ? [d.title] : []), ...blockTexts(d.blocks)]} />}
      {target.type !== "position" && !preview.error && <CardPreview card={cardFor(preview.text, preview.deskText)} />}
      {preview.error && <Notice tone="problem">{preview.error}</Notice>}
      {problems.map((p) => (
        <Notice key={p} tone="problem">
          {p}
        </Notice>
      ))}
      {asking && (
        <Confirm
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            onReview(deleteChange, { after: onClose, warning });
          }}
        >
          {`Delete this ${TYPE[target.type].toLowerCase()}? ${warning}`}
        </Confirm>
      )}
      <View style={tw`flex-row gap-2`}>
        {!noDelete && <Button kind="danger" title="Delete" onPress={() => setAsking(true)} />}
        <Button
          kind="green"
          title={unchanged ? "No changes yet" : "Review the edit"}
          disabled={unchanged || !!preview.error || problems.length > 0 || (target.type === "position" && !record)}
          style={tw`flex-1`}
          onPress={() => onReview(change, { after: onClose })}
        />
      </View>
    </View>
  );
}
