// Walk notes: the second way to write an update or blog post with AI. Everything seen on a walk goes in one box, with photos
// and a basic caption for each. Copy the prompt (writingPrompt.js's walkPrompt), run it in Copilot or Gemini, paste the whole
// reply back, and Fill in turns it into the title, summary, paragraphs and captions (walkReply.js), in the normal editor.
// The notes, photos and reply stay in the draft, so it can be run again.
import { useState } from "react";
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { walkPrompt } from "../lib/writingPrompt.js";
import { parseWalkReply } from "../lib/walkReply.js";
import { logPrompt } from "../lib/promptLog.js";
import { copyText } from "../platform/clipboard";
import { PROMPT_VERSION } from "../platform/promptVersion";
import { BlockEditor, emptyBlocks } from "./BlockEditor.js";
import { Button, Confirm, Field, Notice, Segmented } from "./ui.js";

export const emptyWalk = () => ({ blocks: emptyBlocks(), reply: "" });

const photoIds = (blocks) => blocks.map((b) => b.photoId).filter(Boolean);

/** After filling in: the old blocks' photos that neither the new blocks nor the walk use any more, to drop. */
export function unusedPhotos(old, next, walk) {
  const used = new Set([...photoIds(next), ...photoIds(walk)]);
  return photoIds(old).filter((id) => !used.has(id));
}

/** Every photo of the post and its walk, for Clear. */
export const allPhotos = (blocks, walk) => [...new Set([...photoIds(blocks), ...photoIds(walk?.blocks ?? [])])];

/** Write it myself | Walk notes, over the editor. */
export function WalkSwitch({ value, onChange }) {
  return (
    <Segmented
      options={[
        { value: "write", label: "Write it myself" },
        { value: "walk", label: "Walk notes" },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

/** After filling in: a reminder to check it, and what the reply got wrong. */
export function FilledNotice({ problems }) {
  return (
    <>
      <Notice>Filled in from the walk notes. Check it over before you review it.</Notice>
      {problems.map((p) => (
        <Notice key={p}>{p}</Notice>
      ))}
    </>
  );
}

/**
 * @param {object} props
 * @param {"update" | "blog"} props.kind
 * @param {{ blocks: object[], reply: string }} props.value The walk: its notes and photos as blocks, and the pasted reply.
 * @param {(walk: object) => void} props.onChange
 * @param {string} props.day "2026-11-12", for photo names
 * @param {string} [props.standardTitle] An update's date title, for the AI to keep or replace.
 * @param {boolean} props.hasText Whether the post already has text, which filling in replaces.
 * @param {(post: { title?: string, keepTitle: boolean, blocks: object[], problems: string[] }) => void} props.onFill
 */
export function WalkNotes({ kind, value, onChange, day, standardTitle, hasText, onFill }) {
  const { tw } = useTw();
  const [copied, setCopied] = useState(null); // true for a moment after a copy; false when it was refused
  const [problems, setProblems] = useState([]); // why the reply couldn't fill in
  const [confirming, setConfirming] = useState(false);
  const { blocks, reply } = value;
  const notes = blocks[0].text;
  const photos = blocks.filter((b) => b.type === "photo");
  const inputs = { kind, standardTitle, notes, captions: photos.map((p) => p.caption) };

  async function copyPrompt() {
    // kept as test data for the AI writing feature (lib/promptLog.js), asking for the reply with nothing around it
    logPrompt({
      prompt: walkPrompt(inputs, true),
      version: PROMPT_VERSION,
      field: "Walk notes",
      writes: kind === "update" ? "an update" : "a blog post",
      text: notes,
      context: { standardTitle, captions: inputs.captions },
    });
    const ok = await copyText(walkPrompt(inputs));
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(null), 1500);
  }

  function fill() {
    setConfirming(false);
    const r = parseWalkReply(reply, photos.length);
    if (!r.blocks[0].text) return setProblems(r.problems);
    setProblems([]);
    const stamp = Date.now().toString(36);
    onFill({
      ...r,
      blocks: r.blocks.map((b, i) =>
        b.type === "photo"
          ? { ...photos[b.n - 1], caption: b.caption ?? photos[b.n - 1].caption }
          : b.type === "text"
            ? { ...b, k: `w${stamp}-${i}` }
            : b,
      ),
    });
  }

  return (
    <View style={tw`gap-3`}>
      <BlockEditor
        walk
        blocks={blocks}
        onChange={(b) => onChange({ ...value, blocks: b })}
        day={day}
        nameHint={notes}
      />
      <Button
        title={copied ? "Copied" : copied === false ? "Couldn't copy the prompt" : "Copy the prompt"}
        disabled={!notes.trim()}
        onPress={copyPrompt}
      />
      <Field
        multiline
        heading="The AI's reply"
        value={reply}
        onChangeText={(t) => onChange({ ...value, reply: t })}
        placeholder="Paste the whole reply here"
        noAi
        label="The AI's reply"
      />
      {problems.map((p) => (
        <Notice key={p} tone="problem">
          {p}
        </Notice>
      ))}
      {confirming ? (
        <Confirm action="Fill in" onCancel={() => setConfirming(false)} onConfirm={fill}>
          {`Replace the ${kind === "update" ? "update's" : "post's"} title, summary, paragraphs and photos with the reply's?`}
        </Confirm>
      ) : (
        <Button
          kind="green"
          title={kind === "update" ? "Fill in the update" : "Fill in the blog post"}
          disabled={!reply.trim()}
          onPress={() => (hasText ? setConfirming(true) : fill())}
        />
      )}
    </View>
  );
}
