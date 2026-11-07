# Clipper Status Desk (omc5-admin)

An iPhone app for posting Clayton Clipper updates from the construction site. On walks with Piper, Mike records where the
gantry is, how far the span has got, notes and photos, and pushes them straight to the site's `status.yaml` from the
phone. It's the admin app for [molund/omc5](https://github.com/molund/omc5) (the Clayton Clipper site) and lives in this
repo, apart from the site's. It's built with Expo (React Native) and styled with Tailwind (twrnc).

The same app also runs as an artifact in the Claude app, through react-native-web. That's secondary: it's used only when
making changes to the app itself from the Claude iPhone app.

## Modes

| Mode          | What it writes                                                                                                                               | The card                          |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| **Position**  | `updated`, `span`, `hung`                                                                                                                    | no text, a Trackside button       |
| **Update**    | the same, plus a note: title, summary, photos and paragraphs                                                                                 | the summary, Comments             |
| **Follow-up** | a follow-up under today's or yesterday's update (or an edit of one), and `updated` if it's the newest; can move too; off with no such update | the follow-up's summary, Comments |
| **Blog post** | a note keyed by date alone, with `post: true` (Update, with its Blog post switch on)                                                         | unchanged                         |

The card column follows the card's new rule: an entry shows on the card only when its time stamp equals `updated`. That
rule needs a change to `src/ProgressCard.svelte` on the site. Until then, the live card keeps showing the newest update's
latest text.

## Titles

A note stores one title, the value after its time stamp. It's the date title ("Clayton Clipper construction update for
Thursday, Nov. 5, 2026") unless you write your own, on any update, even with others on its day. What it feeds:

| What                  | Where it comes from                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| The heading on a page | A status update's time stamp ("Nov 5, 2026 at 10:00 a.m."), never its title; a blog post's title   |
| The `?post=` address  | The title when the note is saved (`construction-update-for-thursday-nov-5-2026`, then `-2` and on) |
| The link preview      | The title, as written (Open Graph)                                                                 |

## Changing what's saved

The **Entries** page, reached by the link under the tabs, lists every update, blog post, follow-up and position record, newest first (a position record is a
`desk.yaml` entry with no post at its time stamp, or a note with no summary). Tap one to edit or delete it. An edit or delete
is an ordinary change: it's reviewed, waits in the list, becomes one commit, and can be discarded until it's pushed.

- **Time stamps:** locked on updates and blog posts, because the site builds their comment thread's title and page anchor
  from them. To really move one, delete it and post it again. A follow-up can still be moved: its comments are its parent's.
- **Addresses:** the site works out `?post=` addresses from titles, and a repeated title gets `-2` by age. An edit or delete
  that would change any note's address writes a `slug:` that keeps it.
- **The card:** deleting what the card shows moves `updated` back to the newest time left (a status update, a follow-up or a
  position, not a blog post). Span and Hung don't change; use Position for those.
- **Steps:** the slider holds the furthest step an entry reports, and any other steps it has stay listed, each with a Remove
  button, so editing an entry's words costs the velocity nothing. Deleting an entry takes its `desk.yaml` record with it.
- **What stays behind:** a deleted post's comment thread stays on GitHub with nothing linking to it, and its address stops
  working. Photo files stay in the repo, whether a photo is removed or its post deleted, because the site's landing check
  doesn't let the desk delete photos. A published photo's file name can't be edited, for the same reason, so Replace on a
  published photo adds the new one under a new name, keeping the caption and its place in the post.

A **waiting change** can be reopened with Edit in the waiting list, or by tapping it under Entries. It opens in its usual
editor and keeps its place in the list, so its commit does too. The draft isn't saved: Cancel, or closing the app, leaves the
change as it was. Deletes have nothing to edit, only Discard.

## desk.yaml: notes to self, gantry steps and the velocity

The desk keeps its own records in `desk.yaml` in molund/omc5, beside `status.yaml`. The site doesn't read it. Entries are
keyed by time stamps, like the notes, and each can have the span it's about, the steps of the gantry's cycle seen by then
(`docs/gantry-cycle.md` in molund/omc5) and a note to self. A change writes both files in the same commit.

- **Notes to self.** Every entry can have one. Update and Blog write the new entry's; Follow-up edits its parent's; Position
  writes one at its own time stamp. Empty text removes it.
- **Gantry step.** Position, Update and Follow-up have a "Gantry step" slider, and every entry about the gantry has exactly
  one stage (`stage:` in desk.yaml), never none. It starts at the furthest step the rules find in what you write
  (`src/lib/stages.js`: "moved to span 38", "fully glued", "started moving its supports" and so on), or at "arrived at span" when they
  find none; drag it to change it. With Hung on, the span is at "hung" at least: the slider goes there by itself and can't go
  earlier. In the Claude app, "Ask Claude" reads the text for wording the rules don't know (the artifact's `sample`
  capability).
