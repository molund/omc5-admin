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
import {
  shutdownEffects,
  stepsWithEstimates,
  trendOf,
  WINDOW,
  WORKING_DAYS_PER_WEEK,
  workingHours,
} from "../lib/velocity.js";
import { parseStatus } from "../lib/statusFile.js";
import { STAGE_LABELS } from "../lib/stages.js";
import { clock, dayOf, parseKey, stamp, toKey, weekdayShort } from "../lib/time.js";
import { HOLIDAY_CAP_HOURS } from "../lib/shutdowns.js";
import { Icon } from "./Icon";
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
// hours as "14h", "2h 45m" or "45m"
const hm = (h) => {
  const m = Math.round(h * 60);
  if (m === 0) return "0h";
  const [hh, mm] = [Math.floor(m / 60), m % 60];
  return hh && mm ? `${hh}h ${mm}m` : hh ? `${hh}h` : `${mm}m`;
};
// shutdown hours: whole ones without the decimals
const gapHours = (h) => (Math.abs(h - Math.round(h)) < 0.01 ? `${Math.round(h)}h` : hours(h));
// a span's steps added up: each runs to the next, the last to the next span's arrival, or nowhere yet on the newest span
const spanTotal = (steps) => steps.reduce((total, t) => total + (t.stepHours ?? 0), 0);

/** What an irregular shutdown does to the week, in a sentence or two. */
function shutdownNote(e, window) {
  const { shutdown, info } = e;
  if (!e.valid) return `Left out: ${shutdown.errors.join("; ")}.`;
  const before = window && shutdown.endMs <= parseKey(window.start).getTime();
  const parts = [];
  if (shutdown.open) parts.push("Open: it has no end or hours yet. Add one when work starts again.");
  else if (e.state === "on") parts.push("In progress.");
  else if (e.state === "upcoming") parts.push("Upcoming.");
  if (info.excused) {
    if (e.extends > 0) {
      const cut =
        shutdown.length > HOLIDAY_CAP_HOURS
          ? ` (excused up to ${HOLIDAY_CAP_HOURS}h of its ${hm(shutdown.length)})`
          : "";
      parts.push(`Extends the week by ${hm(e.extends)}${cut}.`);
    } else if (before) parts.push("Before this week.");
    else parts.push(`It joins the week, up to ${HOLIDAY_CAP_HOURS}h, once a step is logged after it began.`);
  } else if (e.inWeek > 0) parts.push(`${hm(e.inWeek)} of it is in the week. It counts against the pace.`);
  else if (before) parts.push("Before this week.");
  else parts.push("It counts against the pace once it's in the week.");
  if (shutdown.warnings.length) parts.push(`${shutdown.warnings.join("; ")}.`);
  return parts.join(" ");
}

/**
 * @param {object} props
 * @param {boolean} [props.full] Everything, on the Velocity page; otherwise only the velocity, for Home.
 * @param {() => void} [props.onOpen] Opens the Velocity page.
 */
