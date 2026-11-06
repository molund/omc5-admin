// Time stamps in status.yaml are BC time, UTC−7 all year, written "2026-11-04T16:30-07:00" (a note's key can also be a
// date alone, "2026-11-04", which counts as the start of that day). Everything here works on those strings.

const OFFSET = -7 * 60; // minutes from UTC
const QUARTER = 15 * 60 * 1000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_SHORT = ["Sun", "Mon", "Tues", "Wed", "Thurs", "Fri", "Sat"];
// the site's titles abbreviate months AP style: "Oct.", "Nov.", but "May", "June", "July"
const MONTHS = ["Jan.", "Feb.", "March", "April", "May", "June", "July", "Aug.", "Sept.", "Oct.", "Nov.", "Dec."];

const pad = (n) => String(n).padStart(2, "0");

/** A Date shifted so its UTC fields read as BC time. */
const bc = (date) => new Date(date.getTime() + OFFSET * 60 * 1000);

/** Whether a key is a date alone. */
export const isDateOnly = (key) => /^\d{4}-\d\d-\d\d$/.test(key);

const KEY = /^(\d{4})-(\d\d)-(\d\d)(?:T(\d\d):(\d\d)(?::(\d\d)(?:\.(\d+))?)?(Z|[+-]\d\d:?\d\d)?)?$/;

/**
 * A key as a Date ("2026-11-04" is the start of that day, BC time). Read here rather than by the JavaScript engine's own date
 * parser, which isn't the same everywhere (iOS's Hermes, say). A time without a zone is BC time too.
 * @returns {Date} An invalid Date (NaN) if the key isn't a date or date and time.
 */
export function parseKey(key) {
  const m = KEY.exec(String(key).trim());
  if (!m) return new Date(NaN);
  const [, y, mo, d, h = "0", mi = "0", sec = "0", fraction = "0", zone] = m;
  const ms = Number(fraction.padEnd(3, "0").slice(0, 3));
  const [year, month, day, hour, minute, second] = [y, mo, d, h, mi, sec].map(Number);
  const inRange = month >= 1 && month <= 12 && hour < 24 && minute < 60 && second < 60;
  // a day that doesn't exist (Feb. 30) would roll into the next month
  if (!inRange || new Date(Date.UTC(year, month - 1, day)).getUTCDate() !== day) return new Date(NaN);
  let offset = OFFSET;
  if (zone === "Z") offset = 0;
  else if (zone) {
    const digits = zone.slice(1).replace(":", "");
    offset = (zone[0] === "-" ? -1 : 1) * (Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2)));
  }
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms) - offset * 60 * 1000);
}

/** A Date as a full key, "2026-11-04T16:30-07:00". */
export function toKey(date) {
  const d = bc(date);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(
    d.getUTCMinutes(),
  )}-07:00`;
}

/** The BC calendar day of a key or Date, "2026-11-04". */
export function dayOf(keyOrDate) {
  const d = bc(typeof keyOrDate === "string" ? parseKey(keyOrDate) : keyOrDate);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Now, rounded to the nearest quarter hour, as a full key. */
export function nowKey() {
  return toKey(new Date(Math.round(Date.now() / QUARTER) * QUARTER));
}

/** Today's BC date, "2026-11-04". */
export const todayKey = () => dayOf(new Date());

/** A key moved by some minutes (a date-only key moves by whole days, given as minutes). */
export function shiftKey(key, minutes) {
  const t = new Date(parseKey(key).getTime() + minutes * 60 * 1000);
  return isDateOnly(key) ? dayOf(t) : toKey(t);
}

/** "Tues": a key's BC (Vancouver) weekday, short. */
export const weekdayShort = (key) => WEEKDAYS_SHORT[bc(parseKey(key)).getUTCDay()];

/** "16:30": a key's BC (Vancouver) time on a 24-hour clock, no date. */
export function clock24(key) {
  const d = bc(parseKey(key));
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "4:30 p.m." */
export function clock(key) {
  const d = bc(parseKey(key));
  const h = d.getUTCHours();
  return `${h % 12 || 12}:${pad(d.getUTCMinutes())} ${h < 12 ? "a.m." : "p.m."}`;
}

/** "Wednesday, Nov. 4, 2026" */
export function longDate(key) {
  const d = bc(parseKey(key));
  return `${WEEKDAYS[d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** "Wed, Nov. 4, 2026", short enough for a field */
export function shortDate(key) {
  return longDate(key).replace(/^(\w{3})\w*/, "$1");
}

/** "Wed, Nov. 4, 2026 · 4:30 p.m.", or the date alone for a date-only key */
export function stamp(key) {
  return isDateOnly(key) ? shortDate(key) : `${shortDate(key)} · ${clock(key)}`;
}

/** A status update's heading on Trackside, which comes from its time stamp: "Nov 5, 2026 at 10:00 a.m." */
export const pageHeading = (key) =>
  `${longDate(key)
    .replace(/^\w+, /, "")
    .replace(/^([A-Za-z]{3})[a-z]*\.?/, "$1")} at ${clock(key)}`;

/** When the progress card says it's from, as the site words it (asOf(date, true) in its src/lib/status.js). */
export function cardAsOf(key) {
  if (!key) return "";
  const days = (n) => dayOf(new Date(Date.now() - n * 24 * 3600 * 1000));
  const day = dayOf(key);
  if (day === days(0)) return `${clock(key)} today`;
  if (day === days(1)) return `${clock(key)} yesterday`;
  if (day === days(2)) return `${clock(key)} on ${longDate(key).split(",")[0]}`;
  return `${clock(key)} on ${pageHeading(key).split(" at ")[0]}`;
}

/** A moment's BC date without the weekday, "Feb. 3, 2027". */
export const dateOf = (date) => longDate(dayOf(new Date(date))).replace(/^\w+, /, "");

/** "4:30 p.m. today", "4:30 p.m. yesterday" or "4:30 p.m. on Nov. 2, 2026", as the progress card words it. */
export function asOf(key) {
  if (!key) return "";
  const day = dayOf(key),
    today = todayKey(),
    yesterday = dayOf(new Date(Date.now() - 24 * 3600 * 1000));
  if (day === today) return `${clock(key)} today`;
  if (day === yesterday) return `${clock(key)} yesterday`;
  return `${clock(key)} on ${longDate(key).replace(/^\w+, /, "")}`;
}

/** Compare two keys by time: negative when a is earlier. */
export const compareKeys = (a, b) => parseKey(a) - parseKey(b);
