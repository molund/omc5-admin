# Clipper Status Desk (omc5-admin)

A little CMS for the Clayton Clipper site's `status.yaml` (molund/omc5). It's a React Native app styled with Tailwind
(twrnc). It runs in the Claude app as an artifact, through react-native-web. It's the admin app for
[molund/omc5](https://github.com/molund/omc5) (the Clayton Clipper site) and lives in this repo, apart from the site's.

## Modes

| Mode          | What it writes                                                                                              | The card                                           |
| ------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Position**  | `updated`, `span`, `complete`                                                                               | no text, a Trackside button                        |
| **Update**    | the same, plus a note: title, summary, photos and paragraphs                                                | the summary, Comments                              |
| **Follow-up** | a follow-up under an update or blog post (or an edit of one), and `updated` if it's the newest; can move too | the follow-up's summary, Comments                  |
| **Blog**      | a note keyed by date alone, with `post: true`                                                               | unchanged                                          |

The card column follows the card's new rule: an entry shows on the card only when its time stamp equals `updated`. That
rule needs a change to `src/ProgressCard.svelte` on the site. Until then, the live card keeps showing the newest update's
latest text.

## Note to self

Every entry (an update or a blog post) can have one note to self: a `note-to-self:` line right under its key line in
`status.yaml`. It's only in the repo; the site's reader ignores it, so it never reaches Trackside or the card. It's on all
four tabs. Update and Blog write the new entry's. Follow-up edits its parent's. Follow-ups and blocks have none. Empty text removes
the line.

Position needs none. If you add one, Position creates an entry for it: a note at the position's time stamp, with an empty
title, no summary and the note to self. The site only shows notes that have a summary, so that entry never appears on
Trackside, the progress card, the sitemap or the giscus comments (the same as the workflow's `note: "-"`).

## How it keeps and pushes changes

- **The desk's own copy of status.yaml is its database.** The copy is published with the artifact as `status.yaml`, and
  `copy.json` says which commit of main it came from.
- **Saving adds a change to a list on this device** (browser storage). Every screen shows the copy with the list applied.
  Drafts and photos are kept there too, until they're pushed.
- **Push syncs first.** The desk can't reach GitHub or start a Claude Code session itself (the Claude app won't load the
  Claude Code Remote connector for an artifact). So Push saves `outbox.json` (the changes, in order) and the new photos
  under `outbox/photos/` into the desk's own artifact. That republish wakes the Claude Code session that watches the desk
  (the "Status.yaml block editor" chat), which:
  1. pulls main;
  2. applies each change, in order, to main's `status.yaml` with `tools/apply-changes.mjs` (the same code as the desk);
  3. runs Prettier and `npm run build`, then makes one commit per change, as Mike Olund (Claude app);
  4. pushes;
  5. republishes the desk with main's new `status.yaml`, `copy.json` (with `handled`: the request's id) and `pushed.json`
     (the ids it committed), and removes the outbox.

  The desk reloads with the new copy and drops the changes listed in `pushed.json`. A change that no longer fits main (its
  update is gone, say) is skipped and stays in the list, marked.
- **Refresh from main** saves a refresh request the same way. Waiting changes stay on top of the new copy.
- If the desk can't save to itself (opened outside the Claude app, say), it offers the request as text to paste into
  that chat.
- Photos are resized in the browser (at most 800 px wide, JPEG quality 75, no metadata). On push they go into the outbox,
  and the session copies them into `public/images/sorry-im-a-shitty-photographer/`.

## Layout

```
index.js                     React Native entry (AppRegistry)
src/App.js                   the four modes, the review, the outbox
src/screens/                 MoveScreen, UpdateScreen, FollowUpScreen, BlogScreen
src/components/              ui (panels, buttons, segmented control, fields), GantryControls, TimeStampField,
                             TitleField, BlockEditor, CardPreview, StyleHints, ReviewSheet, Outbox
src/lib/                     plain JS, no React: statusFile (reads status.yaml with line ranges), changes (splices a change
                             in), titles (date titles, headlines, slugs), time (BC time), card (the card rule), styleHints
src/state/desk.js            the copy, the waiting changes, drafts and photos
src/services/outbox.js       Push and Refresh: the request saved into the desk's outbox
src/platform/*.web.js        the web half of each platform need: storage, photos, theme, Claude capabilities
src/theme/tw.js              twrnc with the site's colours, light and dark under the same names
tools/apply-changes.mjs      the push session's CLI around src/lib/changes.js
test/changes.test.mjs        each kind of change, read back with the site's own reader
web/index.html               the artifact's page
scripts/build.mjs            esbuild: dist/index.html, dist/app.js, dist/tools/apply-changes.mjs
desk.config.json             the artifact's URL and the repo
```

A native build (Expo) would replace each `src/platform/*.web.js` with a `.native.js` file of the same shape (for example,
expo-image-picker for photos). Nothing else changes.

## Build

```
npm install          # .npmrc sets legacy-peer-deps: react-native-web stands in for react-native
npm test
node scripts/build.mjs --status path/to/status.yaml --commit <sha>
```

Then publish `dist/index.html` as the artifact page, with `app.js`, `status.yaml`, `copy.json` and
`tools/apply-changes.mjs` beside it. Its one capability is `artifact` (the desk saves its
outbox into itself). The source is published with it under `source/`.
