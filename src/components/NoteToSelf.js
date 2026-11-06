// The note to self: one line of text per entry, kept in desk.yaml (the desk's own file), which the site never reads.
// Follow-ups and blocks don't have one: a follow-up edits its parent's.
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { stamp } from "../lib/time.js";
import { Body, Field } from "./ui.js";

/** "Saved with the Wed, Nov. 4, 2026 · 8:15 a.m. update." */
export const whereIs = (note) => `Saved with the ${stamp(note.key)} ${note.fields.post ? "blog post" : "update"}.`;

export function NoteToSelf({ value, onChange, where }) {
  const { tw } = useTw();
  return (
    <View style={tw`gap-1.5`}>
      <Field
        multiline
        heading="Note to self"
        value={value}
        onChangeText={onChange}
        placeholder="Anything to remember about this one"
        label="Note to self"
        style={tw`min-h-14`}
      />
      <Body small mute>
        Kept in desk.yaml, which the site never reads. {where}
      </Body>
    </View>
  );
}
