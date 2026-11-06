// The step of the gantry's cycle a change reports, for desk.yaml and the velocity: always one. The rules (lib/stages.js)
// suggest the furthest step the text reports; Mike drags or taps a slider between the steps; in the Claude app, "Ask Claude"
// reads the text when the rules find nothing. The slider is off until he switches it on, so an entry doesn't report a step by
// accident. It can't go earlier than the furthest step already posted for the span, or than hung once the span is hung.
import { useEffect, useRef, useState } from "react";
import { PanResponder, Text, View } from "react-native";
import { useTw } from "../theme/tw.js";
import { STAGES, STAGE_LABELS, atLeast, furthest, stagesIn } from "../lib/stages.js";
import { askClaude, canAskClaude } from "../services/stageAI.js";
import { Body, Button, Label, Panel, Row, Toggle } from "./ui.js";

const THUMB = 26;

/** A track with a stop per position and a thumb to drag or tap along it. Position 0 is the left end; none before `min`. */
function StepSlider({ position, count, min = 0, label, valueText, onChange, disabled }) {
  const { tw } = useTw();
  const width = useRef(0);
  const startX = useRef(0);
  const latest = useRef();
  latest.current = { position, count, min, onChange, disabled };
  const go = (next) => {
    const { position, count, min, onChange, disabled } = latest.current;
    if (disabled) return;
    const clamped = Math.min(count - 1, Math.max(min, next));
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
      accessibilityState={{ disabled: !!disabled }}
      accessibilityLabel={label}
      accessibilityValue={{ min, max: count - 1, now: position, text: valueText }}
      accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
      onAccessibilityAction={(e) => go(position + (e.nativeEvent.actionName === "increment" ? 1 : -1))}
      onKeyDown={(e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        e.preventDefault();
        go(position + (e.key === "ArrowRight" ? 1 : -1));
      }}
      style={[
        tw`h-11 justify-center`,
        { paddingHorizontal: THUMB / 2, touchAction: "none", userSelect: "none", opacity: disabled ? 0.4 : 1 },
      ]}
    >
      <View style={tw`h-1 justify-center rounded-full bg-line`}>
        <View style={[tw`absolute h-1 rounded-full bg-accent`, { left: 0, width: `${percent}%` }]} />
        {Array.from({ length: count }, (_, i) => (
          <View
            key={i}
            style={[
              tw`absolute h-2 w-2 rounded-full ${i <= position ? "bg-accent" : "bg-line"}`,
              { left: `${(i / (count - 1)) * 100}%`, marginLeft: -4, opacity: i < min ? 0.3 : 1 },
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

/**
 * The stage a change will carry: Mike's pick, never earlier than the floor (the first stage, hung once the span is hung, or
 * the furthest step already posted for the span). None until he switches the picker on.
 * @param {string|undefined} value Mike's pick (or Claude's answer), if he has picked.
 * @param {string} [floor] From floorStage.
 * @returns {string|undefined}
 */
export const chosenStage = (value, floor = STAGES[0]) => (value ? atLeast(value, floor) : undefined);

/**
 * @param {object} props
 * @param {string} props.text What's written (the summary and paragraphs, or the note to self).
 * @param {string|undefined} props.value Mike's pick; undefined until he picks, when the rules' suggestion is used.
 * @param {(stage: string|undefined) => void} props.onChange
 * @param {string} [props.floor] The earliest stage allowed (floorStage), hung once the span is hung.
 * @param {number|null} [props.span] The span it's for.
 */
export function StagePicker({ text, value, onChange, floor = STAGES[0], span }) {
  const { tw } = useTw();
  const found = stagesIn(text);
  const on = value !== undefined;
  const suggested = furthest(found);
  const stage = chosenStage(value, floor) ?? atLeast(suggested, floor);
  const index = STAGES.indexOf(stage);
  const min = STAGES.indexOf(floor);
  const [claude, setClaude] = useState(false);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState(null);
  useEffect(() => {
    canAskClaude().then(setClaude);
  }, []);

  const name = STAGE_LABELS[stage];
  async function ask() {
    setAsking(true);
    setProblem(null);
    try {
      const answer = furthest(await askClaude(text));
      if (answer) onChange(answer);
      else setProblem("Claude found no step in it. Pick by hand.");
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
      <Toggle label="Report a step" value={on} onChange={(next) => onChange(next ? stage : undefined)} />
      <Row>
        <Body style={tw`font-bold`}>{name}</Body>
        <Body small mute>
          {`${index + 1} of ${STAGES.length}`}
        </Body>
      </Row>
      <StepSlider
        label="Gantry step"
        valueText={name}
        position={index}
        count={STAGES.length}
        min={min}
        disabled={!on}
        onChange={(p) => onChange(STAGES[p])}
      />
      <Row>
        <Text style={tw`text-xs text-mute`}>{STAGE_LABELS[STAGES[0]]}</Text>
        <Text style={tw`text-xs text-mute`}>{STAGE_LABELS[STAGES[STAGES.length - 1]]}</Text>
      </Row>
      {problem && (
        <Body small mute>
          {problem}
        </Body>
      )}
      {(claude || (on && suggested && value !== suggested)) && (
        <Row style={tw`justify-end`}>
          {on && suggested && value !== suggested && (
            <Button small kind="link" title="Use what's found" onPress={() => onChange(atLeast(suggested, floor))} />
          )}
          {claude && !!text?.trim() && (
            <Button small title={asking ? "Asking Claude…" : "Ask Claude"} disabled={asking} onPress={ask} />
          )}
        </Row>
      )}
    </Panel>
  );
}
