// Notes, once the note to self: one line of text per entry, kept in gantry-cycles.yaml (the Leash Log's own file), which the site never reads.
// Addendums and blocks don't have one: an addendum edits its parent's. It sits inside the Gantry step box (StagePicker.js)
// wherever there is one; a blog post has no step, so its notes are a box of their own. It has the zoom, but no AI prompt.
import { Text, View } from "react-native";
import { useTw } from "../theme/tw.js";
import { stamp } from "../lib/time.js";
import { Body, Field } from "./ui.js";

/** "Saved with the Wed, Nov. 4, 2026 · 8:15am update." */
export const whereIs = (note) => `Saved with the ${stamp(note.key)} ${note.fields.post ? "blog post" : "update"}.`;

/**
 * @param {object} props
 * @param {string} props.value
 * @param {(text: string) => void} props.onChange
 * @param {string} [props.where] A line under it saying whose it is.
 * @param {boolean} [props.inBox] It's inside another box (the Gantry step's): a title over it, not a box of its own.
 */
export function NoteToSelf({ value, onChange, where, inBox }) {
  const { tw } = useTw();
  const name = (
    <>
      Notes <Text style={tw`font-normal text-mute`}>(optional)</Text>
    </>
  );
  return (
    <View style={[tw`gap-1.5`, inBox && tw`border-t border-line pt-2.5`]}>
      <Field
        multiline
        {...(inBox ? { title: name } : { heading: name })}
        value={value}
        onChangeText={onChange}
        placeholder="Where it's at, e.g. 60% of the way through the lift"
        label="Notes"
        noAi
        style={tw`min-h-14`}
      />
      {!!where && (
        <Body small mute>
          {where}
        </Body>
      )}
    </View>
  );
}
