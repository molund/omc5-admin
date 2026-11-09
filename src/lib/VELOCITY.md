# Velocity

How the Leash Log works out the Clayton Clipper's velocity (`velocity.js`), and every assumption it makes. Most of these
are constants at the top of `velocity.js`; if the job changes, that's where to change them.

## What it calculates

- **Spans per week**: how far the gantry got in **the 168 hours (a week) up to the step reported most recently** (the last
  step logged in `gantry-cycles.yaml`, `WEEK_HOURS`), in spans, counting the part-spans at each end. So it moves with every step,
  not only at each arrival.
  - The end is that step's place in its span's cycle: span 38's "moving supports started", 83% through its cycle, is
    38.83.
  - The start, a week earlier, is read off between the steps logged either side of that moment, on the shift clock, the
    way an estimated step is.
- **Each stage's share of the cycle**: how the cycle splits between the steps logged in `gantry-cycles.yaml`.
- **Estimated stages**: a stage or arrival that wasn't logged, read off from the steps that were.

Spans per week is written on every push, to two decimals, each change its own commit, in two places:

- **`gantry-cycles.yaml`**, above `entries:` (`setDeskVelocity` in `changes.js`): `spans-per-week`, and under it
  `spans-per-week-previous`, its values at the earlier steps of **the past 96 hours** (`HISTORY_HOURS`, counted back from
  the latest step), newest first, each with the span and stage of the step it was timed by:

  ```yaml
  spans-per-week: 2.83
  spans-per-week-previous:
    - 2026-11-06T22:00-07:00: 2.81
      span: 38
      stage: hangers down
  ```

- **`status.yaml`**, after `hung:`, a copy of `spans-per-week` alone (`setVelocity`): the figure the site's card shows.

- **Recalculated, not remembered.** On every push the list is worked out again from `gantry-cycles.yaml`'s entries
  (`velocityHistory`): the velocity at each earlier step, from the steps logged by then. So it backfills itself, a step
  logged late lands where its time stamp puts it, and values more than 96 hours before the latest step are pruned.
- **The chart.** The site's build (`src/lib/velocityChart.js` and `trackside/prerender.js` in molund/omc5) reads
  `gantry-cycles.yaml`'s velocity and draws `velocity.svg` for the progress card, in place of an arrow: the earlier values, then
  the figure now at the newest entry's time, spaced by time, the y axis zoomed to their range (a tenth more each side),
  no labels, green when the last is above the first, red below, grey the same. The Leash Log's card preview draws the same
  (`chartFor` in `card.js`).
- **The arrow** on the Leash Log's own velocity panel compares the figure with the newest earlier value; equal, no arrow.
- **Earlier forms.** On Nov. 7, 2026 the earlier values were in `status.yaml`: as a list (for 96 hours, then for the
  current span and the one before it), as a single value, with underscored keys (`spans_per_week` and so on), and with
  days per span too. The next push leaves `status.yaml` with just the copy.

## The site's tooltip is simplified on purpose

The site's progress card shows spans per week, and its tooltip says: "Approximate. Based on 2-3 site visits per day during
the 168 hours preceding the last check-in. Significant figures are for entertainment purposes only." That's simplified,
intentionally, so it reads easily. What the calculation actually does:

- **It's based on the earliest observed stage entry it uses, not on a clean 168-hour window.** The start of the week is
  read off between the steps logged either side of it, so the earliest step the calculation draws on is the last one
  logged before the week began. That can be hours or days before it, so the data behind the figure can reach back well
  beyond 168 hours.
- **The week ends at the last step logged, not the last check-in.** A check-in that logs no step (an update, follow-up or
  position record without a gantry step) doesn't move the end, so the most recent check-in may not contribute to the
  velocity at all.
- "2-3 site visits per day" describes how often steps tend to be logged; the calculation doesn't assume it.

The tooltip's text is in the site's `src/ProgressCard.svelte` (molund/omc5); change it there if the calculation changes
enough that the simplification stops being fair.

## Time

- **BC time is UTC−7 all year.** Every time stamp in `status.yaml` and `gantry-cycles.yaml` is read as UTC−7. There's no switch to
  standard time.
- A "working day" is 24 working hours, not one shift.

## Shifts

