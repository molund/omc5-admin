// Card text: the progress card's text on its own, changed or taken away without posting anything. It starts from what the
// card has now (an update's or addendum's summary, or a position's own words); the update it came from keeps its Comments
// button. Nothing else changes, not even the card's time stamp.
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk, useDraft } from "../state/desk.js";
import { headerOf } from "../lib/statusFile.js";
import { cardFor } from "../lib/card.js";
import { todayKey } from "../lib/time.js";
import { CardTextField } from "../components/CardTextField.js";
import { CardPreview } from "../components/CardPreview.js";
import { Button } from "../components/ui.js";

/**
 * @param {object} props
 * @param {(change: object, opts: object) => void} props.onReview
 * @param {string|null} [props.draftKey] null for a waiting change reopened, which starts from its seed.
 * @param {{ text: string, until: string }} [props.seed]
 */
export function CardTextScreen({ onReview, draftKey = "cardtext", seed }) {
  const { tw } = useTw();
  const desk = useDesk();
  const head = headerOf(desk.parsed);
  const today = todayKey();
  const [d, update, reset] = useDraft(
    draftKey,
    () => seed ?? { text: head.cardText, until: head.cardTextUntil ?? today },
  );
  // it can't end before today: it wouldn't show at all
  const until = d.until > today ? d.until : today;
  const change = { kind: "card-text", text: d.text, until };
  const preview = desk.preview(change);
  return (
    <View style={tw`gap-3`}>
      <CardTextField
        value={d.text}
        until={until}
        floor={today}
        onChange={(text) => update({ text })}
        onUntil={(day) => update({ until: day })}
      />
      <CardPreview card={cardFor(preview.text, preview.deskText)} />
      <Button kind="green" title="Review the card text" onPress={() => onReview(change, { after: reset })} />
    </View>
  );
}
