// The block editor: the summary first (it can't move), then paragraphs and photos in any order, with buttons to add more.
// Picking a photo resizes it and opens its caption field straight away.
import { useEffect, useMemo, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { useTw } from "../theme/tw.js";
import { useDesk } from "../state/desk.js";
import { pickPhoto, preparePhoto } from "../platform/photos";
import { slugify } from "../lib/titles.js";
import { parseStatus } from "../lib/statusFile.js";
import { photosOf } from "../lib/changes.js";
import { WRITES_FOLLOW_UP, WRITES_INTRO, WRITES_SECONDARY } from "../lib/writingPrompt.js";
import { Body, Button, Field, Label, Notice, Panel } from "./ui.js";

export const emptyBlocks = () => [{ type: "summary", text: "" }];

/** Every photo file named in the file, so a new one never takes an old one's name. */
function filesIn(parsed) {
  const out = new Set();
  for (const n of parsed?.notes ?? []) {
    for (const f of [n.fields, ...n.followUps.map((x) => x.fields)]) {
      if (f.photo?.file) out.add(f.photo.file);
      for (const b of f.block) if (b.photo?.file) out.add(b.photo.file);
    }
  }
  return out;
}

const cleanName = (s) =>
  s
    .toLowerCase()
    .replace(/\.(jpe?g|png|heic|webp)$/i, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

function Handles({ i, n, move, remove }) {
  const { tw } = useTw();
  const h = (t, f, l, off) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={l}
      disabled={off}
      onPress={f}
      style={[tw`h-8 w-8 items-center justify-center rounded-md`, off && tw`opacity-30`]}
    >
      <Text style={tw`text-base font-bold text-mute`}>{t}</Text>
    </Pressable>
  );
  return (
    <View style={tw`flex-row`}>
      {h("↑", () => move(i, -1), "Move up", i <= 1)}
      {h("↓", () => move(i, 1), "Move down", i >= n - 1)}
      {h("✕", () => remove(i), "Remove")}
    </View>
  );
}

const SITE_PHOTOS = "https://clayton-clipper.olund.ca/images/sorry-im-a-shitty-photographer/";

/** A photo already on the site, at its own shape. It can fail when offline, or before a push has been deployed. */
function SitePhoto({ file, caption }) {
  const { tw } = useTw();
  const uri = SITE_PHOTOS + encodeURIComponent(file);
  const [ratio, setRatio] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    setRatio(null);
    setFailed(false);
    Image.getSize(
      uri,
      (width, height) => live && setRatio(width / height),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [uri]);
  if (ratio && !failed)
    return (
      <Image
        accessibilityLabel={caption || "The photo"}
        source={{ uri }}
        onError={() => setFailed(true)}
        style={[tw`w-full rounded-md bg-code`, { aspectRatio: ratio }]}
        resizeMode="cover"
      />
    );
  return (
    <View style={tw`items-center justify-center rounded-md border border-dashed border-line bg-code py-6`}>
      <Body small mute>
        {failed ? "Already on the site, but it couldn't be loaded here." : "Loading the photo from the site…"}
      </Body>
    </View>
  );
}

/**
 * @param {object} props
 * @param {object[]} props.blocks
 * @param {(b: object[]) => void} props.onChange
 * @param {string} props.day "2026-11-04", for photo names
 * @param {string} props.nameHint The title or summary, for photo names
 * @param {boolean} [props.followUp] These blocks are a follow-up, for the fields' AI prompts
 */
export function BlockEditor({ blocks, onChange, day, nameHint, followUp }) {
  const { tw } = useTw();
  const desk = useDesk();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [fresh, setFresh] = useState(null); // the photo whose caption gets the focus
  // the photos in main's copy: one that isn't came in with a change still waiting to push, so it isn't on the site
  const onMain = useMemo(() => filesIn(desk.base == null ? null : parseStatus(desk.base)), [desk.base]);
  // such a photo's picture, kept with its waiting change: { [file]: photoId }
  const waiting = useMemo(() => {
    const out = {};
    for (const c of desk.changes ?? []) for (const ph of photosOf(c)) if (ph.photoId) out[ph.file] = ph.photoId;
    return out;
  }, [desk.changes]);

  const set = (i, patch) => onChange(blocks.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const move = (i, d) => {
    const j = i + d;
    if (j < 1 || j >= blocks.length) return;
    const out = [...blocks];
    [out[i], out[j]] = [out[j], out[i]];
    onChange(out);
  };
  const remove = (i) => {
    if (blocks[i].photoId) desk.dropPhotos([blocks[i].photoId]);
    onChange(blocks.filter((_, j) => j !== i));
  };

  function photoName() {
    const taken = filesIn(desk.parsed);
    for (const b of blocks) if (b.file) taken.add(b.file);
    const words =
      slugify(nameHint || "photo")
        .split("-")
        .slice(0, 6)
        .join("-") || "photo";
    let name = `${day}-${words}.jpg`,
      i = 2;
    while (taken.has(name)) name = `${day}-${words}-${i++}.jpg`;
    return name;
  }

  /** Picks and prepares a photo, then hands its new photoId to `use`. */
  async function withNewPhoto(use) {
    setError(null);
    const file = await pickPhoto();
    if (!file) return;
    setBusy(true);
    try {
      use(desk.addPhoto(await preparePhoto(file)));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const addPhoto = () =>
    withNewPhoto((photoId) => {
      onChange([...blocks, { type: "photo", photoId, file: photoName(), caption: "" }]);
      setFresh(photoId);
    });

  // a new picture in the same place, with the same caption. One not pushed yet keeps its name; one already on the site gets a
  // new one, because the desk can't change a file that's already there (the old file stays in the repo, as a removed one does)
  const replacePhoto = (i) =>
    withNewPhoto((photoId) => {
      const old = blocks[i];
      if (old.photoId) desk.dropPhotos([old.photoId]);
      set(i, { photoId, file: old.photoId ? old.file : photoName() });
    });

  return (
    <View style={tw`gap-2.5`}>
      {blocks.map((b, i) => {
        if (b.type === "summary")
          return (
            <Field
              key="summary"
              multiline
              heading="Summary"
              value={b.text}
              onChangeText={(text) => set(i, { text })}
              placeholder="What happened?"
              label="Summary"
              writes={followUp ? WRITES_FOLLOW_UP : WRITES_INTRO}
            />
          );
        if (b.type === "text")
          return (
            <Field
              key={b.k ?? `t${i}`}
              multiline
              heading="Paragraph"
              right={<Handles i={i} n={blocks.length} move={move} remove={remove} />}
              value={b.text}
              onChangeText={(text) => set(i, { text })}
              placeholder="More detail"
              label={`Paragraph ${i}`}
              writes={followUp ? WRITES_FOLLOW_UP : WRITES_SECONDARY}
            />
          );
        // a new photo's picture, or the waiting change's when the photo came in with one
        const p = desk.photos[b.photoId ?? waiting[b.file]] ?? null;
        return (
          <Panel key={b.photoId ?? b.file ?? `p${i}`}>
            <Label
              right={
                <View style={tw`flex-row items-center gap-1`}>
                  <Button
                    kind="link"
                    small
                    title={busy ? "Resizing…" : "Replace"}
                    disabled={busy}
                    onPress={() => replacePhoto(i)}
                  />
                  <Handles i={i} n={blocks.length} move={move} remove={remove} />
                </View>
              }
            >
              Photo
            </Label>
            {p ? (
              <Image
                accessibilityLabel={b.caption || "The new photo"}
                source={{ uri: p.dataUrl }}
                style={[tw`w-full rounded-md bg-code`, { aspectRatio: p.width / p.height }]}
                resizeMode="cover"
              />
            ) : b.photoId ? (
              <View style={tw`items-center justify-center rounded-md border border-dashed border-line bg-code py-6`}>
                <Body small mute>
                  This photo isn't on this device any more. Replace it to add it again.
                </Body>
              </View>
            ) : onMain.has(b.file) ? (
              <SitePhoto file={b.file} caption={b.caption} />
            ) : (
              <View
                style={tw`items-center justify-center rounded-md border border-dashed border-line bg-code px-3 py-6`}
              >
                <Body small mute>
                  This photo is in a change that hasn't been pushed, and its picture isn't on this device. Replace it to
                  add it again.
                </Body>
              </View>
            )}
            <Field
              multiline
              heading="Caption"
              value={b.caption}
              onChangeText={(caption) => set(i, { caption })}
              placeholder="What it shows"
              label="Caption"
              autoFocus={fresh === b.photoId}
              style={tw`min-h-14`}
            />
            <View style={tw`flex-row items-center gap-2`}>
              {/* a photo already on the site keeps its name: renaming it here wouldn't rename the file in the repo */}
              {b.photoId ? (
                <>
                  <View style={tw`flex-1`}>
                    <Field
                      small
                      mono
                      value={b.file.replace(/\.jpg$/, "")}
                      onChangeText={(t) => set(i, { file: `${cleanName(t) || "photo"}.jpg` })}
                      label="File name"
                      noPrompt
                      style={tw`py-1`}
                    />
                  </View>
                  <Body small mute>
                    .jpg{p ? ` · ${p.width} px · ${Math.round(p.bytes / 1024)} KB` : ""}
                  </Body>
                </>
              ) : (
                <Body small mute style={tw`font-mono`}>
                  {b.file}
                </Body>
              )}
            </View>
            {!b.caption.trim() && <Notice>Every photo gets a caption.</Notice>}
          </Panel>
        );
      })}
      {error && <Notice tone="problem">{error}</Notice>}
      <View style={tw`flex-row gap-2`}>
        <Button
          kind="dashed"
          title="+ Paragraph"
          style={tw`flex-1`}
          onPress={() => onChange([...blocks, { type: "text", text: "", k: `t${Date.now().toString(36)}` }])}
        />
        <Button
          kind="dashed"
          title={busy ? "Resizing…" : "+ Photo"}
          disabled={busy}
          style={tw`flex-1`}
          onPress={addPhoto}
        />
      </View>
    </View>
  );
}

/** What stops the blocks being saved. */
export function blockProblems(blocks) {
  const out = [];
  if (!blocks[0]?.text.trim()) out.push("Write the summary.");
  if (blocks.some((b) => b.type === "photo" && !b.caption.trim())) out.push("Every photo needs a caption.");
  return out;
}

/** A note's or follow-up's fields as blocks, for editing. */
export function blocksOf(fields) {
  const out = [{ type: "summary", text: fields.summary }];
  if (fields.photo?.file) out.push({ type: "photo", file: fields.photo.file, caption: fields.photo.caption });
  fields.block.forEach((b, i) =>
    out.push(
      b.photo
        ? { type: "photo", file: b.photo.file, caption: b.photo.caption }
        : { type: "text", text: b.text, k: `e${i}` },
    ),
  );
  return out;
}

/** The text of the blocks, for the style checks. */
export const blockTexts = (blocks) => blocks.map((b) => (b.type === "photo" ? b.caption : b.text));
