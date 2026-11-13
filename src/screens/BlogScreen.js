// Blog: a dated piece for Trackside, saved as a note with `post: true`. No gantry controls; the card stays as it is.
import { View } from "react-native";
import { useState } from "react";
import { useTw } from "../theme/tw.js";
import { useDesk, useDraft } from "../state/desk.js";
import { cardFor } from "../lib/card.js";
import { shortDate, todayKey } from "../lib/time.js";
import { TimeStampField } from "../components/TimeStampField.js";
import { TitleField, titleProblems } from "../components/TitleField.js";
import { BlockEditor, blockProblems, blockTexts, emptyBlocks } from "../components/BlockEditor.js";
import { StyleHints } from "../components/StyleHints.js";
import { CardPreview } from "../components/CardPreview.js";
import { NoteToSelf, whereIs } from "../components/NoteToSelf.js";
import { Button, Notice } from "../components/ui.js";
import { allPhotos, emptyWalk, FilledNotice, unusedPhotos, WalkNotes, WalkSwitch } from "../components/WalkNotes.js";

export function BlogScreen({ onReview, draftKey = "blog", seed }) {
  const { tw } = useTw();
  const desk = useDesk();
  const notes = desk.parsed.notes;
  const [d, update, reset] = useDraft(
    draftKey,
    () => seed ?? { date: todayKey(), title: "", blocks: emptyBlocks(), memo: "" },
  );
  const taken = notes.some((n) => n.key === d.date);
  const problems = [
    ...titleProblems("blog", d.date, d.title),
    ...blockProblems(d.blocks),
    ...(taken ? [`There's already a blog post dated ${shortDate(d.date)}. Pick another day.`] : []),
  ];
  const change = {
    kind: "blog",
    date: d.date,
    title: d.title.trim(),
    blocks: d.blocks,
    memo: { noteKey: d.date, text: d.memo ?? "" },
  };
  const preview = desk.preview(change);
  // Walk notes (WalkNotes.js): the other way to write it, filling in the title and blocks from the AI's reply
  // Write with AI is where a new one starts; filling in, or the switch, moves it to Write it myself
  const mode = d.mode ?? "walk";
  const walk = d.walk ?? emptyWalk();
  const [filled, setFilled] = useState(null); // the reply's problems, after filling in
  const fill = ({ title, blocks, problems: issues }) => {
    desk.dropPhotos(unusedPhotos(d.blocks, blocks, walk.blocks));
    update({ blocks, ...(title && { title }), mode: "write" });
    setFilled(title ? issues : ["The reply has no TITLE line, so the title is as it was.", ...issues]);
  };
  return (
    <View style={tw`gap-3`}>
      <TimeStampField label="Date" value={d.date} onChange={(date) => update({ date })} />
      <WalkSwitch
        value={mode}
        onChange={(m) => {
          setFilled(null);
          update({ mode: m });
        }}
      />
      {mode === "walk" ? (
        <WalkNotes
          kind="blog"
          value={walk}
          onChange={(w) => update({ walk: w })}
          day={d.date}
          hasText={!!d.title.trim() || d.blocks.length > 1 || !!d.blocks[0].text.trim()}
          onFill={fill}
        />
      ) : (
        <>
          {filled && <FilledNotice problems={filled} />}
          <TitleField
            kind="blog"
            stamp={d.date}
            title={d.title}
            onChange={(title) => update({ title })}
            notes={notes}
          />
          <BlockEditor
            blocks={d.blocks}
            onChange={(blocks) => update({ blocks })}
            day={d.date}
            nameHint={d.title}
            title={d.title}
          />
        </>
      )}
      <NoteToSelf value={d.memo ?? ""} onChange={(memo) => update({ memo })} />
      {mode !== "walk" && <StyleHints texts={[d.title, ...blockTexts(d.blocks)]} />}
      <CardPreview card={cardFor(preview.text, preview.deskText)} label="The card stays as it is" />
      {problems.map((p) => (
        <Notice key={p} tone="problem">
          {p}
        </Notice>
      ))}
      <View style={tw`flex-row gap-2`}>
        <Button
          title="Clear"
          onPress={() => {
            desk.dropPhotos(allPhotos(d.blocks, d.walk));
            reset();
          }}
        />
        <Button
          kind="green"
          title="Review the blog post"
          disabled={problems.length > 0}
          style={tw`flex-1`}
          onPress={() => onReview(change, { after: reset, cardLabel: "The card stays as it is" })}
        />
      </View>
    </View>
  );
}
