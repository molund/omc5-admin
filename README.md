# Clipper Status Desk (omc5-admin)

An iPhone app for posting Clayton Clipper updates from the construction site. On walks with Piper, Mike records where
the gantry is, how far the span has got, notes and photos, and pushes them straight to the site's `status.yaml` from the
phone. It's the admin app for [molund/omc5](https://github.com/molund/omc5) (the Clayton Clipper site) and lives in this
repo, apart from the site's. It's built with Expo (React Native) and styled with Tailwind (twrnc).

The same app also runs as an artifact in the Claude app, through react-native-web. That's secondary: it's used only when
making changes to the app itself from the Claude iPhone app.

- [Using the desk](#using-the-desk): modes, titles, changing what's saved, desk.yaml
- [How changes reach the site](#how-changes-reach-the-site): the desk's copy, pushing from the phone and from the Claude
  app, photos
- [Development](#development): running on an iPhone, building the artifact, tests and formatting
- [Code layout](#code-layout)

Further reading: [`src/lib/VELOCITY.md`](src/lib/VELOCITY.md) (every assumption behind the velocity) and
[`docs/push-session.md`](docs/push-session.md) (what the Claude Code push session does).

## Using the desk

### Modes

| Mode          | What it writes                                                  | The card shows                   |
| ------------- | --------------------------------------------------------------- | -------------------------------- |
| **Position**  | `updated`, `span`, `hung`                                       | no text, a Trackside button      |
| **Update**    | the same, plus a note: title, summary, photos and paragraphs    | the summary, Comments            |
| **Blog post** | a note keyed by date alone, with `post: true`                   | unchanged                        |
| **Addendum**  | a `follow-up` under an update, and `updated` if it's the newest | the addendum's summary, Comments |

- **Blog post** isn't a tab of its own: it's Update with its Blog post switch on.
- **Addendum** picks today's or yesterday's update (the newest by default), then adds an addendum or edits one it has.
  It can move the gantry too. The tab is off when there's no such update.
- **The card** follows its new rule: an entry shows on it only when its time stamp equals `updated`. That rule needs a
  change to `src/ProgressCard.svelte` on the site; until then, the live card keeps showing the newest update's latest
  text.

### Titles

A note stores one title, the value after its time stamp. It's the date title ("Clayton Clipper construction update for
Thursday, Nov. 5, 2026") unless you write your own, on any update, even with others on its day. What it feeds:

| What                  | Where it comes from                                                                                |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| The heading on a page | A status update's time stamp ("Nov 5, 2026 at 10:00 a.m."), never its title; a blog post's title   |
| The `?post=` address  | The title when the note is saved (`construction-update-for-thursday-nov-5-2026`, then `-2` and on) |
| The link preview      | The title, as written (Open Graph)                                                                 |

### Changing what's saved

The **Entries** page, reached by the link under the tabs, lists every update, blog post, addendum and position record,
newest first. (A position record is a `desk.yaml` entry with no post at its time stamp, or a note with no summary.) Tap
one to edit or delete it. An edit or delete is an ordinary change: it's reviewed, waits in the list, becomes one commit,
and can be discarded until it's pushed.

- **Time stamps** are locked on updates and blog posts, because the site builds their comment thread's title and page
  anchor from them. To really move one, delete it and post it again. An addendum can still be moved: its comments are
  its parent's.
- **Addresses:** the site works out `?post=` addresses from titles, and a repeated title gets `-2` by age. An edit or
  delete that would change any note's address writes a `slug:` that keeps it.
- **The card:** deleting what the card shows moves `updated` back to the newest time left (a status update, an addendum
  or a position, not a blog post). Span and Hung don't change; use Position for those.
- **Steps:** an entry's stage loads into the step picker. Deleting an entry takes its `desk.yaml` record with it.
- **What stays behind:** a deleted post's comment thread stays on GitHub with nothing linking to it, and its address
  stops working. Photo files stay in the repo, whether a photo is removed or its post deleted, because the site's
  landing check doesn't let the desk delete photos. For the same reason a published photo's file name can't be edited,
  so Replace on a published photo adds the new one under a new name, keeping the caption and its place in the post.

A **waiting change** can be reopened with Edit in the waiting list, or by tapping it under Entries. It opens in its
usual editor and keeps its place in the list, so its commit does too. The draft isn't saved: Cancel, or closing the app,
leaves the change as it was. Deletes have nothing to edit, only Discard.

### desk.yaml: notes to self, gantry steps and the velocity

The desk keeps its own records in `desk.yaml` in molund/omc5, beside `status.yaml`. The site's pages don't read it (its
build reads only the velocity, for the card's chart). Entries are keyed by time stamps, like the notes, and each can
have the span it's about, the step of the gantry's cycle it reports (`docs/gantry-cycle.md` in molund/omc5) and a note
to self. A change writes both files in the same commit.

- **Notes to self.** Every entry can have one. Update (and a blog post) writes the new entry's, starting from the note
  of a position already at the same time stamp; Addendum edits its parent's; Position writes one at its own time stamp.
  Empty text removes it.
- **Gantry step.** Position, Update and Addendum have a step picker. It's off until "Report a step" is switched on, so
  an entry doesn't report a step by accident. It then starts at the furthest step the rules find in what you write
  (`src/lib/stages.js`: "moved to span 38", "fully glued", "started moving its supports" and so on); drag it to change
  it. It can't go earlier than the furthest step already posted for the span, or than "hung" once the span is hung. A
  move logs "arrived at span" by itself, and marking a span hung logs "hung". In the Claude app, "Ask Claude" reads the
  text for wording the rules don't know (the artifact's `sample` capability).
- **Velocity.** The panel under the desk copy shows spans per week: how far the gantry got in the week up to the step
  reported most recently, part-spans included, with the weekly shutdown (Saturday 6 p.m. to Sunday 6 p.m.) allowed for.
  Opened, it shows each stage's share of the cycle, how long the gantry has been on its span, and each step with the
  working time to the next, logged or estimated. Every push writes the figure and its values over the past 96 hours to
  `desk.yaml`, and a copy of the figure to `status.yaml`. The calculation is in `src/lib/velocity.js`; every assumption
  is in [`src/lib/VELOCITY.md`](src/lib/VELOCITY.md).

## How changes reach the site

### The desk's copy and its waiting changes

- **The desk's own copy of `status.yaml` and `desk.yaml` is its database.** On the phone it's read from main on GitHub
  (the repo is public, so no token), checked every minute and kept for when the phone is offline. In the Claude app it's
  published with the artifact, and `copy.json` says which commit of main it came from.
- **Saving adds a change to a list on the device** (the phone's SQLite key-value store, or browser storage in the Claude
  app). Every screen shows the copy with the list applied. Drafts and photos are kept there too, until they're pushed.
- **Refresh from main** reads the copy again. Waiting changes stay on top of the new copy.
- Each change is applied with the same code wherever it's pushed from: `src/lib/changes.js` for `status.yaml` and
  `src/lib/deskChanges.js` for `desk.yaml`. A change that no longer fits main (its update is gone, say) is skipped and
  stays waiting, marked.

### Pushing from the phone

Push asks for Face ID, then, through GitHub's API:

1. reads main's `status.yaml` and `desk.yaml` at main's latest commit;
2. applies each waiting change to them, in order, and makes each its own commit with its photos and `desk.yaml`, by
   "Mike Olund (Status Desk)";
3. points the `desk` branch at the last commit.

The site's "Land Status Desk changes" workflow (`.github/workflows/desk.yml` in molund/omc5) then checks that the
commits only change `status.yaml` and `desk.yaml` and add photos (JPEG, at most 1024 px wide, no metadata), formats and
builds the site, moves main up to them, and starts the deploy with a `desk-pushed` event. The desk follows both runs:
"Landing on main", then "deploying" and "Live on the site". When the landing succeeds it drops the changes and reads
main again, and a new push can go while the site deploys. When either run fails it says so and links to the run; a
failed landing keeps the changes. It checks only while the desk is on screen, and checks at once when it comes back.

**The token.** The phone pushes with Mike's fine-grained GitHub token: repository `molund/omc5` only, **Contents: read
and write** and **Actions: read-only**, nothing else (not Workflows), with an expiry date.

- Paste it under the gear (Settings). "Check and save" refuses a classic token, checks the token can see the repo and
  reads when it expires.
- It's kept in the iPhone's Keychain (expo-secure-store), on this device only (not in iCloud Keychain or backups), saved
  so that reading it needs Face ID. The desk keeps only its last four characters and expiry date, to show, and warns a
  week before the token expires.
- Actions: read-only lets the desk follow a push's runs with the token Face ID unlocked for it, kept in memory only
  until the push is done: every 5 seconds, under GitHub's limit of 5,000 requests an hour. Without it, the desk follows
  the push without a token, every 15 seconds, under the limit of 60.
- The token can write any file in the repo apart from workflows. The workflow is what limits a push to `status.yaml`,
  `desk.yaml` and photos, and a push to main with the token directly would skip it. If the phone is lost, revoke the
  token on GitHub.

### Pushing from the Claude app

The desk can't reach GitHub from the Claude app. So Push saves `outbox.json` (the changes, in order) and the new photos
under `outbox/photos/` into the desk's own artifact. Then it starts the "Answer the Status Desk" scheduled task
(`pushTrigger` in `desk.config.json`) through the Claude Code Remote connector (the artifact's `mcp` capability,
`fire_trigger` only; the Claude app asks the first time). That wakes the Claude Code session the task is bound to (the
"Admin tool push state" chat, which has both repositories), and the session follows
[`docs/push-session.md`](docs/push-session.md):

1. pulls main;
2. applies each change, in order, to main's `status.yaml` and `desk.yaml` with `tools/apply-changes.mjs`;
3. runs Prettier and `npm run build`, then makes one commit per change, as Mike Olund (Claude app);
4. pushes;
5. republishes the desk with main's new `status.yaml` and `desk.yaml`, `copy.json` (with `handled`: the request's id)
   and `pushed.json` (the ids it committed), and removes the outbox.

The desk reloads with the new copy and drops the changes listed in `pushed.json`. Refresh from main saves a refresh
request the same way.

- If the desk can't save to itself (opened outside the Claude app, say), it offers the request as text to paste into a
  new Claude Code chat.
- If it saved the request but couldn't start the session, it says why, with "Start Claude Code again" and a line to
  paste into a new chat instead.

### Photos

Photos are resized on the device to at most 1024 px wide and saved as a JPEG at quality 85, with the metadata stripped
(location, camera, time). They wait with the changes, and a push adds them under
`public/images/sorry-im-a-shitty-photographer/` in molund/omc5.

## Development

```
npm install
npm test               # node --test test/*.test.mjs
npm run format:check   # Prettier, 120 characters wide (.prettierrc); npm run format to fix
```

Format every changed file with Prettier before committing. `test/fixtures/` holds verbatim copies of files from
molund/omc5 and is never formatted (see `.prettierignore`). The commit rules are in [`CLAUDE.md`](CLAUDE.md).

### On an iPhone

It's an Expo project (React Native on iOS). With Xcode installed and an iPhone in Developer Mode, plugged in:

```
npm run ios            # expo run:ios: builds with Xcode and installs on the phone
```

Sign in with an Apple ID under Xcode's signing settings the first time; the signing team is in `app.json`. With a free
Apple ID the app has to be rebuilt every 7 days. The iOS bundle can be checked without a phone with
`npx expo export --platform ios`.

### The Claude app artifact

```
node scripts/build.mjs --status path/to/status.yaml --commit <sha>
```

`desk.yaml` is copied from beside `status.yaml`. Then publish `dist/index.html` as the artifact page, with `app.js`,
`status.yaml`, `desk.yaml`, `copy.json` and `tools/apply-changes.mjs` beside it, and the source under `source/`. Its
capabilities:

| Capability | What for                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------ |
| `artifact` | the desk saves its outbox into itself                                                      |
| `sample`   | "Ask Claude" for the gantry steps                                                          |
| `mcp`      | `{servers: [{server: "Claude Code Remote", tools: ["fire_trigger"]}]}`: starts the session |

### Platform files

Each platform need has one file per platform, in `src/platform/` and for a few components (`Icon`, `Sparkline`, `RichInput`, `KeyboardBar`). The app
imports it without an extension: the web build (esbuild) picks `.web.js` and Expo's Metro picks `.native.js`. The two
files of a pair have the same shape.

### Names in the app and in the code

What the app calls something can differ from its name in the code and the files. That's allowed, as long as it's listed
here. Look here before renaming anything, and add a row when a new difference appears.

| In the app        | In the code and the files                                                                                   | Why the difference                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **Addendum**      | `followup`: change kinds (`followup`, `followup-edit`), `FollowUpScreen`, `followUps`; the `follow-up:` key | the site and status.yaml say follow-up; the app says Addendum so it reads differently from Update |
| **Working notes** | `NoteToSelf`, `noteToSelf`; desk.yaml's `note:` key (the old `note-to-self:` is still read)                 | the code's name is from when it was a note to self; so was the key, when it lived in status.yaml  |
| **GitHub sync**   | `Outbox`, and "the desk's copy" in comments                                                                 | the panel is the desk's copy of main, its waiting changes and the push; the code's name is older  |

The wording the desk writes for you follows the app: the suggested commit messages say "addendum", while the files they
change still have `follow-up:`. Storage keys from before Home (`mode`, `blog`, `draft.edit`) are no longer read.

## Code layout

Each file starts with a comment saying what it's for.

| Path                       | What it is                                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `index.js`, `index.web.js` | the entries: Expo's on iOS, react-native-web's in the Claude app                                                      |
| `desk.config.json`         | the artifact's URL, the repo and the push session's scheduled task                                                    |
| `src/App.js`               | the tabs, the review and the outbox                                                                                   |
| `src/screens/`             | one per tab and page                                                                                                  |
| `src/components/`          | the pieces the screens share                                                                                          |
| `src/lib/`                 | the files, the changes and the rules: plain JavaScript, no React, shared by the app, both kinds of push and the tests |
| `src/state/desk.js`        | the desk's copy, the waiting changes, drafts and photos                                                               |
| `src/services/`            | pushing (from the phone and from the Claude app) and Ask Claude                                                       |
| `src/platform/`            | one file per platform (see Platform files above)                                                                      |
| `src/theme/`               | the site's colours for twrnc                                                                                          |
| `tools/apply-changes.mjs`  | the push session's CLI                                                                                                |
| `scripts/`, `web/`         | the artifact's build and its page                                                                                     |
| `test/`                    | `node --test` suites; `fixtures/` holds verbatim copies from molund/omc5                                              |
| `docs/push-session.md`     | what the push session does with a request                                                                             |
