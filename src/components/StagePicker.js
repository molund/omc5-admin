// The step of the gantry's cycle a change reports, for gantry-cycles.yaml and the velocity: always one. The rules (lib/stages.js)
// suggest the furthest step the text reports; Mike drags or taps a slider between the steps; in the Claude app, "Ask Claude"
// reads the text when the rules find nothing. Every position, update and addendum reports a step, with no way to leave it
// out: the one already posted for the span (or, editing an entry with none, the one before it), unless the rules or he move
// it on, so it does no harm. It can't go earlier than the furthest step already posted for the span, or than hung once the
// span is hung. Under the step's slider, a second one records how far through the step it was (0 to 99 per cent), once its box
// is ticked: a plain record that never goes below the last move's on the same step.
import { useEffect, useRef, useState } from "react";
import { PanResponder, View } from "react-native";
import { useTw } from "../theme/tw.js";
import { isDoubleGirder } from "../lib/doubleGirder.js";
import {
  STAGES,
  STAGE_LABELS,
  atLeast,
  furthest,
  stagesIn,
  stageToPost,
  isNotObserved,
  observable,
} from "../lib/stages.js";

export { stageToPost };

/**
 * The completion to post for the step: the one picked, never below the last move's on the same step, and none on a double
 * girder span (only its arrival is logged), for one of the pauses (canRecordProgress) or when it's off (null).
 * @param {number|null|undefined} value The completion picked, null or undefined when its box isn't ticked.
 * @returns {number|null}
 */
export const progressToPost = (value, entries, span, stage, time) =>
  value == null || isDoubleGirder(span) || !canRecordProgress(stage)
    ? null
    : Math.max(value, progressBefore(entries, span, stage, time));
import { progressBefore } from "../lib/deskFile.js";
import { canRecordProgress } from "../lib/velocity.js";
import { askClaude, canAskClaude } from "../services/stageAI.js";
import { NoteToSelf } from "./NoteToSelf.js";
import { Body, Button, Checkbox, Label, Panel, Row } from "./ui.js";

const THUMB = 26;

/**
 * A track with a stop per position and a thumb to drag or tap along it. Position 0 is the left end; none before `min`. With
 * `stops` off the track has no stop marks (for one with a position for every per cent).
 */
function StepSlider({ position, count, min = 0, label, valueText, onChange, disabled, off = [], stops = true }) {
  const { tw } = useTw();
  const width = useRef(0);
  const startX = useRef(0);
  const latest = useRef();
  latest.current = { position, count, min, onChange, disabled, off };
  const go = (next) => {
    const { position, count, min, onChange, disabled, off } = latest.current;
    if (disabled) return;
    let clamped = Math.min(count - 1, Math.max(min, next));
    // a step that can't be picked is stepped over, in the direction of the move
    const dir = next >= position ? 1 : -1;
    while (off.includes(clamped) && clamped + dir >= min && clamped + dir <= count - 1) clamped += dir;
    if (off.includes(clamped)) return;
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
        {Array.from({ length: stops ? count : 0 }, (_, i) => (
          <View
            key={i}
            style={[
              tw`absolute h-2 w-2 rounded-full ${i <= position ? "bg-accent" : "bg-line"}`,
              { left: `${(i / (count - 1)) * 100}%`, marginLeft: -4, opacity: i < min || off.includes(i) ? 0.3 : 1 },
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
 * @param {number|null} [props.progress] How far through the step, 0 to 99, or null when it isn't recorded. The second slider
 *   is shown when `onProgress` is given.
 * @param {(progress: number|null) => void} [props.onProgress]
 * @param {object[]} [props.entries] gantry-cycles.yaml's entries, for the last move's value, the slider's minimum.
 * @param {string} [props.time] The time stamp it's for: only the moves before it count as the last move.
 * @param {number|null} [props.progressSpan] The span whose moves count as the last move, when it isn't `span`.
 */
export function StagePicker({
  text,
  value,
  onChange,
  floor = STAGES[0],
  span,
  notes,
  onNotes,
  notesWhere,
  fallback,
  progress,
  onProgress,
  entries,
  time,
  progressSpan = span,
}) {
  const { tw } = useTw();
  const found = stagesIn(text);
  const suggested = furthest(found);
  const girder = isDoubleGirder(span);
  const stage = stageToPost(value, floor, text, fallback, span);
  const index = STAGES.indexOf(stage);
  const min = STAGES.indexOf(floor);
  const [claude, setClaude] = useState(false);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState(null);
  useEffect(() => {
    canAskClaude().then(setClaude);
  }, []);

  const name = STAGE_LABELS[stage];
  // the last move's completion on this step: the new one can't be below it
  const lastMove = entries && time ? progressBefore(entries, progressSpan, stage, time) : 0;
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
        disabled={girder}
        off={STAGES.flatMap((st, i) => (isNotObserved(span, st) ? [i] : []))}
        onChange={(p) => {
          // a completion is of the step it was recorded for
          if (progress != null) onProgress?.(null);
          onChange(STAGES[p]);
        }}
      />
      {onProgress && !girder && canRecordProgress(stage) && (
        <View>
          <Checkbox
            label="Record stage completion"
            value={progress != null}
            onChange={(on) => onProgress(on ? lastMove : null)}
          />
          <Body small mute>
            Not used in the velocity calculation yet.
          </Body>
          {progress != null && (
            <>
              <StepSlider
                label="Stage completion"
                valueText={`${progress}%`}
                position={Math.max(progress, lastMove)}
                count={100}
                min={lastMove}
                stops={false}
                onChange={onProgress}
              />
              <Row style={tw`justify-between`}>
                <Body small mute>
                  {lastMove ? `${lastMove}% (last move)` : "0%"}
                </Body>
                <Body small style={tw`font-bold`}>
                  {`${Math.max(progress, lastMove)}%`}
                </Body>
                <Body small mute>
                  99%
                </Body>
              </Row>
            </>
          )}
        </View>
      )}
      {girder && (
        <Body small mute>
          Double girder span: only the arrival is logged.
        </Body>
      )}
      {STAGES.some((st) => isNotObserved(span, st)) && !girder && (
        <Body small mute>
          {`Span ${span} has no ${STAGES.filter((st) => isNotObserved(span, st))
            .map((st) => STAGE_LABELS[st].toLowerCase())
            .join(", ")} step: its in-place casting and form work are prerequisites to cables down.`}
        </Body>
      )}
      {problem && (
        <Body small mute>
          {problem}
        </Body>
      )}
      {!girder && (claude || (suggested && stage !== observable(span, atLeast(suggested, floor)))) && (
        <Row style={tw`justify-end`}>
          {suggested && stage !== observable(span, atLeast(suggested, floor)) && (
            <Button
              small
              kind="link"
              title="Use what's found"
              onPress={() => onChange(observable(span, atLeast(suggested, floor)))}
            />
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
