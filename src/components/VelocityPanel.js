// The Clayton Clipper's velocity, from desk.yaml (lib/velocity.js): working days per span over the last two spans, the
// cycles it's from, how long the gantry has been on its span, and each step logged, with the time since its span's arrival.
// Only the velocity itself shows until it's opened.
import { useState } from "react";
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk } from "../state/desk.js";
import { sinceArrival, WINDOW } from "../lib/velocity.js";
import { STAGE_LABELS } from "../lib/stages.js";
import { stamp } from "../lib/time.js";
import { Body, Button, Label, Panel, Row } from "./ui.js";

const days = (n) => `${n.toFixed(2)} days`;
const hours = (h) => `${Math.round(h * 4) / 4} h`;

export function VelocityPanel() {
  const { tw } = useTw();
  const desk = useDesk();
  const [open, setOpen] = useState(false);
  const v = desk.velocity;
  if (!v) return null;
  const recent = v.current ? sinceArrival(desk.deskEntries).filter((t) => t.span >= v.current.span - WINDOW) : [];
  return (
    <Panel>
      <Label
        right={
          (v.cycles.length > 0 || v.current || recent.length > 0) && (
            <Button kind="link" small title={open ? "Hide details" : "Show details"} onPress={() => setOpen(!open)} />
          )
        }
      >
        Velocity
      </Label>
      {v.days != null ? (
        <View style={tw`gap-0.5`}>
          <Body>
            <Body style={tw`text-2xl font-bold`}>{v.days.toFixed(2)}</Body> days per span
          </Body>
          <Body small mute>
            {`The last ${v.cycles.length === 1 ? "span" : `${v.cycles.length} spans`}, in working time: Saturday night and Sunday's day shift don't count.`}
          </Body>
        </View>
      ) : (
        <Body small mute>
          Not enough steps logged yet for a velocity.
        </Body>
      )}
      {open &&
        v.cycles.map((c) => (
          <Row key={c.to} style={tw`flex-nowrap items-start border-t border-line pt-2`}>
            <View style={tw`flex-1 gap-0.5`}>
              <Body small>{`Span ${c.from} to ${c.to}`}</Body>
              <Body small mute>
                {`${c.by === "arrived at span" ? "Arrival to arrival" : `${STAGE_LABELS[c.by]}, span to span`}: ${stamp(c.start)} to ${stamp(c.end)}`}
              </Body>
            </View>
            <Body small>{days(c.hours / 24)}</Body>
          </Row>
        ))}
      {open && v.current && (
        <Row style={tw`border-t border-line pt-2`}>
          <Body small>{`On span ${v.current.span} since ${stamp(v.current.since)}`}</Body>
          <Body small>{days(v.current.days)}</Body>
        </Row>
      )}
      {open && recent.length > 0 && (
        <View style={tw`gap-1 border-t border-line pt-2`}>
          <Body small mute>
            Steps logged, in working time since arriving at the span
          </Body>
          {recent.map((t) => (
            <Row key={t.key}>
              <Body small>{`Span ${t.span}: ${STAGE_LABELS[t.stage]}`}</Body>
              <Body small mute>
                {hours(t.hours)}
              </Body>
            </Row>
          ))}
        </View>
      )}
    </Panel>
  );
}
