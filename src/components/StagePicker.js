// The steps of the gantry's cycle a change reports, for desk.yaml and the velocity. The rules (lib/stages.js) suggest them
// from what's written; Mike picks or unpicks any of them; in the Claude app, "Ask Claude" reads the text when the rules find
// nothing. The steps a move logs by itself (arrived, hung) are shown, fixed.
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useTw } from "../theme/tw.js";
import { STAGES, STAGE_LABELS, stagesIn } from "../lib/stages.js";
import { askClaude, canAskClaude } from "../services/stageAI.js";
import { Body, Button, Label, Panel, Row } from "./ui.js";

function Chip({ label, on, fixed, onPress }) {
  const { tw } = useTw();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on, disabled: fixed }}
      accessibilityLabel={label}
      disabled={fixed}
      onPress={onPress}
      style={({ hovered }) => [
        tw`rounded-full border px-2.5 py-1`,
        on ? tw`border-accent bg-accent` : tw`border-button-line bg-button-bg`,
        fixed && tw`opacity-70`,
        hovered && !fixed && tw`opacity-80`,
      ]}
    >
      <Text style={[tw`text-xs font-semibold`, on ? tw`text-accent-ink` : tw`text-button-ink`]}>{label}</Text>
    </Pressable>
  );
}

/** The stages a change will carry: Mike's pick, or the furthest step the rules found in the text. */
export const chosenStages = (value, text) => value ?? stagesIn(text).slice(-1);

/**
 * @param {object} props
 * @param {string} props.text What's written (the summary and paragraphs, or the note to self).
 * @param {string[]|undefined} props.value Mike's pick; undefined until he picks, when the rules' suggestion is used.
 * @param {(stages: string[]) => void} props.onChange
 * @param {string[]} [props.auto] Steps the change logs by itself (a move's arrived, hung).
 * @param {number|null} [props.span] The span they're for.
 */
export function StagePicker({ text, value, onChange, auto = [], span }) {
  const { tw } = useTw();
  const found = stagesIn(text);
  const chosen = chosenStages(value, text);
  const [claude, setClaude] = useState(false);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState(null);
  useEffect(() => {
    canAskClaude().then(setClaude);
  }, []);

  const pick = (s) => onChange(chosen.includes(s) ? [] : [s]);
  async function ask() {
    setAsking(true);
    setProblem(null);
    try {
      onChange(await askClaude(text));
    } catch (e) {
      setProblem(
        e?.code === "not_granted" ? "Claude wasn't allowed to read it." : "Claude didn't answer. Pick by hand.",
      );
    } finally {
      setAsking(false);
    }
  }

  return (
    <Panel>
      <Label>{`Gantry steps${span ? ` · span ${span}` : ""}`}</Label>
      <View style={tw`flex-row flex-wrap gap-1.5`}>
        {STAGES.map((s) => (
          <Chip
            key={s}
            label={STAGE_LABELS[s]}
            on={auto.includes(s) || chosen.includes(s)}
            fixed={auto.includes(s)}
            onPress={() => pick(s)}
          />
        ))}
      </View>
      <Body small mute>
        {auto.length ? `${auto.map((s) => STAGE_LABELS[s]).join(" and ")}: logged by the move itself. ` : ""}
        {value === undefined
          ? found.length
            ? "Picked from what you wrote. Tap to change."
            : "Nothing found in what you wrote. Tap the step it reports."
          : "Your pick."}{" "}
        They go in desk.yaml, for the velocity.
      </Body>
      {problem && (
        <Body small mute>
          {problem}
        </Body>
      )}
      {(claude || value !== undefined) && (
        <Row style={tw`justify-end`}>
          {value !== undefined && (
            <Button small kind="link" title="Use what's found" onPress={() => onChange(undefined)} />
          )}
          {claude && !!text?.trim() && (
            <Button small title={asking ? "Asking Claude…" : "Ask Claude"} disabled={asking} onPress={ask} />
          )}
        </Row>
      )}
    </Panel>
  );
}
