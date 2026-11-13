// Write with AI (it was Walk notes): the second way to write an update or blog post. Everything seen on a walk goes in one
// box, with photos and a basic caption for each, and the prompt (writingPrompt.js's walkPrompt) asks for the title, summary,
// paragraphs and captions, which fill in the normal editor (walkReply.js). On the phone, the model chosen in Settings is
// asked through OpenRouter (services/openrouter.js). In the Claude app, which has no key, the prompt is copied, run in
// Copilot or Gemini, and the whole reply pasted back. The notes and photos stay in the draft, so it can be run again.
import { useState } from "react";
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk } from "../state/desk.js";
import { walkPrompt } from "../lib/writingPrompt.js";
import { parseWalkReply } from "../lib/walkReply.js";
import { logPrompt } from "../lib/promptLog.js";
import { copyText } from "../platform/clipboard";
import { PROMPT_VERSION } from "../platform/promptVersion";
import { canKeepToken, readAIKey } from "../platform/secrets";
import { askModel, modelOf } from "../services/openrouter.js";
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

/** Write it myself | Write with AI, over the editor. */
export function WalkSwitch({ value, onChange }) {
  return (
    <Segmented
      options={[
        { value: "write", label: "Write it myself" },
        { value: "walk", label: "Write with AI" },
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
      <Notice>Filled in by AI. Check it over before you review it.</Notice>
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
  const [writing, setWriting] = useState(false);
  const desk = useDesk();
  const model = modelOf(desk.aiModel);
  const { blocks, reply } = value;
  const notes = blocks[0].text;
  const photos = blocks.filter((b) => b.type === "photo");
  const inputs = { kind, standardTitle, notes, captions: photos.map((p) => p.caption) };

  // kept as test data for the AI writing feature (lib/promptLog.js), asking for the reply with nothing around it
  function keepPrompt() {
    logPrompt({
      prompt: walkPrompt(inputs, true),
      version: PROMPT_VERSION,
      field: "Walk notes",
      writes: kind === "update" ? "an update" : "a blog post",
      text: notes,
      context: { standardTitle, captions: inputs.captions },
    });
  }

  async function copyPrompt() {
    keepPrompt();
    const ok = await copyText(walkPrompt(inputs));
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(null), 1500);
  }

  /** On the phone: asks the model chosen in Settings, and fills in the post from its reply. */
  async function write() {
    setConfirming(false);
    setWriting(true);
    setProblems([]);
    try {
      keepPrompt();
      const key = await readAIKey();
      if (!key) throw new Error("There's no OpenRouter key on this iPhone. Add one in Settings.");
      fill(await askModel({ key, model: model.id, prompt: walkPrompt(inputs, true) }));
    } catch (e) {
      setProblems([e.message]);
    } finally {
      setWriting(false);
    }
  }

  function fill(text = reply) {
    setConfirming(false);
    const r = parseWalkReply(text, photos.length);
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
      {!canKeepToken && (
        <>
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
        </>
      )}
      {canKeepToken && !desk.aiKeyInfo && (
        <Notice>Writing with AI needs an OpenRouter key. Add one in Settings.</Notice>
      )}
      {problems.map((p) => (
        <Notice key={p} tone="problem">
          {p}
        </Notice>
      ))}
      {confirming ? (
        <Confirm
          action={canKeepToken ? "Write" : "Fill in"}
          onCancel={() => setConfirming(false)}
          onConfirm={canKeepToken ? write : () => fill()}
        >
          {`Replace the ${kind === "update" ? "update's" : "post's"} title, summary, paragraphs and photos with the AI's?`}
        </Confirm>
      ) : canKeepToken ? (
        <Button
          kind="green"
          title={
            writing
              ? `Writing with ${model.label}…`
              : `Write the ${kind === "update" ? "update" : "blog post"} with ${model.label}`
          }
          disabled={writing || !notes.trim() || !desk.aiKeyInfo}
          onPress={() => (hasText ? setConfirming(true) : write())}
        />
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
