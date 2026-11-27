// Trackside: the starred updates and blog posts together (Featured, the first tab), every update, or every blog post (a tab each), newest first, each with its comments setting (On, Off or Read-only) and how many
// comments it has on the site's comment server (services/remark42.js), and its star: whether it's featured on Trackside
// (/trackside/'s scroll shows it once it's older than the newest 10, which are always shown; an update only with
// `featured: true`, a blog post unless it has `featured: false`). Change any
// of them, then send them all together as one change (`comments` in lib/changes.js). The filters show the posts by their
// saved comments setting, or just the ones changed here, and Featured only (not on the Featured tab) narrows any of them to the saved featured ones; the eye opens a preview (the photo, summary and addendums) that steps through the list. Off can't be picked for a
// post with comments: they'd vanish from Trackside while still on the server, so they're deleted there first.
import { useEffect, useMemo, useState } from "react";
import { Image, Modal, Pressable, ScrollView, Text, View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk, useDraft } from "../state/desk.js";
import { listEntries } from "../lib/entries.js";
import { clock, pageHeading, parseKey } from "../lib/time.js";
import { isDateTitle, slugsOf } from "../lib/titles.js";
import { commentCounts, photoUrl } from "../services/remark42.js";
import { Body, Button, Checkbox, Link, Notice, Segmented } from "../components/ui.js";
import { Icon } from "../components/Icon";
import { SafeArea } from "../components/SafeArea";

const LABEL = { on: "On", off: "Off", readonly: "Read-only" };
// /trackside/ always shows this many of the newest updates and blog posts, featured or not (PAGE_SIZE in molund/omc5's
// trackside/TracksidePage.svelte)
const NEWEST = 10;
const FILTERS = ["on", "off", "readonly"];

const looks = (tw) => ({
  row: tw`gap-2.5 border-b border-line bg-panel px-3 py-3`,
  // a row changed here: a stripe in the accent colour down its left
  changed: [tw`border-l-4 pl-2`, { borderLeftColor: tw.color("accent") }],
  heading: tw`text-sm font-semibold leading-snug text-ink`,
  headline: tw`text-sm leading-snug text-ink`,
  meta: tw`text-xs text-mute`,
  changedNote: tw`text-xs font-semibold text-accent`,
  // the small name over each of a row's two settings
  settingName: tw`text-xs font-semibold text-mute`,
  eye: tw`h-11 w-11 items-center justify-center rounded-lg border border-line bg-panel`,
  // the note on the newest 10, which the star doesn't change yet
  newestNote: tw`text-xs italic text-mute`,
  list: tw`overflow-hidden rounded-lg border border-line`,
  bar: tw`gap-2.5 rounded-lg border border-line bg-panel p-3`,
  barCount: tw`text-sm font-semibold text-ink`,
  // the filters, inset as far as a row's own setting is (the list's 1-point border, then the row's px-3), so On, Off and
  // Read-only line up exactly with every row's
  filterInset: [tw`px-3`, { marginHorizontal: 1 }],
  // the filters as one control: On, Off and Read-only over All and Changed, one of the five picked; All and Changed are
  // views rather than settings, so their row is lighter, in the link colour
  grid: tw`overflow-hidden rounded-md border border-button-line bg-button-bg`,
  gridBottom: tw`border-t border-button-line bg-panel`,
  cell: tw`min-h-7 items-center justify-center px-1`,
  cellLine: tw`border-l border-button-line`,
  cellOn: tw`bg-accent`,
  cellText: tw`text-xs font-semibold text-button-ink`,
  cellTextOn: tw`text-xs font-semibold text-accent-ink`,
  cellTextView: tw`text-xs font-semibold text-link`,
  // Featured | Updates | Blog posts: tabs, underlined in the accent colour when picked, so they don't look like the filters under them
  tabs: tw`border-b border-line`,
  tab: tw`min-h-10 justify-center border-b-4 border-transparent px-0.5`,
  tabOn: [tw`border-b-4`, { borderBottomColor: tw.color("accent") }],
  tabText: tw`text-base font-semibold text-mute`,
  tabTextOn: tw`text-base font-bold text-ink`,
  // the preview: a card over the list dimmed
  // the dimming is the dark theme's background colour (theme/tw.js) at 90%
  backdrop: [tw`px-4 pt-4 pb-5`, { backgroundColor: "rgba(20, 24, 28, 0.9)" }],
  // the whole height of the window: the arrows at the top and the setting at the bottom stay put, the post scrolls between
  card: [tw`overflow-hidden rounded-xl bg-panel`, { width: "100%", maxWidth: 560, flex: 1 }],
  dim: tw`opacity-40`,
  cardTop: tw`border-b border-line px-3 py-2.5`,
  step: tw`h-11 w-11 items-center justify-center rounded-full border border-button-line bg-button-bg`,
  position: tw`text-sm font-semibold text-mute`,
  cardBody: tw`gap-2.5 px-4 pt-4 pb-2`,
  cardHeading: tw`text-lg font-bold leading-snug text-ink`,
  cardHeadline: tw`text-sm leading-snug text-mute`,
  photo: tw`h-56 w-full rounded-lg bg-code`,
  summary: tw`text-sm leading-relaxed text-ink`,
  addendums: tw`gap-2.5 border-t border-dashed border-line pt-2.5`,
  addendumsLabel: tw`text-xs font-semibold text-mute`,
  thumb: tw`h-14 w-20 rounded-md bg-code`,
  addendumTime: tw`text-xs font-semibold text-accent`,
  addendumText: tw`text-sm leading-snug text-ink`,
  cardFoot: tw`gap-2.5 border-t border-line px-4 py-3`,
});

