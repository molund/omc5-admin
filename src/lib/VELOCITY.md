# Velocity

How the Status Desk works out the Clayton Clipper's velocity (`velocity.js`), and every assumption it makes. Most of these
are constants at the top of `velocity.js`; if the job changes, that's where to change them.

## What it calculates

- **Days per span**: the average of the last three cycles (`WINDOW`), in working days. Each cycle runs from a stage on one
  span to the same stage on the next: **the stage reported most recently** (the last step logged in `desk.yaml`), so the
  velocity moves with every step, not only at each arrival. Averaged, that's the time from that stage on the span three
  back to the same stage now, over three.
- **Spans per week**: 6 working days a week divided by the days per span.
- **Each stage's share of the cycle**: how the cycle splits between the steps logged in `desk.yaml`.
- **Estimated stages**: that stage on an earlier span, or a span's arrival, when it wasn't logged, read off from the steps
  that were.

Both figures are written into `status.yaml` after `hung:`, to two decimals, on every push (`setVelocity` in `changes.js`).

## Time

- **BC time is UTC−7 all year.** Every time stamp in `status.yaml` and `desk.yaml` is read as UTC−7. There's no switch to
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
  so the working week is uneven, and a weekly velocity (spans per week) is probably more meaningful than a daily one
  (days per span).

## Two clocks

The code keeps two clocks, and they don't agree on the gaps between shifts:

| Used for                         | Clock        | Counts                                     |
| -------------------------------- | ------------ | ------------------------------------------ |
| Cycle lengths, days per span     | Working time | Every hour except the shutdown             |
| Stage shares, estimated arrivals | Shift hours  | Only the hours inside a day or night shift |

So the days per span include the shift-change gaps, and the shares don't.

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

- **Steps since Nov. 3, 2026** (`SHARES_SINCE`) for the shares. Older steps were filled in from old posts, before the desk
  tagged steps.
- **The newest span and the three before it** for the shares. Older spans drop out as the gantry moves on. A step tagged
  with too high a span number moves this window.
- **The earliest time stamp** for each step on each span. A tag means "this had happened by then".
- Steps logged out of order (later in the cycle but earlier in time) are ignored for the shares.
- Only consecutive spans make a cycle, and only when the stage is known on both, logged or estimated.
- The newest cycle ends at the step logged last. If that step's span is lower than a span already logged (a late report),
  the cycles end at its span.

## Estimated arrivals and steps

- A missing arrival (or the velocity's stage, on a span where it wasn't logged) is placed between the nearest logged steps before and after it, in a straight line on the shift
  clock, using the stage shares to say how far through the cycle each step was.
- With no step on one side, there's no estimate, and that span's cycle isn't counted.
- Estimates are rounded to the quarter hour.
- Any other step that wasn't logged is estimated the same way, for the steps table in the velocity panel, where it's
  marked "(est.)". A step still to come (nothing logged after it) isn't estimated.
- They're worked out again every time, so an estimate can shift a little as new steps are logged.
