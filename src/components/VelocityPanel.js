// The Clayton Clipper's velocity, from gantry-cycles.yaml (lib/velocity.js): spans per week, from how far
// the gantry got in the week up to the latest step reported (the window it's from), each stage's share of the cycle, how long the gantry has been on its span, and each step, grouped by span,
// with its time (BC) and the working time from it to the next step: the ones logged, and the ones that
// weren't, estimated the way a missing arrival is, with a bar naming the weekday at each new calendar day and each span's
// steps added up.
// Home shows only the velocity itself, with a way to the Velocity page, which shows it all (`full`).
import { Fragment } from "react";
import { View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk } from "../state/desk.js";
import { stepsWithEstimates, trendOf, WINDOW, WORKING_DAYS_PER_WEEK, workingHours } from "../lib/velocity.js";
import { parseStatus } from "../lib/statusFile.js";
import { STAGE_LABELS } from "../lib/stages.js";
import { clock, dayOf, parseKey, stamp, weekdayShort } from "../lib/time.js";
import { Body, Button, Label, Panel, Row } from "./ui.js";

// the steps' names in this panel's rows (the log and the stage shares): each names the stage that starts at the step
const SHORT_LABELS = {
  "arrived at span": "Cycle prep",
  "hanging started": "Hanging",
  hung: "Pre-gluing",
  "gluing started": "Gluing",
  glued: "Curing",
  "post-tensioning started": "Post-tensioning",
  "cables down": "Hanger removal",
  "hangers down": "Pause before movement",
  "supports started": "Gantry movement",
};
// the stage a cycle is timed by, in full ("Hanging started to hanging started")
const stageName = (stage) => STAGE_LABELS[stage] ?? stage;

// the stat: a tenth larger than text-lg numbers and text-sm words
const STAT_NUMBER = { fontSize: 19.8, lineHeight: 26 };
const STAT_LABEL = { fontSize: 15.4 };

// a logged stage that ran more than this share longer than expected shows in bold red, more than this share shorter in bold
// blue; expected is its share of a cycle's working time at the velocity, as in the stages chart
const OFF_SHARE = 0.2;

