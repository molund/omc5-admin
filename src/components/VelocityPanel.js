// The Clayton Clipper's velocity, from desk.yaml (lib/velocity.js): working days per span over the last three spans and
// the spans per week that makes with the shutdown allowed for, the cycles it's from (an arrival that wasn't logged is an
// estimate), each stage's share of the cycle, how long the gantry has been on its span, and each step, grouped by span,
// with its time (BC) and the working time from it to the next step: the ones logged, and the ones that
// weren't, estimated the way a missing arrival is, with a bar naming the weekday at each new calendar day.
// Only the velocity itself shows until it's opened.
import { Fragment, useState } from "react";
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk } from "../state/desk.js";
import { stepsWithEstimates, WINDOW } from "../lib/velocity.js";
import { STAGE_LABELS } from "../lib/stages.js";
import { clock, dayOf, stamp, weekdayShort } from "../lib/time.js";
import { Body, Button, Label, Panel, Row } from "./ui.js";

// the long step names, shorter for this panel's rows
const SHORT_LABELS = {
  "hanging started": "Hanging",
  "gluing started": "Gluing",
  "post-tensioning started": "Post-tensioning",
  "supports started": "Moving supports",
};

const days = (n) => `${n.toFixed(2)} days`;
const hours = (h) => `${h.toFixed(2)} h`;

export function VelocityPanel() {
  const { tw } = useTw();
  const desk = useDesk();
  const [open, setOpen] = useState(false);
  const v = desk.velocity;
  if (!v) return null;
  const recent = v.current
    ? stepsWithEstimates(desk.deskEntries, v.shares).filter((t) => t.span >= v.current.span - WINDOW)
    : [];
  // the steps under their span, in the same order, each marked if it's the first on its calendar day
  const bySpan = [];
  let lastDay = null;
  for (const t of recent) {
    if (bySpan.at(-1)?.span !== t.span) bySpan.push({ span: t.span, steps: [] });
    const day = dayOf(t.key);
    bySpan.at(-1).steps.push({ ...t, newDay: day !== lastDay });
    lastDay = day;
  }
  const num = { fontVariant: ["tabular-nums"] };
  // above the span's heading when its first step starts the day, so the day always comes before the span
  const dayBar = (key) => (
    <View style={tw`my-0.5 rounded-sm bg-line px-2`}>
      <Body small>{weekdayShort(key)}</Body>
    </View>
  );
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
          <Body>
            <Body style={tw`text-2xl font-bold`}>{v.spansPerWeek.toFixed(2)}</Body> spans per week
          </Body>
          <Body small mute>
            {`The last ${v.cycles.length === 1 ? "span" : `${v.cycles.length} spans`}. Days per span leaves out Saturday night and Sunday's day shift; spans per week allows for that shutdown.`}
          </Body>
        </View>
      ) : (
        <Body small mute>
          Not enough steps logged yet for a velocity.
        </Body>
      )}
      {open &&
        [...v.cycles].reverse().map((c) => (
          <Row key={c.to} style={tw`flex-nowrap items-start border-t border-line pt-2`}>
            <View style={tw`flex-1 gap-0.5`}>
              <Body small>{`Span ${c.from} to ${c.to}`}</Body>
              <Body small mute>
                {`Arrival to arrival: ${c.startEstimated ? "about " : ""}${stamp(c.start)} to ${c.endEstimated ? "about " : ""}${stamp(c.end)}`}
              </Body>
            </View>
            <Body small>{days(c.hours / 24)}</Body>
          </Row>
        ))}
      {open && (
        <View style={tw`gap-0.5 border-t border-line pt-2`}>
          <Body small mute>
            Share of the cycle, from each step to the next
          </Body>
          {v.shares.map((s) => (
            <View key={s.stage} style={tw`flex-row items-baseline gap-2`}>
              <Body small style={tw`flex-1`}>
                {SHORT_LABELS[s.stage] ?? STAGE_LABELS[s.stage]}
              </Body>
              <Body small mute style={num}>
                {`${Math.round(s.share * 100)}%`}
              </Body>
            </View>
          ))}
        </View>
      )}
      {open && v.current && (
        <Row style={tw`border-t border-line pt-2`}>
          <Body small>{`On span ${v.current.span} since ${stamp(v.current.since)}`}</Body>
          <Body small>{days(v.current.days)}</Body>
        </Row>
      )}
      {open && recent.length > 0 && (
        <View style={tw`gap-1 border-t border-line pt-2`}>
          <Body small mute>
            Steps, with the working time from each to the next (est.: not logged, estimated)
          </Body>
          {bySpan.map((g) => (
            <View key={g.span} style={tw`gap-0.5 pt-1`}>
              {g.steps[0].newDay && dayBar(g.steps[0].key)}
              <Body style={tw`text-lg font-semibold leading-snug`}>{`Span ${g.span}`}</Body>
              {g.steps.map((t, i) => (
                <Fragment key={t.stage}>
                  {t.newDay && i > 0 && dayBar(t.key)}
                  <View style={tw`flex-row items-baseline gap-2 pl-3`}>
                    <Body small mute={t.estimated} style={tw`flex-1`}>
                      {`${SHORT_LABELS[t.stage] ?? STAGE_LABELS[t.stage]}${t.estimated ? " (est.)" : ""}`}
                    </Body>
                    <Body
                      small
                      mute={t.estimated}
                      numberOfLines={1}
                      style={[tw`text-right`, { minWidth: 72, flexShrink: 0 }, num]}
                    >
                      {clock(t.key)}
                    </Body>
                    <Body small mute={t.estimated} style={[tw`w-16 text-right`, num]}>
                      {t.stepHours == null ? "–" : hours(t.stepHours)}
                    </Body>
                  </View>
                </Fragment>
              ))}
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}
