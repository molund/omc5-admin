// The review before a change is saved to the desk: the exact lines it adds or changes, the card it leaves, and its commit
// message.
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk } from "../state/desk.js";
import { cardFor } from "../lib/card.js";
import { CardPreview } from "./CardPreview.js";
import { Body, Button, Field, Label, Notice, Panel } from "./ui.js";

export function Hunks({ hunks }) {
  const { tw } = useTw();
  const line = (t, kind, k) => (
    <Text
      key={k}
      style={[
        tw`font-mono text-xs leading-5 px-2.5`,
        kind === "+" ? tw`bg-add text-add-ink` : kind === "-" ? tw`bg-del text-del-ink` : tw`text-mute`,
        { whiteSpace: "pre" },
      ]}
    >
      {t === "" ? " " : t}
    </Text>
  );
  return (
    <ScrollView horizontal style={tw`rounded-md border border-line bg-code`} contentContainerStyle={tw`py-2`}>
      <View style={{ minWidth: "100%" }}>
        {hunks.map((h, i) => (
          <View key={i} style={i > 0 && tw`mt-2`}>
            {h.before != null && line(h.before, " ", "b")}
            {h.removed.map((t, j) => line(t, "-", `r${j}`))}
            {h.added.map((t, j) => line(t, "+", `a${j}`))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

/**
 * @param {object} props
 * @param {object} props.change The draft change.
 * @param {() => void} props.onBack
 * @param {(message: string) => void} props.onSave
 * @param {string} [props.cardLabel]
 */
export function ReviewSheet({ change, onBack, onSave, cardLabel }) {
  const { tw } = useTw();
  const desk = useDesk();
  const preview = desk.preview(change);
  const [message, setMessage] = useState(() => desk.suggestMessage(change));
  return (
    <View style={tw`gap-3.5`}>
      <Panel>
        <Label>Commit message</Label>
        <Field value={message} onChangeText={setMessage} label="Commit message" noPrompt />
        <Body small mute>
          One change, one commit. It goes to main when you push.
        </Body>
      </Panel>
      {preview.error ? (
        <Notice tone="problem">{preview.error}</Notice>
      ) : (
        <View style={tw`gap-1.5`}>
          {preview.hunks.length > 0 && (
            <>
              <Label>Changes to status.yaml</Label>
              <Hunks hunks={preview.hunks} />
            </>
          )}
          {preview.deskHunks?.length > 0 && (
            <>
              <Label>Changes to desk.yaml</Label>
              <Hunks hunks={preview.deskHunks} />
            </>
          )}
        </View>
      )}
      {!preview.error && <CardPreview card={cardFor(preview.text)} label={cardLabel} />}
      <View style={tw`flex-row gap-2`}>
        <Button title="Back" onPress={onBack} style={tw`flex-1`} />
        <Button
          kind="green"
          title="Save to the desk"
          disabled={!!preview.error || !message.trim()}
          onPress={() => onSave(message.trim())}
          style={tw`flex-1`}
        />
      </View>
    </View>
  );
}
