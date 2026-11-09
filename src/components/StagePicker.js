// The step of the gantry's cycle a change reports, for gantry-cycles.yaml and the velocity: always one. The rules (lib/stages.js)
// suggest the furthest step the text reports; Mike drags or taps a slider between the steps; in the Claude app, "Ask Claude"
// reads the text when the rules find nothing. Every position, update and addendum reports a step, with no way to leave it
// out: the one already posted for the span (or, editing an entry with none, the one before it), unless the rules or he move
// it on, so it does no harm. It can't go earlier than the furthest step already posted for the span, or than hung once the
// span is hung.
import { useEffect, useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import { useTw } from "../theme/tw.js";
import { STAGES, STAGE_LABELS, atLeast, furthest, stagesIn } from "../lib/stages.js";
import { askClaude, canAskClaude } from "../services/stageAI.js";
import { NoteToSelf } from "./NoteToSelf.js";
import { Body, Button, Label, Panel, Row } from "./ui.js";

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
 * The stage a change carries: Mike's pick, else the furthest step the rules find in `text`, else `fallback`, never earlier
 * than the floor (the first stage, hung once the span is hung, or the furthest step already posted for the span), so the
 * floor itself when there is none of those.
 * @param {string|undefined} value Mike's pick (or Claude's answer), if he has picked.
 * @param {string} floor From stageFloor.
 * @param {string} text What's written.
 * @param {string} [fallback] The step to start from when there's no pick and the rules find none.
 * @returns {string}
 */
export const stageToPost = (value, floor, text, fallback) =>
  atLeast(value ?? furthest(stagesIn(text)) ?? fallback, floor);

/**
 * @param {object} props
 * @param {string} props.text What's written (the summary and paragraphs, or the note to self).
 * @param {string|undefined} props.value Mike's pick; undefined until he picks, when the rules' suggestion is used.
 * @param {(stage: string|undefined) => void} props.onChange
 * @param {string} [props.floor] The earliest stage allowed (floorStage), hung once the span is hung.
 * @param {number|null} [props.span] The span it's for.
 * @param {string} [props.notes] The entry's notes, shown at the bottom of the box when `onNotes` is given.
 * @param {(text: string) => void} [props.onNotes]
 * @param {string} [props.notesWhere] A line under the notes saying whose they are.
 * @param {string} [props.fallback] The step to start from when nothing is picked and the rules find none.
 */
export function StagePicker({ text, value, onChange, floor = STAGES[0], span, notes, onNotes, notesWhere, fallback }) {
  const { tw } = useTw();
  const found = stagesIn(text);
  const suggested = furthest(found);
  const stage = stageToPost(value, floor, text, fallback);
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
      {problem && (
        <Body small mute>
          {problem}
        </Body>
      )}
      {(claude || (suggested && stage !== atLeast(suggested, floor))) && (
        <Row style={tw`justify-end`}>
          {suggested && stage !== atLeast(suggested, floor) && (
            <Button small kind="link" title="Use what's found" onPress={() => onChange(atLeast(suggested, floor))} />
          )}
          {claude && !!text?.trim() && (
            <Button small title={asking ? "Asking Claude…" : "Ask Claude"} disabled={asking} onPress={ask} />
          )}
        </Row>
      )}
      {onNotes && <NoteToSelf inBox value={notes ?? ""} onChange={onNotes} where={notesWhere} />}
    </Panel>
  );
}