- **Velocity.** The panel under the desk copy shows the working days per span over the last three spans, arrival to arrival,
  leaving out Saturday 6 p.m. to Sunday 6 p.m.; the spans per week that makes over a week's 6 working days, so the shutdown
  is allowed for; each stage's share of the cycle; how long the gantry has been on its span; and each step, with the working
  time from it to the next (`src/lib/velocity.js`). An arrival that wasn't logged is estimated from the steps
  that were. Recent gaps between steps, counted in shift hours (7 a.m. to 5 p.m. and 8 p.m. to 6 a.m.), give each stage's
  share, with stages known to follow closely held short, and the arrival is read off between the nearest steps either side.

## How it keeps and pushes changes

- **The desk's own copy of status.yaml and desk.yaml is its database.** The copy is published with the artifact as
  `status.yaml` and `desk.yaml`, and `copy.json` says which commit of main it came from.
- **Saving adds a change to a list on this device** (browser storage). Every screen shows the copy with the list applied.
  Drafts and photos are kept there too, until they're pushed.
- **Push syncs first.** The desk can't reach GitHub itself. So Push saves `outbox.json` (the changes, in order) and the
  new photos under `outbox/photos/` into the desk's own artifact. Then it starts the "Answer the Status Desk" scheduled
  task (`pushTrigger` in `desk.config.json`) through the Claude Code Remote connector (the artifact's `mcp` capability,
  `fire_trigger` only; the Claude app asks the first time). It wakes the Claude Code session the task is bound to (the
  "Admin tool push state" chat, which has both repositories), and that session follows `docs/push-session.md`:
  1. pulls main;
  2. applies each change, in order, to main's `status.yaml` and `desk.yaml` with `tools/apply-changes.mjs` (the same code
     as the desk);
  3. runs Prettier and `npm run build`, then makes one commit per change, as Mike Olund (Claude app);
  4. pushes;
  5. republishes the desk with main's new `status.yaml` and `desk.yaml`, `copy.json` (with `handled`: the request's id) and `pushed.json`
     (the ids it committed), and removes the outbox.

  The desk reloads with the new copy and drops the changes listed in `pushed.json`. A change that no longer fits main (its
  update is gone, say) is skipped and stays in the list, marked.

- **Refresh from main** saves a refresh request the same way. Waiting changes stay on top of the new copy.
- If the desk can't save to itself (opened outside the Claude app, say), it offers the request as text to paste into a
  new Claude Code chat. If it saved the request but couldn't start the session, it says why, with "Start Claude Code
  again" and a line to paste into a new chat instead.
- Photos are resized in the browser (at most 1024 px wide, JPEG quality 85, no metadata). On push they go into the outbox,
  and the session copies them into `public/images/sorry-im-a-shitty-photographer/`.

## Layout

```
index.js                     the native entry (iOS): Expo's registerRootComponent
index.web.js                 the web entry (the Claude app): react-native-web's AppRegistry
app.json                     the Expo app config
assets/icon.png              the app icon: the site's favicon (public/favicon.ico in molund/omc5) on its background colour
src/App.js                   the modes, the link to Entries, the review, the outbox
src/screens/                 MoveScreen, UpdateScreen, FollowUpScreen, BlogScreen, EntriesScreen,
                             SettingsScreen (the gear: the token)
src/components/              ui (panels, buttons, segmented control, fields), GantryControls, TimeStampField,
                             TitleField, BlockEditor, CardPreview, StyleHints, ReviewSheet, Outbox, EntryEditor (a saved
                             entry), WaitingEditor (a waiting change)
src/lib/                     plain JS, no React: statusFile (reads status.yaml with line ranges), changes (splices a change
                             in), deskFile and deskChanges (desk.yaml), cleanText (drops invisible characters before
                             anything is written), stages (the cycle's steps and the rules that find
                             them), velocity, titles (date titles, slugs), time (BC time), card (the card rule), styleHints,
                             writingPrompt (the AI prompt a field's icon copies), entries (the Entries list, reopening)
src/state/desk.js            the copy, the waiting changes, drafts and photos
src/services/outbox.js       Push and Refresh: the request saved into the desk's outbox, and the session started
src/services/stageAI.js      "Ask Claude" for the gantry steps in a piece of text (the Claude app only)
src/services/github.js       the phone's push: one commit per change on the desk branch, and following it onto main
src/services/phonePush.js    Face ID, the token from the Keychain, then github.js
src/platform/*.web.js        the web half of each platform need: storage, photos, theme, Claude capabilities, secrets
                             (the GitHub token: none on the web, the Keychain on the phone)
src/theme/tw.js              twrnc with the site's colours, light and dark under the same names
tools/apply-changes.mjs      the push session's CLI around src/lib/changes.js
test/changes.test.mjs        each kind of change, read back with the site's own reader
test/github.test.mjs         the phone's push, against a fake GitHub
test/desk.test.mjs           the stage rules, desk.yaml and the velocity
web/index.html               the artifact's page
scripts/build.mjs            esbuild: dist/index.html, dist/app.js, dist/tools/apply-changes.mjs
desk.config.json             the artifact's URL, the repo and the push session's scheduled task (pushTrigger)
docs/push-session.md         what the push session does with a request
```

