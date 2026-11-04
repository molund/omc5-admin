// The Clayton Clipper's span and whether it's complete. Moving to a new span turns Complete off, as the deploy workflow does.
import { useState } from "react";
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { Body, Button, Label, Notice, Panel, Row, Stepper, Toggle } from "./ui.js";

export const FIRST_SPAN = 3,
  LAST_SPAN = 104;

const describe = (g) => `Span ${g.span} · ${g.complete ? "complete" : "not complete"}`;

/**
 * @param {{ value: {span:number, complete:boolean}, current: {span:number, complete:boolean}, onChange: Function }} props
 */
export function GantryControls({ value, current, onChange }) {
  const { tw } = useTw();
  const step = (d) => {
    const span = Math.min(LAST_SPAN, Math.max(FIRST_SPAN, value.span + d));
    onChange({ span, complete: span === current.span ? current.complete : false });
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
        label={`Span ${value.span} complete`}
        value={value.complete}
        onChange={(complete) => onChange({ ...value, complete })}
      />
      {value.span !== current.span && <Notice>Moving to a new span turns Complete off.</Notice>}
    </Panel>
  );
}

/** The same controls folded to one line, with Edit to open them. */
export function GantryFold({ value, current, onChange, offLabel }) {
  const { tw } = useTw();
  const [open, setOpen] = useState(false);
  const changed = value.span !== current.span || value.complete !== current.complete;
  if (open)
    return (
      <View style={tw`gap-1`}>
        <GantryControls value={value} current={current} onChange={onChange} />
        <Row style={tw`justify-end`}>
          {changed && offLabel && <Button kind="link" small title="Leave the gantry as it is" onPress={() => onChange(current)} />}
          <Button kind="link" small title="Done" onPress={() => setOpen(false)} />
        </Row>
      </View>
    );
  return (
    <Panel>
      <Row>
        <Label>{changed || !offLabel ? "Gantry" : offLabel}</Label>
        <Button kind="link" small title={changed || !offLabel ? "Edit" : "Move too"} onPress={() => setOpen(true)} />
      </Row>
      <Body>
        {describe(value)}
        {changed || offLabel ? "" : " (unchanged)"}
      </Body>
    </Panel>
  );
}