const days = (n) => `${n.toFixed(2)} days`;
const hours = (h) => `${h.toFixed(2)}h`;
// shutdown hours: whole ones without the decimals
const gapHours = (h) => (Math.abs(h - Math.round(h)) < 0.01 ? `${Math.round(h)}h` : hours(h));
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
  const all = v.current ? stepsWithEstimates(desk.deskEntries, v.shares) : [];
  const recent = all.filter((t) => t.span >= v.current.span - WINDOW);
  // the steps under their span, in the same order, each marked if it's the first on its calendar day, with the shutdown
  // hours left out between it and the step before it (the clock time less the working time), for its day bar
  const bySpan = [];
  // each step's shutdown hours and overtime, over all the steps: overtime is a step logged in a shutdown's evening, so it's
  // in the gap before that step, while the rest of the shutdown is in the gap after it; it's carried to the next gap with a
  // shutdown in it
  const gaps = new Map();
  let carried = 0;
  all.forEach((t, i) => {
    const prev = all[i - 1];
    if (prev?.stepHours == null) return;
    const [a, b] = [parseKey(prev.key), parseKey(t.key)];
    const shutdown = (b - a) / 3600000 - prev.stepHours;
    // the scheduled shutdown in the gap, before a step logged in its evening cut it short
    carried += (b - a) / 3600000 - workingHours(a, b) - shutdown;
    gaps.set(t, { shutdown, overtime: shutdown > 0.01 ? carried : 0 });
    if (shutdown > 0.01) carried = 0;
  });
  let lastDay = null;
  for (const t of recent) {
    if (bySpan.at(-1)?.span !== t.span) bySpan.push({ span: t.span, steps: [] });
    const day = dayOf(t.key);
    const { shutdown = 0, overtime = 0 } = gaps.get(t) ?? {};
    bySpan.at(-1).steps.push({ ...t, newDay: day !== lastDay, shutdown, overtime });
    lastDay = day;
  }
  const num = { fontVariant: ["tabular-nums"] };
  const cycleHours = v.spansPerWeek ? (WORKING_DAYS_PER_WEEK * 24) / v.spansPerWeek : null;
  const expected = Object.fromEntries(v.shares.map((s) => [s.stage, cycleHours && s.share * cycleHours]));
  const offStyle = (t) => {
    if (t.estimated || t.stepHours == null || !expected[t.stage]) return null;
    const over = t.stepHours / expected[t.stage] - 1;
    return over > OFF_SHARE ? tw`font-bold text-del-ink` : over < -OFF_SHARE ? tw`font-bold text-accent` : null;
  };
  // above the span's heading when its first step starts the day, so the day always comes before the span, with the
  // shutdown hours left out since the step before, when there are any, in a box of their own above it: dashed, as time
  // that isn't counted, and free to wrap onto a second line
  const dayBar = (t) => (
    <>
      {t.shutdown > 0.01 && (
        <View style={tw`mt-1 rounded-sm border border-dashed border-mute px-2 py-0.5`}>
          <Body small mute style={num}>
            {`${gapHours(t.shutdown)} gap${t.overtime > 0.01 ? ` (${gapHours(t.shutdown + t.overtime)} - ${gapHours(t.overtime)} OT)` : ""} · ${weekdayShort(t.key) === "Sat" ? "no Fri overnight work" : "shutdown not counted"}`}
          </Body>
        </View>
      )}
      <View style={tw`my-0.5 flex-row items-baseline gap-2 rounded-sm bg-line px-2`}>
        <Body small style={tw`flex-1`}>
          {`${weekdayShort(t.key)} ${Number(dayOf(t.key).slice(8))}`}
        </Body>
      </View>
    </>
  );
  return (
    <Panel>
      <Label
        right={
          !full &&
          onOpen &&
          (v.window || v.current || recent.length > 0) && <Button kind="link" small title="Debug ›" onPress={onOpen} />
        }
      >
        {full ? "Data and inputs" : "Velocity"}
      </Label>
      {v.spansPerWeek != null ? (
        <View style={tw`gap-0.5`}>
          {/* closed: on one line, or one under the other when it's too narrow, never broken in the middle of a stat;
              opened: always one under the other */}
          <View style={open ? tw`gap-0.5` : tw`flex-row flex-wrap items-baseline gap-x-4`}>
            {[[v.spansPerWeek.toFixed(2), "spans-per-week", "spans/wk"]].map(([shown, key, label]) => {
              // gantry-cycles.yaml has the earlier values (status.yaml did, before Nov. 8, 2026)
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
              {`How far the gantry got in the week (168 hours) up to the latest step reported (${stageName(v.stage).toLowerCase()} on span ${v.window.span}). It allows for the weekly shutdown, Friday and Saturday nights and Sunday's day shift.`}
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
            Share of the cycle, from each step to the next, and that share of a cycle's working time at the velocity
          </Body>
          {v.shares.map((s) => (
            <View key={s.stage} style={tw`flex-row items-baseline gap-2`}>
              <Body small style={tw`flex-1`}>
                {SHORT_LABELS[s.stage] ?? STAGE_LABELS[s.stage]}
              </Body>
              <Body small mute style={num}>
                {`${Math.round(s.share * 100)}%`}
              </Body>
              {/* last, as in the steps below: the working time a cycle takes (a week's over the spans per week) */}
              <Body small style={[tw`w-16 text-right`, num]}>
                {v.spansPerWeek ? hours((s.share * WORKING_DAYS_PER_WEEK * 24) / v.spansPerWeek) : "–"}
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
          {/* the same columns as the rows below: when each step started, and how long it ran */}
          <View style={tw`flex-row items-baseline gap-2 pl-3`}>
            <View style={tw`flex-1`} />
            <Body small mute numberOfLines={1} style={[tw`text-right`, { minWidth: 56, flexShrink: 0 }]}>
              Start
            </Body>
            <Body small mute style={tw`w-16 text-right`}>
              Duration
            </Body>
          </View>
          {bySpan.map((g) => (
            <View key={g.span} style={tw`gap-0.5 pt-1`}>
              {g.steps[0].newDay && dayBar(g.steps[0])}
              <Body style={tw`text-lg font-semibold leading-snug`}>{`Span ${g.span}`}</Body>
              {g.steps.map((t, i) => (
                <Fragment key={t.stage}>
                  {t.newDay && i > 0 && dayBar(t)}
                  <View style={tw`flex-row items-baseline gap-2 pl-3`}>
                    <Body small mute={t.estimated} style={[tw`flex-1`, offStyle(t)]}>
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
                    <Body small mute={t.estimated} style={[tw`w-16 text-right`, num, offStyle(t)]}>
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
