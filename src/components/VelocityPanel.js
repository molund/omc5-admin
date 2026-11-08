// The Clayton Clipper's velocity, from desk.yaml (lib/velocity.js): spans per week, from how far
// the gantry got in the week up to the latest step reported (the window it's from), each stage's share of the cycle, how long the gantry has been on its span, and each step, grouped by span,
// with its time (BC) and the working time from it to the next step: the ones logged, and the ones that
// weren't, estimated the way a missing arrival is, with a bar naming the weekday at each new calendar day and each span's
// steps added up.
// Home shows only the velocity itself, with a way to the Velocity page, which shows it all (`full`).
import { Fragment } from "react";
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk } from "../state/desk.js";
import { stepsWithEstimates, trendOf, WINDOW } from "../lib/velocity.js";
import { parseStatus } from "../lib/statusFile.js";
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
// the stage a cycle is timed by, in full ("Hanging started to hanging started")
const stageName = (stage) => STAGE_LABELS[stage] ?? stage;

// the stat: a tenth larger than text-lg numbers and text-sm words
const STAT_NUMBER = { fontSize: 19.8, lineHeight: 26 };
const STAT_LABEL = { fontSize: 15.4 };

const days = (n) => `${n.toFixed(2)} days`;
const hours = (h) => `${h.toFixed(2)}h`;
// a span's steps added up: each runs to the next, the last to the next span's arrival, or nowhere yet on the newest span
const spanTotal = (steps) => steps.reduce((total, t) => total + (t.stepHours ?? 0), 0);

/**
 * @param {object} props
 * @param {boolean} [props.full] Everything, on the Velocity page; otherwise only the velocity, for Home.
 * @param {() => void} [props.onOpen] Opens the Velocity page.
 */
export function VelocityPanel({ full, onOpen }) {
  const { tw } = useTw();
  const desk = useDesk();
  const open = !!full;
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
          !full &&
          onOpen &&
          (v.window || v.current || recent.length > 0) && (
            <Button kind="link" small title="Details ›" onPress={onOpen} />
          )
        }
      >
        Velocity
      </Label>
      {v.spansPerWeek != null ? (
        <View style={tw`gap-0.5`}>
          {/* closed: on one line, or one under the other when it's too narrow, never broken in the middle of a stat;
              opened: always one under the other */}
          <View style={open ? tw`gap-0.5` : tw`flex-row flex-wrap items-baseline gap-x-4`}>
            {[[v.spansPerWeek.toFixed(2), "spans-per-week", "spans/wk"]].map(([shown, key, label]) => {
              // desk.yaml has the earlier values (status.yaml did, before Nov. 8, 2026)
              const deskHeader = parseStatus(desk.deskText ?? "").header;
              const t = trendOf(shown, deskHeader[key] ? deskHeader : desk.parsed?.header, key);
              return (
                <Body key={key} style={STAT_LABEL}>
                  <Body style={[tw`font-bold`, STAT_NUMBER]}>{shown}</Body>
                  {/* which way it went since its value before, and (opened) from what */}
                  {t && (
                    <Body mute style={STAT_LABEL}>
                      {` ${t.way === "up" ? "▲" : "▼"}${open ? ` from ${t.from}` : ""}`}
                    </Body>
                  )}{" "}
                  {label}
                </Body>
              );
            })}
          </View>
          {open && (
            <Body small mute>
              {`How far the gantry got in the week (168 hours) up to the latest step reported (${stageName(v.stage).toLowerCase()} on span ${v.window.span}). It allows for the weekly shutdown, Saturday night and Sunday's day shift.`}
            </Body>
          )}
        </View>
      ) : (
        <Body small mute>
          Not enough steps logged yet for a velocity.
        </Body>
      )}
      {open && v.window && (
        <Row style={tw`flex-nowrap items-start border-t border-line pt-2`}>
          <View style={tw`flex-1 gap-0.5`}>
            <Body small>{`About span ${v.window.from.toFixed(2)} to span ${v.window.to.toFixed(2)}`}</Body>
            <Body small mute>
              {`${stamp(v.window.start)} to ${stamp(v.window.end)}. The end is where ${stageName(v.stage).toLowerCase()} comes in span ${v.window.span}'s cycle; the start is read off between the steps either side of it.`}
            </Body>
          </View>
          <Body small>{`${(v.window.to - v.window.from).toFixed(2)} spans`}</Body>
        </Row>
      )}
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
                      style={[tw`text-right`, { minWidth: 56, flexShrink: 0 }, num]}
                    >
                      {clock(t.key)}
                    </Body>
                    <Body small mute={t.estimated} style={[tw`w-16 text-right`, num]}>
                      {t.stepHours == null ? "–" : hours(t.stepHours)}
                    </Body>
                  </View>
                </Fragment>
              ))}
              <View style={tw`flex-row items-baseline gap-2 border-t border-line pl-3 pt-0.5`}>
                <Body small style={tw`flex-1 font-semibold`}>
                  {g.steps.at(-1).stepHours == null ? "Total so far" : "Total"}
                </Body>
                <Body small numberOfLines={1} style={[tw`text-right font-semibold`, { flexShrink: 0 }, num]}>
                  {days(spanTotal(g.steps) / 24)}
                </Body>
                <Body small style={[tw`w-16 text-right font-semibold`, num]}>
                  {hours(spanTotal(g.steps))}
                </Body>
              </View>
            </View>
          ))}
        </View>
      )}
    </Panel>
  );
}
