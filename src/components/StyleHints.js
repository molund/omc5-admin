// The writing-style checks, under the editor. They never stop a save.
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { styleHints } from "../lib/styleHints.js";
import { Label, Notice } from "./ui.js";

export function StyleHints({ texts }) {
  const { tw } = useTw();
  const hints = styleHints(texts);
  if (!hints.length) return null;
  return (
    <View style={tw`gap-1.5`}>
      <Label>Style</Label>
      {hints.map((h) => (
        <Notice key={h}>{h}</Notice>
      ))}
    </View>
  );
}