/** What Trackside shows for it: a blog post's title; an update's date and time, with its headline unless it's the date title. */
function named(note) {
  const post = note.fields.post;
  const day = pageHeading(note.key).split(" at ")[0];
  const headline = !post && note.title && !isDateTitle(note.title) ? note.title : "";
  return {
    heading: post ? note.title : pageHeading(note.key),
    headline,
    meta: post ? `Blog post · ${day}` : "Update",
  };
}

const countLabel = (n) => (n == null ? "Comments not loaded" : n === 1 ? "1 comment" : `${n} comments`);

/** The note's photo and its blocks' photos, in order. */
const photosOf = (fields) => [fields.photo?.file, ...fields.block.map((b) => b.photo?.file)].filter(Boolean);

/** On · Off · Read-only for one post; Off is greyed out while it has comments, or before its count is known. */
function Setting({ value, onChange, count }) {
  const options = ["on", "off", "readonly"].map((v) => ({
    value: v,
    label: LABEL[v],
    disabled: v === "off" && value !== "off" && count !== 0,
  }));
  return <Segmented options={options} value={value} onChange={onChange} />;
}

/** The star, for one post: outlined when it isn't featured on Trackside, filled in gold when it is; a press flips it. */
function Star({ value, onChange, heading }) {
  const { tw, colors } = useTw();
  const s = useMemo(() => looks(tw), [tw]);
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={`Feature ${heading} on Trackside`}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={({ pressed }) => [s.eye, pressed && tw`opacity-60`]}
    >
      <Icon name={value ? "starFilled" : "star"} color={value ? colors.date : colors.mute} size={20} />
    </Pressable>
  );
}

/** A setting with its name over it. */
function Named({ name, children }) {
  const { tw } = useTw();
  const s = useMemo(() => looks(tw), [tw]);
  return (
    <View style={tw`gap-1`}>
      <Text style={s.settingName}>{name}</Text>
      {children}
    </View>
  );
}

