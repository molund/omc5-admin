// The Clayton Clipper's span and whether all its segments are hung (`hung:` in status.yaml). Moving to a new span turns Hung
// off, as the deploy workflow does.
import { useTw } from "../theme/tw.js";
import { isDoubleGirder } from "../lib/doubleGirder.js";
import { Body, Notice, Panel, Row, Stepper, Toggle } from "./ui.js";

export const FIRST_SPAN = 3,
  LAST_SPAN = 104;

const describe = (g) => `Span ${g.span} · ${g.complete ? "hung" : "not hung"}`;

/**
 * @param {{ value: {span:number, complete:boolean}, current: {span:number, complete:boolean}, onChange: Function }} props
 */
export function GantryControls({ value, current, onChange }) {
  const { tw } = useTw();
  const step = (d) => {
    const span = Math.min(LAST_SPAN, Math.max(FIRST_SPAN, value.span + d));
    onChange({ span, complete: !isDoubleGirder(span) && span === current.span ? current.complete : false });
  };
  return (
    <Panel>
      <Row>
        <Body style={tw`font-bold`}>Clayton Clipper</Body>
        <Body small mute>
          now: {describe(current).toLowerCase()}
        </Body>
      </Row>
      <Row>
        <Body>Span</Body>
        <Stepper label="Span" value={value.span} onMinus={() => step(-1)} onPlus={() => step(1)} />
      </Row>
      <Toggle
        label={`Span ${value.span} hung`}
        value={value.complete && !isDoubleGirder(value.span)}
        disabled={isDoubleGirder(value.span)}
        onChange={(complete) => onChange({ ...value, complete })}
      />
      {isDoubleGirder(value.span) && (
        <Notice>Double girder span: only the arrival is logged, so Hung and the gantry step are off.</Notice>
      )}
      {value.span !== current.span && <Notice>Moving to a new span turns Hung off.</Notice>}
    </Panel>
  );
}
