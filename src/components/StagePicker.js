// The current step of the gantry's cycle a change reports, for desk.yaml and the velocity. The rules (lib/stages.js) suggest
// the furthest step the text reports; Mike moves a control between the steps (or to none); in the Claude app, "Ask Claude"
// reads the text when the rules find nothing. The steps a move logs by itself (arrived, hung) are shown, fixed.
import { useEffect, useState } from "react";
import { useTw } from "../theme/tw.js";
import { STAGES, STAGE_LABELS, stagesIn } from "../lib/stages.js";
import { askClaude, canAskClaude } from "../services/stageAI.js";
import { Body, Button, Label, Panel, Row, Stepper } from "./ui.js";

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
  const index = STAGES.indexOf(chosen[0]); // -1: no step
  const [claude, setClaude] = useState(false);
  const [asking, setAsking] = useState(false);
  const [problem, setProblem] = useState(null);
  useEffect(() => {
    canAskClaude().then(setClaude);
  }, []);

  const move = (d) => {
    const i = Math.min(STAGES.length - 1, Math.max(-1, index + d));
    onChange(i < 0 ? [] : [STAGES[i]]);
  };
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
        <Body>{index < 0 ? "No step" : STAGE_LABELS[STAGES[index]]}</Body>
        <Stepper
          label="Gantry step"
          value={index < 0 ? "None" : `${index + 1} of ${STAGES.length}`}
          onMinus={() => move(-1)}
          onPlus={() => move(1)}
          wide
        />
      </Row>
      <Body small mute>
        {auto.length ? `${auto.map((s) => STAGE_LABELS[s]).join(" and ")}: logged by the move itself. ` : ""}
        {value === undefined
          ? found.length
            ? "Suggested from what you wrote. Move it to change."
            : "Nothing found in what you wrote. Move it to the step it reports."
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