- **Day shift: 7 a.m. to 5 p.m.**
- **Night shift: 8 p.m. to 6 a.m.** the next morning.
- **No work in the gaps**: 5 p.m. to 8 p.m. and 6 a.m. to 7 a.m.
- Every day has both shifts, except Saturday (no night shift) and Sunday (no day shift). See the shutdown below.
- Shift times are used for the stage shares and the estimated arrivals only (`shiftHours`, `afterShiftHours`): time
  between shifts counts as no time at all.

## The weekly shutdown

- **6 p.m. Saturday to 6 p.m. Sunday**, 24 hours, every week (`SHUTDOWN_START`, `SHUTDOWN_HOURS`). The site works 24/6.
- On the shift clock this is Saturday's night shift and Sunday's day shift. The Sunday night shift (from 8 p.m.) runs.
- Cycle lengths and the velocity use working time (`workingHours`): every hour counts except the shutdown, including
  the gaps between shifts.
- No holidays or other days off are allowed for. A stat holiday, a weather day or a breakdown counts as working time.
- **Seen Nov. 7, 2026, not yet in the code:** the Friday night shift is pretty much nonexistent. There was a little
  activity early Friday evening, the hangers being lowered, which doesn't need a big crew; it may have just been the day
  shift working overtime. The day shift works six days a week and the night shift only five (Sunday to Thursday nights),
  so the working week is uneven, which is why the velocity is given only per week (spans per week), not as days per
  span.

## Two clocks

The code keeps two clocks, and they don't agree on the gaps between shifts:

| Used for                         | Clock        | Counts                                     |
| -------------------------------- | ------------ | ------------------------------------------ |
| Cycle lengths, spans per week    | Working time | Every hour except the shutdown             |
| Stage shares, estimated arrivals | Shift hours  | Only the hours inside a day or night shift |

So the cycle lengths and spans per week include the shift-change gaps, and the shares don't.

## Stages

In cycle order (`stages.js`). Each stage runs until the next one starts; the last runs until the next span's arrival.

1. Arrived at span
2. Hanging started
3. All segments hung
4. Gluing started
5. Glued
6. Post-tensioning started
7. Cables down
8. Hangers down
9. Moving supports started

## Hard-coded stage lengths

These short hand-offs are held near a set length in shift hours (`KNOWN_HOURS`):

| From              | To                      | Shift hours |
| ----------------- | ----------------------- | ----------- |
| Arrived at span   | Hanging started         | 0.5         |
| All segments hung | Gluing started          | 1           |
| Glued             | Post-tensioning started | 1           |
| Cables down       | Hangers down            | 2.5         |
| Hangers down      | Moving supports started | 1           |

- Each is pulled toward its length as firmly as 10 logged gaps would pull it (`FIRM`). With only a few spans of data,
  they barely move.
- The other stages (hanging, gluing, post-tensioning and the supports move) come from the logged gaps. One that was
  never logged is pulled lightly (`LIGHT`, 0.05) toward the average, so it gets a share.
- With no gaps logged at all, every stage is assumed to take 4 shift hours: about a day and a half a cycle.

## Which data counts

- **Steps since Nov. 3, 2026** (`SHARES_SINCE`) for the shares. Older steps were filled in from old posts, before the Leash Log
  tagged steps.
- **The newest span and the three before it** for the shares. Older spans drop out as the gantry moves on. A step tagged
  with too high a span number moves this window.
- **The earliest time stamp** for each step on each span. A tag means "this had happened by then".
- Steps logged out of order (later in the cycle but earlier in time) are ignored for the shares, and don't take the
  gantry's progress backwards when the start of the velocity's week is read off.
- The velocity's week ends at the step logged last, by time stamp. With no step logged before its start (a week of data or
  less), there's no velocity yet.
- **All steps count** for the velocity's week, however old, not only those since `SHARES_SINCE`.

## Estimated arrivals and steps

- A missing arrival (or the velocity's stage, on a span where it wasn't logged) is placed between the nearest logged steps before and after it, in a straight line on the shift
  clock, using the stage shares to say how far through the cycle each step was.
- With no step on one side, there's no estimate, and that span's cycle isn't counted.
- Estimates are rounded to the quarter hour.
- Any other step that wasn't logged is estimated the same way, for the steps table in the velocity panel, where it's
  marked "(est.)". A step still to come (nothing logged after it) isn't estimated.
- They're worked out again every time, so an estimate can shift a little as new steps are logged.
