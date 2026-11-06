// The current step of the gantry's cycle a change reports, for desk.yaml and the velocity. The rules (lib/stages.js) suggest
// the furthest step the text reports; Mike drags or taps a slider between the steps (or to none); in the Claude app, "Ask
// Claude" reads the text when the rules find nothing. The steps a move logs by itself (arrived, hung) are named below it.
import { useEffect, useRef, useState } from "react";
import { PanResponder, Text, View } from "react-native";
import { useTw } from "../theme/tw.js";
import { STAGES, STAGE_LABELS, stagesIn } from "../lib/stages.js";
import { askClaude, canAskClaude } from "../services/stageAI.js";
import { Body, Button, Label, Panel, Row } from "./ui.js";

const THUMB = 26;

/** A track with a stop per position and a thumb to drag or tap along it. Position 0 is the left end. */
function StepSlider({ position, count, label, valueText, onChange }) {
  const { tw } = useTw();
  const width = useRef(0);
  const startX = useRef(0);
  const latest = useRef();
  latest.current = { position, count, onChange };
  const go = (next) => {
    const { position, count, onChange } = latest.current;
    const clamped = Math.min(count - 1, Math.max(0, next));
    if (clamped !== position) onChange(clamped);
  };
  const goToX = (x) => {
    const track = width.current - THUMB;
    if (track > 0) go(Math.round(((x - THUMB / 2) / track) * (latest.current.count - 1)));
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false, // a drag stays on the slider, rather than scrolling the page
      onPanResponderGrant: (e) => {
        startX.current = e.nativeEvent.locationX;
        goToX(startX.current);
      },
      onPanResponderMove: (_, g) => goToX(startX.current + g.dx),
    }),
  ).current;
  const percent = (position / (count - 1)) * 100;
  return (
    <View
      {...pan.panHandlers}
      pointerEvents="box-only" // so the touch's position is always measured from the slider, not a stop or the thumb
      onLayout={(e) => (width.current = e.nativeEvent.layout.width)}
      focusable
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: count - 1, now: position, text: valueText }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => go(position + (e.nativeEvent.actionName === "increment" ? 1 : -1))}
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        go(position + (e.key === "ArrowRight" ? 1 : -1));
      }}
      style={[tw`h-11 justify-center`, { paddingHorizontal: THUMB / 2, touchAction: "none", userSelect: "none" }]}
    >
      <View style={tw`h-1 justify-center rounded-full bg-line`}>
        <View style={[tw`absolute h-1 rounded-full bg-accent`, { left: 0, width: `${percent}%` }]} />
        {Array.from({ length: count }, (_, i) => (
          <View
            key={i}
            style={[
              tw`absolute h-2 w-2 rounded-full ${i <= position ? "bg-accent" : "bg-line"}`,
              { left: `${(i / (count - 1)) * 100}%`, marginLeft: -4 },
            ]}
          />
        ))}
        <View
          style={[
            tw`absolute rounded-full border-2 border-panel bg-accent`,
            { left: `${percent}%`, marginLeft: -THUMB / 2, width: THUMB, height: THUMB },
          ]}
        />
      </View>
    </View>
  );
}

/** The stages a change will carry: one at most, the furthest of Mike's pick, Claude's answer or what the rules found. */
export const chosenStages = (value, text) => {
  const stages = value ?? stagesIn(text);
  return STAGES.filter((s) => stages.includes(s)).slice(-1);
};

/**
 * @param {object} props
 * @param {string} props.text What's written (the summary and paragraphs, or the note to self).
 * @param {string[]|undefined} props.value Mike's pick; undefined until he picks, when the rules' suggestion is used.
 * @param {(stages: string[]) => void} props.onChange
 * @param {string[]} [props.auto] Steps the change logs by itself (a move's arrived, hung).
 * @param {number|null} [props.span] The span they're for.
 * @param {string[]} [props.kept] Editing a saved entry: the arrived or hung it already has, each with a Remove button.
 * @param {(stages: string[]) => void} [props.onKept]
 */
export function StagePicker({ text, value, onChange, auto = [], span, kept = [], onKept }) {
  const { tw } = useTw();
  const found = stagesIn(text);
  const chosen = chosenStages(value, text);
  const index = STAGES.indexOf(chosen[0]); // -1: no step
  const [claude, setClaude] = useState(false);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState(null);
  useEffect(() => {
    canAskClaude().then(setClaude);
  }, []);

  const name = index < 0 ? "No step" : STAGE_LABELS[STAGES[index]];
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
      <Label>{`Gantry step${span ? ` · span ${span}` : ""}`}</Label>
      <Row>
        <Body style={tw`font-bold`}>{name}</Body>
        {index >= 0 && (
          <Body small mute>
            {`${index + 1} of ${STAGES.length}`}
          </Body>
        )}
      </Row>
      <StepSlider
        label="Gantry step"
        valueText={name}
        position={index + 1}
        count={STAGES.length + 1}
        onChange={(p) => onChange(p === 0 ? [] : [STAGES[p - 1]])}
      />
      <Row>
        <Text style={tw`text-xs text-mute`}>No step</Text>
        <Text style={tw`text-xs text-mute`}>{STAGE_LABELS[STAGES[STAGES.length - 1]]}</Text>
      </Row>
      <Body small mute>
        {auto.length ? `${auto.map((s) => STAGE_LABELS[s]).join(" and ")}: logged by the move itself. ` : ""}
        {value === undefined
          ? found.length
            ? "Suggested from what you wrote. Move it to change."
            : "Nothing found in what you wrote. Move it to the step it reports."
          : "Your pick."}{" "}
        It goes in desk.yaml, for the velocity.
      </Body>
      {kept.map((s) => (
        <Row key={s}>
          <Body small>{`Also logged: ${STAGE_LABELS[s]}`}</Body>
          <Button small kind="link" title="Remove" onPress={() => onKept(kept.filter((x) => x !== s))} />
        </Row>
      ))}
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
