// The toolbar for the rich text boxes, as in Apple's Notes: it sits on top of the keyboard while one of the boxes has the
// focus, with Bold, Link, and the box's zoom and AI prompt buttons. Link opens the Add Link sheet, or Edit Link (with
// Remove Link) when the cursor is in a link; text selected when it opens is the link's name.
import { useMemo, useState } from "react";
import { Modal, Platform, Pressable, Text, TextInput, View } from "react-native";
import { useTw } from "../theme/tw.js";
import { cleanHref } from "../lib/richText.js";
import { RichContext } from "./richContext.js";
import { KeyboardBar } from "./KeyboardBar";
import { Icon } from "./Icon";
import { Notice } from "./ui.js";

export function RichScope({ children }) {
  const [box, setBox] = useState(null); // the box with the focus: { id, name, editor, bold, link, zoomed, ... }
  const [sheet, setSheet] = useState(null); // the link sheet's box and selection, while it's open
  const ctx = useMemo(
    () => ({ report: (id, b) => setBox((now) => (b ? { id, ...b } : now?.id === id ? null : now)) }),
    [],
  );
  const openLink = () => {
    const at = box.editor.current?.info();
    if (at) setSheet({ editor: box.editor, ...at });
  };
  return (
    <RichContext.Provider value={ctx}>
      {children}
      <KeyboardBar visible={!!box && !sheet} focusKey={box?.id}>
        {box && <Toolbar box={box} onLink={openLink} />}
      </KeyboardBar>
      {sheet && <LinkSheet sheet={sheet} onClose={() => setSheet(null)} />}
    </RichContext.Provider>
  );
}

function Toolbar({ box, onLink }) {
  const { tw, colors } = useTw();
  const key = (label, on, onPress, child) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => [
        tw`h-10 w-12 items-center justify-center rounded-full`,
        on && tw`bg-accent`,
        pressed && tw`opacity-60`,
      ]}
    >
      {child(on ? colors["accent-ink"] : colors.ink)}
    </Pressable>
  );
  return (
    <View
      dataSet={{ richToolbar: "" }}
      style={[
        tw`mx-2 mb-2 flex-row items-center justify-around rounded-full border border-line bg-panel px-2 py-1`,
        { shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 2 } },
      ]}
    >
      {key(
        "Bold",
        box.bold,
        () => box.editor.current?.toggleBold(),
        (c) => (
          <Text style={[tw`text-lg font-bold`, { color: c }]}>B</Text>
        ),
      )}
      {key(box.link ? "Edit link" : "Add link", box.link, onLink, (c) => (
        <Icon name="link" size={22} color={c} />
      ))}
      {key(`Zoom ${box.name}`, box.zoomed, box.toggleZoom, (c) => (
        <Icon name="glasses" size={22} color={c} />
      ))}
      {!box.noPrompt &&
        key(box.aiLabel, false, box.copyPrompt, (c) => (
          <Icon
            name={box.writing ? "stop" : box.copied ? "check" : "sparkle"}
            size={22}
            color={box.copied && !box.writing ? colors.green : c}
          />
        ))}
    </View>
  );
}

// the box gets its change and the focus back once the sheet has gone, as the sheet hands the focus back as it closes
const AFTER_SHEET = Platform.OS === "web" ? 0 : 400;

/** Add Link or Edit Link, laid out as in Notes. */
function LinkSheet({ sheet, onClose }) {
  const { tw, colors } = useTw();
  const editing = !!sheet.link;
  const [to, setTo] = useState(editing ? sheet.link.href : "");
  const [name, setName] = useState(editing ? sheet.link.text : sheet.text);
  const [problem, setProblem] = useState(null);
  const range = editing ? sheet.link : sheet;
  const done = () => {
    const href = cleanHref(to);
    if (!href) return setProblem("That isn't an address the site can link to (https://…, or one on the site).");
    const text = name.replace(/\n/g, " ").trim() || href;
    onClose();
    setTimeout(() => sheet.editor.current?.link(range.start, range.end, text, href), AFTER_SHEET);
  };
  const remove = () => {
    onClose();
    setTimeout(() => sheet.editor.current?.unlink(range.start, range.end), AFTER_SHEET);
  };
  const cancel = () => {
    onClose();
    setTimeout(() => sheet.editor.current?.focus(), AFTER_SHEET);
  };
  const round = (label, onPress, look, child) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [tw`h-11 w-11 items-center justify-center rounded-full`, look, pressed && tw`opacity-70`]}
    >
      {child}
    </Pressable>
  );
  const box = tw`rounded-2xl bg-panel px-4 py-3 text-ink`;
  return (
    <Modal visible transparent={false} animationType="slide" presentationStyle="pageSheet" onRequestClose={cancel}>
      <View dataSet={{ richToolbar: "" }} style={tw`flex-1 gap-2 bg-bg px-4 pt-4`}>
        <View style={tw`mb-3 flex-row items-center justify-between`}>
          {round("Cancel", cancel, tw`border border-line bg-panel`, <Icon name="close" size={20} color={colors.ink} />)}
          <Text style={tw`text-lg font-bold text-ink`}>{editing ? "Edit Link" : "Add Link"}</Text>
          {round("Done", done, tw`bg-accent`, <Icon name="check" size={22} color={colors["accent-ink"]} />)}
        </View>
        <Text style={tw`px-2 text-base font-semibold text-mute`}>Link To</Text>
        <TextInput
          accessibilityLabel="Link to"
          value={to}
          onChangeText={(t) => {
            setTo(t);
            setProblem(null);
          }}
          autoFocus={!editing}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          multiline
          placeholder="https://"
          placeholderTextColor={colors.mute}
          style={[box, { fontSize: 17, minHeight: 88, outlineStyle: "none" }]}
        />
        {problem && <Notice tone="problem">{problem}</Notice>}
        <Text style={tw`mt-2 px-2 text-base font-semibold text-mute`}>Name</Text>
        <View style={tw`flex-row items-center rounded-2xl bg-panel pr-2`}>
          <TextInput
            accessibilityLabel="Name"
            value={name}
            onChangeText={setName}
            placeholder={cleanHref(to) ?? "The link's text"}
            placeholderTextColor={colors.mute}
            style={[box, tw`flex-1`, { fontSize: 17, outlineStyle: "none" }]}
          />
          {!!name &&
            round(
              "Clear the name",
              () => setName(""),
              null,
              <View style={tw`h-6 w-6 items-center justify-center rounded-full bg-mute`}>
                <Icon name="close" size={14} color={colors.panel} />
              </View>,
            )}
        </View>
        {editing && (
          <Pressable
            accessibilityRole="button"
            onPress={remove}
            style={({ pressed }) => [tw`mt-4 rounded-2xl bg-panel px-4 py-3.5`, pressed && tw`opacity-70`]}
          >
            <Text style={[tw`text-del-ink`, { fontSize: 17 }]}>Remove Link</Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}
