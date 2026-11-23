// Comments: whether an update's or blog post's Trackside comments are on, off (no Comments button) or read-only (the button
// opens them as they were at the last deploy, with no way to add one). The site reads it from the note's `comments:` line in
// status.yaml. A new one is on or off; read-only is only offered when editing, for locking down an old thread.
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { Label, Segmented } from "./ui.js";

/**
 * @param {object} props
 * @param {"on"|"off"|"readonly"} props.value
 * @param {(value: "on"|"off"|"readonly") => void} props.onChange
 * @param {boolean} [props.editing] Editing a saved one: read-only is a choice too.
 */
export function CommentsSwitch({ value, onChange, editing }) {
  const { tw } = useTw();
  const options = [
    { value: "on", label: "On" },
    { value: "off", label: "Off" },
    ...(editing ? [{ value: "readonly", label: "Read-only" }] : []),
  ];
  return (
    <View style={tw`gap-1.5`}>
      <Label>Comments</Label>
      <Segmented options={options} value={value} onChange={onChange} small />
    </View>
  );
}