A native build (Expo) would replace each `src/platform/*.web.js` with a `.native.js` file of the same shape (for example,
expo-image-picker for photos). Nothing else changes.

## Build

```
npm install
npm test
node scripts/build.mjs --status path/to/status.yaml --commit <sha>
```

`desk.yaml` is copied from beside `status.yaml`. Then publish `dist/index.html` as the artifact page, with `app.js`,
`status.yaml`, `desk.yaml`, `copy.json` and `tools/apply-changes.mjs` beside it. Its capabilities are `artifact` (the desk
saves its outbox into itself), `sample` ("Ask Claude") and `mcp`, with `{servers: [{server: "Claude Code Remote", tools:
["fire_trigger"]}]}` (it starts the push session). The source is published with it under `source/`.

## On an iPhone

It's an Expo project (React Native on iOS). With Xcode installed and an iPhone in Developer Mode, plugged in:

```
npm install
npm run ios          # expo run:ios: builds with Xcode and installs on the phone
```

Sign in with an Apple ID under Xcode's signing settings the first time. With a free Apple ID the app has to be rebuilt every
7 days.

What works on the phone:

- All the modes, the review step, drafts and waiting changes (kept in the phone's SQLite key-value store).
- Photos: picked from the library, then resized to at most 1024 px wide and saved as a JPEG at quality 85, which drops the
  original's metadata.
- The desk's copy of `status.yaml` is read from main on GitHub (the repo is public, so no token): at main's latest commit,
  kept for when the phone is offline. "Refresh from main" reads it again.
- Light and dark follow the phone's setting.

- **Pushing**, straight to GitHub with a fine-grained token (below).

### Pushing from the phone

The phone pushes with Mike's fine-grained GitHub token: repository `molund/omc5` only, **Contents: read and write** and
**Actions: read-only**, nothing else (not Workflows), with an expiry date. Actions: read-only lets the desk follow a push's
runs with the token Face ID unlocked for it, kept in memory only until the push is done: every 5 seconds instead of every
15, under GitHub's limit of 5,000 requests an hour instead of 60. Without it, GitHub refuses the token for that, and the
desk follows the push without one. Paste it under the gear (Settings); "Check and save" refuses a classic token,
checks the token can see the repo and reads when it expires. It's kept in the iPhone's Keychain (expo-secure-store), on
this device only (not in iCloud Keychain or backups), saved so that reading it needs Face ID. The desk keeps only its last
four characters and expiry date, to show; it warns a week before the token expires.

Push asks for Face ID, then, through GitHub's API:

1. reads main's `status.yaml` and `desk.yaml` at main's latest commit;
2. applies each waiting change to it, in order, with `src/lib/changes.js` (a change that no longer fits is skipped and stays
   waiting), and makes each its own commit with its photos and `desk.yaml`, by "Mike Olund (Status Desk)";
3. points the `desk` branch at the last commit.

The site's "Land Status Desk changes" workflow (`.github/workflows/desk.yml` in molund/omc5) then checks that the commits
only change `status.yaml` and `desk.yaml` and add photos (JPEG, at most 1024 px wide, no metadata), formats and builds the site, moves main up
to them, then starts the deploy with a `desk-pushed` event. The desk follows both runs (the repo is public, so no further
Face ID: with the push's token when it can, as above, else without one): "Landing on main" while the first runs, then "deploying" and "Live on the site". When the landing succeeds it
drops the changes and reads main again, and a new push can go while the site deploys; when either run fails it says so and
links to the run (a failed landing keeps the changes).

The token can write any file in the repo apart from workflows; the workflow is what limits a push to `status.yaml`, `desk.yaml`
and photos, and a push to main with the token directly would skip it. If the phone is lost, revoke the token on GitHub.

Each platform need has one file per platform in `src/platform/` and `src/components/Icon.*`: the app imports it without an
extension, and the web build (esbuild) picks `.web.js` while Expo's Metro picks `.native.js`.

`npm run ios` has not been run yet, so Face ID and the Keychain haven't been tried on a phone. The iOS bundle itself is checked with `npx expo export --platform ios`.
