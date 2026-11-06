// Blog: a dated piece for Trackside, saved as a note with `post: true`. No gantry controls; the card stays as it is.
import { View } from "react-native";
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
    ...(taken ? [`There's already a note dated ${shortDate(d.date)}. Pick another day.`] : []),
  ];
  const change = {
    kind: "blog",
    date: d.date,
    title: d.title.trim(),
    blocks: d.blocks,
    memo: { noteKey: d.date, text: d.memo ?? "" },
  };
  const preview = desk.preview(change);
  return (
    <View style={tw`gap-3`}>
      <TimeStampField label="Date" value={d.date} onChange={(date) => update({ date })} />
      <TitleField kind="blog" stamp={d.date} title={d.title} onChange={(title) => update({ title })} notes={notes} />
      <BlockEditor blocks={d.blocks} onChange={(blocks) => update({ blocks })} day={d.date} nameHint={d.title} />
      <NoteToSelf value={d.memo ?? ""} onChange={(memo) => update({ memo })} />
      <StyleHints texts={[d.title, ...blockTexts(d.blocks)]} />
      <CardPreview card={cardFor(preview.text)} label="The card stays as it is" />
      {problems.map((p) => (
        <Notice key={p} tone="problem">
          {p}
        </Notice>
      ))}
      <View style={tw`flex-row gap-2`}>
        <Button
          title="Clear"
          onPress={() => {
            desk.dropPhotos(d.blocks.map((b) => b.photoId).filter(Boolean));
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