export function VelocityPanel({ full, onOpen }) {
  const { tw, colors } = useTw();
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
    // the weekly shutdown's hours in the gap (an irregular one's are shown in a box of its own)
    const shutdown = prev.weeklyGap;
    // the scheduled shutdown in the gap, before a step logged in its evening cut it short
    carried += (b - a) / 3600000 - workingHours(a, b) - shutdown;
    gaps.set(t, { shutdown, overtime: shutdown > 0.01 ? carried : 0 });
    if (shutdown > 0.01) carried = 0;
  });
  // each irregular shutdown in a box above the first step after it began, or at the end when no step has come since
  const effects = shutdownEffects(desk.deskEntries, v);
  const firstAt = recent.length ? parseKey(recent[0].key).getTime() : Infinity;
  const boxesBefore = new Map();
  const boxesAfter = [];
  for (const e of [...effects].reverse().filter((e) => e.valid && e.shutdown.startMs >= firstAt)) {
    const next = recent.find((t) => parseKey(t.key).getTime() > e.shutdown.startMs);
    if (next) boxesBefore.set(next, [...(boxesBefore.get(next) ?? []), e]);
    else boxesAfter.push(e);
  }
  const windowNotes = v.window
    ? [
        v.window.extended > 0 &&
          `${hm(168 + v.window.extended)}: the 168 hours, extended by ${hm(v.window.extended)} of holidays`,
        v.window.reported &&
          `the ${clock(v.window.reported)} step is counted at ${clock(v.window.end)}, when ${
            effects.find((e) => e.valid && e.shutdown.startMs === parseKey(v.window.end).getTime())?.shutdown.label ??
            "a shutdown"
          } began`,
      ].filter(Boolean)
    : [];
  let lastDay = null;
  for (const t of recent) {
    if (bySpan.at(-1)?.span !== t.span) bySpan.push({ span: t.span, steps: [] });
    const day = dayOf(t.key);
    const { shutdown = 0, overtime = 0 } = gaps.get(t) ?? {};
    bySpan
      .at(-1)
      .steps.push({ ...t, newDay: day !== lastDay, shutdown, overtime, irregular: boxesBefore.get(t) ?? [] });
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
  // an irregular shutdown in a box of its own, dashed like a gap, with its icon: a holiday's hours aren't counted, any other
  // kind's are
  const shutdownBox = (e, key) => {
    const { shutdown, info } = e;
    const long = !shutdown.open && shutdown.length > HOLIDAY_CAP_HOURS;
    const rule = info.excused
      ? long
        ? `first ${HOLIDAY_CAP_HOURS}h not counted`
        : "not counted"
      : "counts against the pace";
    const state = e.state === "on" ? "in progress, " : e.state === "upcoming" ? "upcoming, " : "";
    return (
      <View
        key={key}
        style={tw`mt-1 flex-row items-center gap-1.5 rounded-sm border border-dashed border-mute px-2 py-0.5`}
      >
        {info.icon && <Icon name={info.icon} size={14} color={colors.mute} />}
        <Body small mute style={[tw`flex-1`, num]}>
          {`${shutdown.label} · ${shutdown.open ? `open since ${clock(shutdown.start)}` : hm(shutdown.length)} · ${state}${rule}`}
        </Body>
      </View>
    );
  };
  const dayBar = (t) => (
    <>
      {t.shutdown > 0.01 && (
        <View style={tw`mt-1 flex-row items-center gap-1.5 rounded-sm border border-dashed border-mute px-2 py-0.5`}>
          <Icon name="calendar" size={14} color={colors.mute} />
          <Body small mute style={[tw`flex-1`, num]}>
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
              {`How far the gantry got in the week (168 hours) up to the latest step reported (${stageName(v.stage).toLowerCase()} on span ${v.window.span}). It allows for the weekly shutdown, Friday and Saturday nights and Sunday's day shift. A statutory holiday extends the week by its hours without gantry work, up to ${HOLIDAY_CAP_HOURS} each; any other irregular shutdown counts against the pace. A step reported during one is counted at its start.`}
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
              {`${stamp(v.window.start)} to ${stamp(v.window.end)}${windowNotes.length ? ` (${windowNotes.join("; ")})` : ""}. The end is where ${stageName(v.stage).toLowerCase()} comes in span ${v.window.span}'s cycle; the start is read off between the steps either side of it.`}
            </Body>
          </View>
          <Body small>{`${(v.window.to - v.window.from).toFixed(2)} spans`}</Body>
        </Row>
      )}
      {open && effects.length > 0 && (
        <View style={tw`gap-2 border-t border-line pt-2`}>
          <Body small mute>
            Irregular shutdowns, newest first
          </Body>
          {effects.map((e, i) => {
            const { shutdown, info } = e;
            const endKey = e.valid && !shutdown.open ? toKey(new Date(shutdown.endMs)) : null;
            const when = !e.valid
              ? null
              : shutdown.open
                ? `${stamp(shutdown.start)} · still going`
                : `${stamp(shutdown.start)} to ${dayOf(shutdown.start) === dayOf(endKey) ? clock(endKey) : stamp(endKey)} · ${hm(shutdown.length)}`;
            return (
              <View key={i} style={tw`flex-row items-start gap-2`}>
                <View style={{ width: 22 }}>
                  {info.icon && e.valid ? <Icon name={info.icon} size={22} color={colors.mute} /> : null}
                </View>
                <View style={tw`flex-1 gap-0.5`}>
                  <Body>
                    {shutdown.label}
                    <Body small mute>{`  ${shutdown.type || "no type"}`}</Body>
                  </Body>
                  {when && (
                    <Body small mute style={num}>
                      {when}
                    </Body>
                  )}
                  <Body small mute={e.valid} style={e.valid ? null : tw`text-del-ink`}>
                    {shutdownNote(e, v.window)}
                  </Body>
                </View>
                <Body small style={[tw`font-semibold`, num]}>
                  {e.valid ? `+${hm(e.extends)}` : "–"}
                </Body>
              </View>
            );
          })}
          <Body small mute>
            Every shutdown is listed. Only holidays extend the week.
          </Body>
        </View>
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
                {`${(s.share * 100).toFixed(1)}%`}
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
                  {t.irregular.map((e, k) => shutdownBox(e, k))}
                  {t.newDay && i > 0 && dayBar(t)}
                  <View style={tw`flex-row items-baseline gap-2 pl-3`}>
                    <Body small mute={t.estimated} style={[tw`flex-1`, offStyle(t)]}>
                      {`${SHORT_LABELS[t.stage] ?? STAGE_LABELS[t.stage]}${t.estimated ? " (est.)" : ""}`}
                      {t.reported ? <Body small mute>{` (reported ${clock(t.reported)})`}</Body> : null}
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
              {g === bySpan.at(-1) && boxesAfter.map((e, k) => shutdownBox(e, k))}
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