function Preview({ note, place, onStep, value, onChange, count, featured, onFeatured, onClose }) {
  const { tw, colors } = useTw();
  const s = useMemo(() => looks(tw), [tw]);
  const { heading, headline, meta } = named(note);
  const photo = photosOf(note.fields)[0];
  const step = (by, label, icon, off) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: off }}
      disabled={off}
      onPress={() => onStep(by)}
      style={[s.step, off && s.dim]}
    >
      <Icon name={icon} color={colors["button-ink"]} size={20} />
    </Pressable>
  );
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <SafeArea style={[tw`flex-1 items-center`, s.backdrop]}>
        <View style={s.card}>
          <View style={[tw`flex-row items-center justify-between`, s.cardTop]}>
            <View style={tw`flex-row items-center gap-2`}>
              {step(-1, "Previous", "chevronLeft", place.at <= 0)}
              {place.at >= 0 && <Text style={s.position}>{`${place.at + 1} of ${place.of}`}</Text>}
              {step(1, "Next", "chevronRight", place.at >= place.of - 1)}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={s.step}>
              <Icon name="close" color={colors.ink} size={20} />
            </Pressable>
          </View>
          <ScrollView style={tw`flex-1`} contentContainerStyle={s.cardBody}>
            <Text style={s.meta}>{meta}</Text>
            <Text style={s.cardHeading}>{heading}</Text>
            {!!headline && <Text style={s.cardHeadline}>{headline}</Text>}
            {photo && <Image source={{ uri: photoUrl(photo) }} resizeMode="cover" style={s.photo} />}
            <Text style={s.summary}>{note.fields.summary}</Text>
            {/* the paragraphs and photos under it, in order; the photo already shown at the top isn't shown twice */}
            {note.fields.block.map((b, i) =>
              b.photo?.file
                ? b.photo.file !== photo && (
                    <Image key={i} source={{ uri: photoUrl(b.photo.file) }} resizeMode="cover" style={s.photo} />
                  )
                : !!b.text && (
                    <Text key={i} style={s.summary}>
                      {b.text}
                    </Text>
                  ),
            )}
            {note.followUps.length > 0 && (
              <View style={s.addendums}>
                <Text style={s.addendumsLabel}>
                  {note.followUps.length === 1 ? "1 addendum" : `${note.followUps.length} addendums`}
                </Text>
                {note.followUps.map((f) => {
                  const thumb = photosOf(f.fields)[0];
                  return (
                    <View key={f.key} style={tw`flex-row items-start gap-2.5`}>
                      {thumb && <Image source={{ uri: photoUrl(thumb) }} resizeMode="cover" style={s.thumb} />}
                      <View style={tw`flex-1 gap-0.5`}>
                        <Text style={s.addendumTime}>{clock(f.key)}</Text>
                        <Text style={s.addendumText}>{f.fields.summary}</Text>
                        {f.fields.block
                          .filter((b) => b.text)
                          .map((b, i) => (
                            <Text key={i} style={s.addendumText}>
                              {b.text}
                            </Text>
                          ))}
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </ScrollView>
          <View style={s.cardFoot}>
            <Body small>{`Comments · ${countLabel(count)}`}</Body>
            {count > 0 && value !== "off" && (
              <Body small mute>
                Off is available once its comments are deleted on Remark42.
              </Body>
            )}
            <Setting value={value} onChange={onChange} count={count} />
            <View style={tw`flex-row items-center gap-2.5`}>
              <Star value={featured} onChange={onFeatured} heading={heading} />
              <Body small>{featured ? "Featured on Trackside" : "Not featured on Trackside"}</Body>
            </View>
          </View>
        </View>
      </SafeArea>
    </Modal>
  );
}

export function TracksideScreen({ onReview }) {
  const { tw, colors } = useTw();
  const s = useMemo(() => looks(tw), [tw]);
  const desk = useDesk();
  // the settings changed here, by note key; kept on this device like any form's draft
  const [d, update, reset] = useDraft("comments", () => ({ changes: {}, stars: {} }));
  const changes = d.changes ?? {};
  const stars = d.stars ?? {};
  const [kind, setKind] = useState("featured");
  const [filter, setFilter] = useState("on");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [previewKey, setPreviewKey] = useState(null);

  const all = useMemo(
    () => listEntries(desk.parsed, desk.deskEntries).filter((e) => e.type === "update" || e.type === "blog"),
    [desk.parsed, desk.deskEntries],
  );
  const savedStar = (note) => note.fields.featured === true;
  // Featured: the starred ones (as saved, so one unstarred here stays in the list until it's sent)
  const ofKind = (k) => all.filter((e) => (k === "featured" ? savedStar(e.note) : e.type === k));
  const notes = ofKind(kind).map((e) => e.note);
  const allNotes = all.map((e) => e.note);
  const slugs = useMemo(() => slugsOf(desk.parsed.notes), [desk.parsed]);

  // the comment counts, once per visit: null until they come, and on failure
  const [counts, setCounts] = useState(null);
  const [countError, setCountError] = useState(null);
  useEffect(() => {
    let live = true;
    commentCounts(allNotes.map((n) => slugs.get(n.key)))
      .then((c) => live && setCounts(c))
      .catch((e) => live && setCountError(e.message));
    return () => {
      live = false;
    };
    // the list only matters on the way in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const countOf = (note) => (counts ? (counts.get(slugs.get(note.key)) ?? 0) : null);

  const saved = (note) => note.fields.comments ?? "on";
  const now = (note) => changes[note.key] ?? saved(note);
  const setTo = (note, value) => {
    const next = { ...changes };
    if (value === saved(note)) delete next[note.key];
    else next[note.key] = value;
    update({ changes: next, stars });
  };
  const nowStar = (note) => stars[note.key] ?? savedStar(note);
  const setStarTo = (note, value) => {
    const next = { ...stars };
    if (value === savedStar(note)) delete next[note.key];
    else next[note.key] = value;
    update({ changes, stars: next });
  };
  // the newest 10 updates and blog posts together, newest first, as /trackside/ counts them
  const newest = new Set(
    allNotes
      .map((n) => n.key)
      .sort((a, b) => parseKey(b) - parseKey(a))
      .slice(0, NEWEST),
  );
  const commentsChanged = (n) => changes[n.key] !== undefined && changes[n.key] !== saved(n);
  const starChanged = (n) => stars[n.key] !== undefined && stars[n.key] !== savedStar(n);
  const isChanged = (n) => commentsChanged(n) || starChanged(n);
  const changedKeys = notes.filter(isChanged);
  const matches = (f, n) =>
    (!featuredOnly || savedStar(n)) &&
    (f === "all" ? true : f === "changed" ? changedKeys.includes(n) : saved(n) === f);
  const shown = notes.filter((n) => matches(filter, n));
  const tally = (f) => notes.filter((n) => matches(f, n)).length;

  // what's sent: the changes on both tabs
  const change = {
    kind: "comments",
    settings: allNotes.filter(isChanged).map((n) => ({
      noteKey: n.key,
      ...(commentsChanged(n) && { comments: changes[n.key] }),
      ...(starChanged(n) && { featured: stars[n.key] }),
    })),
  };
  const count = change.settings.length;
  const review = () => onReview(change, { after: reset });

  const previewAt = shown.findIndex((n) => n.key === previewKey);
  const previewed = previewAt >= 0 ? shown[previewAt] : notes.find((n) => n.key === previewKey);

  const sendBar = (
    <View style={s.bar}>
      <View style={tw`flex-row items-center justify-between`}>
        <Text style={s.barCount}>
          {count === 0 ? "No changes yet" : count === 1 ? "1 change waiting" : `${count} changes waiting`}
        </Text>
        {count > 0 && <Button kind="link" small title="Undo all" onPress={() => update({ changes: {}, stars: {} })} />}
      </View>
      <Button
        kind="green"
        title={count === 0 ? "Review and send" : `Review and send ${count === 1 ? "1 change" : `${count} changes`}`}
        disabled={count === 0}
        onPress={review}
      />
    </View>
  );

  return (
    <View style={tw`gap-3`}>
      <View accessibilityRole="tablist" style={[tw`flex-row gap-5`, s.tabs]}>
        {[
          ["featured", "Featured"],
          ["update", "Updates"],
          ["blog", "Blog posts"],
        ].map(([k, label]) => {
          const on = kind === k;
          return (
            <Pressable
              key={k}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => {
                setKind(k);
                setPreviewKey(null);
              }}
              style={[s.tab, on && s.tabOn]}
            >
              <Text style={on ? s.tabTextOn : s.tabText}>
                {`${label} `}
                <Text style={s.tabText}>{ofKind(k).length}</Text>
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View accessibilityRole="tablist" style={s.filterInset}>
        <View style={s.grid}>
          {[FILTERS, ["all", "changed"]].map((line, r) => (
            <View key={r} style={[tw`flex-row`, r > 0 && s.gridBottom]}>
              {line.map((f, i) => {
                const on = filter === f;
                return (
                  <Pressable
                    key={f}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    onPress={() => setFilter(f)}
                    style={[tw`flex-1`, s.cell, i > 0 && s.cellLine, on && s.cellOn]}
                  >
                    <Text style={on ? s.cellTextOn : r > 0 ? s.cellTextView : s.cellText}>
                      {`${{ ...LABEL, all: "All", changed: "Changed" }[f]} ${tally(f)}`}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </View>
        {/* the Featured tab shows only the featured ones already */}
        {kind !== "featured" && <Checkbox value={featuredOnly} onChange={setFeaturedOnly} label="Featured only" />}
      </View>
      {countError && (
        <Notice tone="problem">{`Couldn't get the comment counts: ${countError} Off stays greyed out.`}</Notice>
      )}
      {count > 0 && (
        <Link title={`${count === 1 ? "1 change" : `${count} changes`} waiting · Review and send`} onPress={review} />
      )}

      {shown.length === 0 ? (
        <Body mute>Nothing here.</Body>
      ) : (
        <View style={s.list}>
          {shown.map((note) => {
            const { heading, headline, meta } = named(note);
            const changed = changedKeys.includes(note);
            return (
              <View key={note.key} style={[s.row, changed && s.changed]}>
                <View style={tw`flex-row items-start gap-3`}>
                  <View style={tw`flex-1 gap-0.5`}>
                    <Text style={s.heading}>{heading}</Text>
                    {!!headline && <Text style={s.headline}>{headline}</Text>}
                    <Text style={s.meta}>{`${meta} · ${countLabel(countOf(note))}`}</Text>
                    {newest.has(note.key) && <Text style={s.newestNote}>In the newest 10: shown anyway</Text>}
                  </View>
                  <Star value={nowStar(note)} onChange={(v) => setStarTo(note, v)} heading={heading} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Preview ${heading}`}
                    onPress={() => setPreviewKey(note.key)}
                    style={({ pressed }) => [s.eye, pressed && tw`opacity-60`]}
                  >
                    <Icon name="eye" color={colors.ink} size={20} />
                  </Pressable>
                </View>
                <Named name="Comments">
                  <Setting value={now(note)} onChange={(v) => setTo(note, v)} count={countOf(note)} />
                </Named>
                {changed && (
                  <View style={tw`flex-row items-center justify-between`}>
                    <Text style={s.changedNote}>
                      {`Changed from ${[
                        commentsChanged(note) && LABEL[saved(note)],
                        starChanged(note) && (savedStar(note) ? "Featured" : "Not featured"),
                      ]
                        .filter(Boolean)
                        .join(" · ")}`}
                    </Text>
                    <Button
                      kind="link"
                      small
                      title="Undo"
                      onPress={() => {
                        const c = { ...changes },
                          st = { ...stars };
                        delete c[note.key];
                        delete st[note.key];
                        update({ changes: c, stars: st });
                      }}
                    />
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}

      {sendBar}

      {previewed && (
        <Preview
          note={previewed}
          place={{ at: previewAt, of: shown.length }}
          onStep={(by) => shown[previewAt + by] && setPreviewKey(shown[previewAt + by].key)}
          value={now(previewed)}
          onChange={(v) => setTo(previewed, v)}
          count={countOf(previewed)}
          featured={nowStar(previewed)}
          onFeatured={(v) => setStarTo(previewed, v)}
          onClose={() => setPreviewKey(null)}
        />
      )}
    </View>
  );
}
