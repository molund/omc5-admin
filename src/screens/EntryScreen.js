// One saved entry, open to change or delete, on its own page over Entries or Home. Each entry keeps its own draft, so
// going back and opening it again finds the edits still there; saving anything clears them, as it clears every form.
import { useDesk, useDraft } from "../state/desk.js";
import { EntryEditor, seedFor } from "../components/EntryEditor.js";

/**
 * @param {object} props
 * @param {{ type: string, key: string, noteKey?: string }} props.target
 * @param {(change: object, opts: object) => void} props.onReview
 * @param {(page: string, seed: object) => void} [props.onSwitch] Turns a position into an update or an addendum.
 */
export function EntryScreen({ target, onReview, onSwitch }) {
  const desk = useDesk();
  const [d, update] = useDraft(`edit.${target.key}`, () => ({ target, ...seedFor(desk, target) }));
  // saving goes back by itself (App.js), so there's nothing more to do when the editor closes
  return (
    <EntryEditor
      target={target}
      draft={d}
      update={update}
      onClose={() => {}}
      onReview={onReview}
      onSwitch={onSwitch}
      noBack
    />
  );
}
