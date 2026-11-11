// The review before a change is queued for push: the exact lines it adds or changes, the card it leaves, and its commit
// message.
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk } from "../state/desk.js";
import { cardFor } from "../lib/card.js";
import { shutdownsHit } from "../lib/deskChanges.js";
import { STAGE_LABELS } from "../lib/stages.js";
import { clock, stamp } from "../lib/time.js";
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
 * @param {string} [props.warning] What can't be undone once it's pushed.
 */
export function ReviewSheet({ change, onBack, onSave, cardLabel, warning }) {
  const { tw } = useTw();
  const desk = useDesk();
  const preview = desk.preview(change);
  const [message, setMessage] = useState(() => desk.suggestMessage(change));
  const nothing = !preview.error && !preview.hunks.length && !preview.deskHunks?.length;
  // steps in this change that fall in a shutdown are counted at its start: say so, with what to do about it
  const inShutdown = preview.error ? [] : shutdownsHit(desk.deskText ?? "", preview.deskText ?? "");
  return (
    <View style={tw`gap-3.5`}>
      {warning && <Notice tone="problem">{warning}</Notice>}
      {nothing && <Notice>This doesn't change anything, so there's nothing to save.</Notice>}
      {inShutdown.map(({ key, stage, shutdown }) => (
        <Notice key={`${key}-${stage}`}>
          {`${STAGE_LABELS[stage] ?? stage} at ${stamp(key)} falls in ${shutdown.label}, so it will be counted at ${clock(shutdown.start)}, when that began. ${
            shutdown.open
              ? "It's still open: if work has resumed, add hours: or end: to it in gantry-cycles.yaml first."
              : "If work had resumed by then, shorten the shutdown first."
          }`}
        </Notice>
      ))}
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
              <Label>Changes to gantry-cycles.yaml</Label>
              <Hunks hunks={preview.deskHunks} />
            </>
          )}
        </View>
      )}
      {!preview.error && <CardPreview card={cardFor(preview.text, preview.deskText)} label={cardLabel} />}
      <View style={tw`flex-row gap-2`}>
        <Button title="Back" onPress={onBack} style={tw`flex-1`} />
        <Button
          kind="green"
          title="Queue for push"
          disabled={!!preview.error || nothing || !message.trim()}
          onPress={() => onSave(message.trim())}
          style={tw`flex-1`}
        />
      </View>
    </View>
  );
}
