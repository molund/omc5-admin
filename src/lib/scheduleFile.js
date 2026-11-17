// shift-schedule.yaml in molund/omc5: the gantry's work schedule, written by hand. The Leash Log reads it (the velocity's
// calculations, lib/velocity.js) and never writes it; the site doesn't read it. Its lists:
//   irregular-shutdowns:  stretches with no gantry work that the weekly shutdown doesn't cover (lib/shutdowns.js)
//   night-shift-off:      stretches of nights with no night shift, the day shift still working (lib/nightsOff.js)
// scripts/check-shutdowns.mjs checks it before the site deploys.
import { parseShutdowns } from "./shutdowns.js";
import { parseNightsOff } from "./nightsOff.js";

export const SCHEDULE_FILE = "shift-schedule.yaml";

/**
 * The schedule's lists, in the order written. A missing file ("") has none.
 * @returns {{ shutdowns: import("./shutdowns.js").Shutdown[], nightsOff: import("./nightsOff.js").NightsOff[] }}
 */
export const parseSchedule = (text) => ({ shutdowns: parseShutdowns(text), nightsOff: parseNightsOff(text) });
