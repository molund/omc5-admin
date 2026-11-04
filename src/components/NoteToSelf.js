// The note to self: one line of text per entry, kept in status.yaml as `note-to-self:`. It's only in the repo; the site never
// shows it. Follow-ups and blocks don't have one: a follow-up edits its parent's.
import { useTw } from "../theme/tw.js";
import { stamp } from "../lib/time.js";
import { Body, Field, Label, Panel } from "./ui.js";

/** "Saved with the Wed, Nov. 4, 2026 · 8:15 a.m. update." */
export const whereIs = (note) => `Saved with the ${stamp(note.key)} ${note.fields.post ? "blog post" : "update"}.`;

export function NoteToSelf({ value, onChange, where }) {
  const { tw } = useTw();
  return (
    <Panel>
      <Label>Note to self</Label>
      <Field
        multiline
        value={value}
        onChangeText={onChange}
        placeholder="Anything to remember about this one"
        label="Note to self"
        style={tw`min-h-14`}
      />
      <Body small mute>
        Only in the repo. Never shown on the site. {where}
      </Body>
    </Panel>
  );
}
