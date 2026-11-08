// The desk's building blocks, in the site's look: panels, the grey and green buttons, the segmented control, fields.
import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import { Linking, Platform, Pressable, Switch, Text, TextInput, View } from "react-native";
import { useTw } from "../theme/tw.js";
import { copyText } from "../platform/clipboard";
import { writingPrompt } from "../lib/writingPrompt.js";
import { Icon } from "./Icon";
import { RichInput } from "./RichInput";
import { useRich } from "./richContext.js";

/** A white panel with a hairline border. */
export function Panel({ children, style, tone }) {
  const { tw } = useTw();
  return (
    <View
      style={[
        tw`gap-2.5 rounded-lg border bg-panel p-3`,
        tone === "accent" ? tw`border-accent` : tw`border-line`,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A title over a field or group, in the ink colour so it is not mistaken for a watermark. */
export function Label({ children, right }) {
  const { tw } = useTw();
  return (
    <View style={tw`flex-row items-center justify-between gap-2`}>
      <Text style={tw`text-sm font-semibold text-ink`}>{children}</Text>
      {right}
    </View>
  );
}

export function Body({ children, style, mute, small, numberOfLines }) {
  const { tw } = useTw();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[tw`${small ? "text-xs" : "text-sm"} leading-snug`, mute ? tw`text-mute` : tw`text-ink`, style]}
    >
      {children}
    </Text>
  );
}

/**
 * A button: "green" for the main action, "grey" for the rest, "link" for a word in a row, "danger" for removing.
 */
export function Button({ title, onPress, kind = "grey", disabled, small, style, label }) {
  const { tw } = useTw();
  const look = {
    green: tw`border-green bg-green`,
    grey: tw`border-button-line bg-button-bg`,
    dashed: tw`border-dashed border-button-line bg-transparent`,
    link: tw`border-transparent bg-transparent px-0`,
    danger: tw`border-button-line bg-button-bg`,
  }[kind];
  const ink = {
    green: tw`text-white`,
    grey: tw`text-button-ink`,
    dashed: tw`text-button-ink`,
    link: tw`text-accent`,
    danger: tw`text-del-ink`,
  }[kind];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label ?? title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered, focused }) => [
        tw`items-center justify-center rounded-md border ${small ? "px-2 py-1" : "px-3 py-2"}`,
        look,
        (pressed || hovered) && !disabled && kind !== "link" && tw`opacity-80`,
        focused && tw`border-accent`,
        disabled && tw`opacity-50`,
        style,
      ]}
    >
      <Text style={[tw`${small ? "text-xs" : "text-sm"} font-semibold`, ink]}>{title}</Text>
    </Pressable>
  );
}

/** GitHub's segmented control, as on the site's pager. An option can have an `icon` before its label. */
export function Segmented({ options, value, onChange, small }) {
  const { tw, colors } = useTw();
  return (
    <View
      accessibilityRole="tablist"
      style={tw`flex-row overflow-hidden rounded-md border border-button-line bg-button-bg`}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on, disabled: !!o.disabled }}
            disabled={!!o.disabled}
            onPress={() => onChange(o.value)}
            style={[
              tw`flex-1 flex-row items-center justify-center gap-1.5 ${small ? "py-1" : "py-2"} px-1`,
              i > 0 && tw`border-l border-button-line`,
              on && tw`bg-accent`,
              o.disabled && tw`opacity-40`,
            ]}
          >
            {o.icon && (
              <Icon name={o.icon} color={on ? colors["accent-ink"] : colors["button-ink"]} size={small ? 14 : 16} />
            )}
            <Text
              style={tw`${small ? "text-xs" : "text-sm"} font-semibold ${on ? "text-accent-ink" : "text-button-ink"}`}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** − value + */
export function Stepper({ value, onMinus, onPlus, label, wide }) {
  const { tw } = useTw();
  const key = (t, f, l) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={l}
      onPress={f}
      style={({ hovered }) => [tw`w-9 items-center justify-center bg-button-bg py-1.5`, hovered && tw`opacity-80`]}
    >
      <Text style={tw`text-base font-bold text-button-ink`}>{t}</Text>
    </Pressable>
  );
  return (
    <View style={tw`flex-row items-stretch overflow-hidden rounded-md border border-line`}>
      {key("−", onMinus, `${label}: back`)}
      <View style={[tw`items-center justify-center bg-panel px-2`, { minWidth: wide ? 112 : 44 }]}>
        <Text style={tw`text-base font-semibold text-ink`}>{value}</Text>
      </View>
      {key("+", onPlus, `${label}: forward`)}
    </View>
  );
}

export function Toggle({ value, onChange, label }) {
  const { tw, colors } = useTw();
  return (
    <View style={tw`flex-row items-center justify-between gap-3`}>
      <Body>{label}</Body>
      <Switch
        accessibilityLabel={label}
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.line, true: colors.green }}
        thumbColor={colors.panel}
        activeThumbColor={colors.panel}
      />
    </View>
  );
}

// Which box is zoomed: one at most. A tap anywhere outside it turns it off, but a swipe doesn't, because a box that changes
// size stops the page mid-scroll.
const ZoomContext = createContext({
  active: null,
  setActive: () => {},
  inside: { current: null },
  taps: { current: new Set() },
});
const SWIPE = 10;

/** While `open`, calls `close` on a tap or click anywhere, the one that opened it not counting. */
export function useTapAway(open, close) {
  const zoom = useContext(ZoomContext);
  const latest = useRef(close);
  latest.current = close;
  useEffect(() => {
    if (!open) return undefined;
    const run = () => latest.current();
    if (Platform.OS === "web") {
      // in the capture phase, which the opening click has already passed
      document.addEventListener("click", run, true);
      return () => document.removeEventListener("click", run, true);
    }
    zoom.taps.current.add(run);
    return () => zoom.taps.current.delete(run);
  }, [open]);
}

/** Around the whole desk. On the phone it sees every tap; on the web, the zoomed box listens to the document itself. */
export function ZoomScope({ children }) {
  const [active, setActive] = useState(null);
  const inside = useRef(null); // the box this touch is on, set by the box as the touch passes through it
  const start = useRef(null);
  const taps = useRef(new Set()); // what to call on a tap anywhere (useTapAway)
  const value = useMemo(() => ({ active, setActive, inside, taps }), [active]);
  const touches =
    Platform.OS === "web"
      ? {}
      : {
          onTouchStart: (e) => {
            start.current = { x: e.nativeEvent.pageX, y: e.nativeEvent.pageY };
          },
          onTouchEnd: (e) => {
            const on = inside.current;
            inside.current = null;
            const moved =
              !start.current ||
              Math.hypot(e.nativeEvent.pageX - start.current.x, e.nativeEvent.pageY - start.current.y) > SWIPE;
            if (!moved) {
              setActive((a) => (a === on ? a : null));
              taps.current.forEach((f) => f());
            }
          },
          onTouchCancel: () => {
            inside.current = null;
          },
        };
  return (
    <ZoomContext.Provider value={value}>
      <View {...touches}>{children}</View>
    </ZoomContext.Provider>
  );
}

/**
 * A text field, with icons over its top right corner: one that zooms the box, and one that copies an AI prompt for its text. `writes` is what the prompt
 * asks for ("a blog intro paragraph"); without it, the text for the field by its name. `noPrompt` leaves the icon off.
 * With a `heading`, the field is one box: the title (tap it to type) and the icons share its top line, `right` going before
 * the icons, and the text goes under them. With a `title` instead, the title and the icons share a line above the box, for a
 * field inside another box. `noAi` leaves the AI prompt's icon off and keeps the zoom.
 * A `rich` field shows its bold and links as they'll look, and edits the markdown behind them; its zoom and prompt buttons
 * are on the toolbar over the keyboard instead (RichScope.js), with Bold and Link. Its Enter key calls `onEnter`, when
 * given, instead of starting a new line, and a paste with line breaks calls `onSplit(blocks, cursor)` (richText.js's
 * splitPaste). `cursorAt` is where the cursor goes when it opens with the focus.
 */
export function Field({
  value,
  onChangeText,
  placeholder,
  multiline,
  mono,
  small,
  autoFocus,
  label,
  style,
  writes,
  noPrompt,
  secure,
  heading,
  title,
  right,
  rich,
  noAi,
  onEnter,
  onSplit,
  cursorAt,
}) {
  const { tw, colors } = useTw();
  const [copied, setCopied] = useState(null); // true for a moment after a copy; false when it was refused
  const zoom = useContext(ZoomContext);
  const id = useId();
  const zoomed = zoom.active === id;
  const box = useRef(null);
  const inputRef = useRef(null);
  const [restHeight, setRestHeight] = useState(null);
  const [focused, setFocused] = useState(false);
  const richScope = useRich();
  const [richState, setRichState] = useState(null); // { bold, link } where the cursor is, for the toolbar
  // on the web, a click outside the box; the phone's taps go through ZoomScope. The rich text toolbar isn't outside it.
  useEffect(() => {
    if (!zoomed || Platform.OS !== "web") return undefined;
    const outside = (e) => {
      if (!box.current?.contains(e.target) && !e.target.closest?.("[data-rich-toolbar]")) zoom.setActive(null);
    };
    document.addEventListener("click", outside, true);
    return () => document.removeEventListener("click", outside, true);
  }, [zoomed]);
  const toggleZoom = () => {
    zoom.setActive(zoomed ? null : id);
    if (!zoomed) inputRef.current?.focus();
  };
  const size = small ? tw`text-xs` : { fontSize: 17, lineHeight: 24 };
  const name = label ?? placeholder;
  const prompt = () => writingPrompt(writes ?? `the text for the "${name}" field`, value);
  async function copyPrompt() {
    if (copied === false) return setCopied(null); // a second press closes the prompt shown below
    const ok = await copyText(prompt());
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(null), 1500);
  }
  // a rich field tells the toolbar about itself while it has the focus
  useEffect(() => {
    if (!rich || !richScope) return;
    richScope.report(
      id,
      focused && { name, editor: inputRef, zoomed, toggleZoom, copied, copyPrompt, noPrompt, ...richState },
    );
  }, [rich, focused, zoomed, copied, richState, value]);
  useEffect(() => () => rich && richScope?.report(id, null), []);
  const icons = (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Zoom ${name}`}
        accessibilityState={{ selected: zoomed }}
        onPress={toggleZoom}
        style={({ hovered }) => [
          tw`h-8 w-8 items-center justify-center rounded-md`,
          zoomed && tw`bg-accent`,
          hovered && tw`opacity-80`,
        ]}
      >
        <Icon name={zoomed ? "zoomOut" : "zoomIn"} size={20} color={zoomed ? colors["accent-ink"] : colors.mute} />
      </Pressable>
      {!noAi && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Copy an AI prompt for ${name}`}
          onPress={copyPrompt}
          style={({ hovered }) => [tw`h-8 w-8 items-center justify-center rounded-md`, hovered && tw`opacity-80`]}
        >
          <Icon name={copied ? "check" : "sparkle"} size={20} color={copied ? colors.green : colors.mute} />
        </Pressable>
      )}
    </>
  );
  const notice =
    copied === false ? (
      <View style={tw`gap-1.5 ${heading ? "px-3" : ""}`}>
        <Notice tone="problem">The copy was refused here. Select the prompt below and copy it by hand.</Notice>
        <Text selectable style={tw`rounded-md bg-code p-2.5 font-mono text-xs text-ink`}>
          {prompt()}
        </Text>
      </View>
    ) : null;
  const Input = rich ? RichInput : TextInput;
  const input = (
    <Input
      ref={inputRef}
      {...(rich && { onState: setRichState, onEnter, onSplit, cursorAt })}
      onLayout={(e) => !zoomed && setRestHeight(e.nativeEvent.layout.height)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityLabel={name}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.mute}
      multiline={multiline}
      // on the phone a box grows with its text and never scrolls inside itself, so a swipe that starts on one scrolls the page
      scrollEnabled={!multiline}
      autoFocus={autoFocus}
      // a monospaced field is a file name or a command: no capital letters or corrections from the phone's keyboard
      autoCapitalize={mono ? "none" : "sentences"}
      autoCorrect={!mono}
      // a secret (the GitHub token): shown as dots, and kept out of the keyboard's suggestions
      secureTextEntry={secure}
      style={[
        // with a heading the box around it has the border, and shows the focus
        heading
          ? tw`bg-transparent px-3 pb-2.5 pt-0 text-ink`
          : tw`rounded-md border border-line bg-panel px-2.5 py-2 text-ink`,
        // one size, focused or not, unless it's zoomed: a box that changes size by itself stops the page mid-scroll
        size,
        mono && tw`font-mono`,
        multiline && tw`min-h-20`,
        { outlineColor: colors.accent },
        heading && { outlineStyle: "none" },
        style,
        zoomed && {
          fontSize: size.fontSize * 1.5,
          lineHeight: size.lineHeight && size.lineHeight * 1.5,
          // at least twice as tall, but free to grow on the phone; the web's box can't grow by itself, so it's set
          ...(restHeight && { minHeight: restHeight * 2, ...(Platform.OS === "web" && { height: restHeight * 2 }) }),
        },
      ]}
    />
  );
  const touch = {
    onTouchEnd: () => {
      zoom.inside.current = id;
    },
  };
  if (heading)
    return (
      <View
        ref={box}
        style={tw`rounded-lg border bg-panel ${focused || zoomed ? "border-accent" : "border-line"}`}
        {...touch}
      >
        <View style={tw`flex-row items-center gap-1 pl-3 pr-1.5 pt-1.5`}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Type in ${name}`}
            onPress={() => inputRef.current?.focus()}
            style={tw`flex-1 py-1`}
          >
            <Text style={tw`text-sm font-semibold text-ink`}>{heading}</Text>
          </Pressable>
          {right}
          {!noPrompt && !rich && icons}
        </View>
        {notice}
        {input}
      </View>
    );
  const body = (
    <>
      {!noPrompt &&
        !rich &&
        (title ? (
          <Label right={<View style={tw`flex-row gap-1`}>{icons}</View>}>{title}</Label>
        ) : (
          <View style={tw`flex-row justify-end gap-1`}>{icons}</View>
        ))}
      {notice}
      {input}
    </>
  );
  if (noPrompt) return body;
  return (
    <View ref={box} style={tw`gap-2.5`} {...touch}>
      {body}
    </View>
  );
}

/** A note under a field: "warn" for advice, "problem" for what stops a save. */
export function Notice({ children, tone = "warn" }) {
  const { tw } = useTw();
  return (
    <View style={tw`rounded-md px-2.5 py-1.5 ${tone === "problem" ? "bg-del" : "bg-warn"}`}>
      <Text style={tw`text-xs leading-snug ${tone === "problem" ? "text-del-ink" : "text-warn-ink"}`}>{children}</Text>
    </View>
  );
}

/** A warning that stands out more than a Notice: amber, with a warning icon. `style` can place it, as a popover. */
export function Warning({ children, style }) {
  const { tw, colors } = useTw();
  return (
    <View
      accessibilityRole="alert"
      style={[tw`flex-row items-start gap-2 rounded-md border border-warn-ink bg-warn p-2.5`, style]}
    >
      <View style={tw`pt-0.5`}>
        <Icon name="warning" size={16} color={colors["warn-ink"]} />
      </View>
      <Text style={tw`flex-1 text-xs leading-snug text-warn-ink`}>{children}</Text>
    </View>
  );
}

/** What asks before something is deleted: a note under what's about to go, with Cancel and the action. */
export function Confirm({ children, action = "Delete", onCancel, onConfirm }) {
  const { tw } = useTw();
  return (
    <View accessibilityRole="alert" style={tw`gap-2 rounded-md border border-del-ink bg-del p-2.5`}>
      <Text style={tw`text-xs leading-snug text-del-ink`}>{children}</Text>
      <Row style={tw`justify-end`}>
        <Button small title="Cancel" onPress={onCancel} />
        <Button small kind="danger" title={action} onPress={onConfirm} />
      </Row>
    </View>
  );
}

export function Row({ children, style }) {
  const { tw } = useTw();
  return <View style={[tw`flex-row flex-wrap items-center justify-between gap-2`, style]}>{children}</View>;
}

/** A real link (an <a> on the web, which opens in a new tab; on the phone, it opens in the browser), or with `onPress`, a link within the desk. */
export function Link({ href, title, onPress }) {
  const { tw } = useTw();
  return (
    <Text
      accessibilityRole="link"
      {...(href ? { href, hrefAttrs: { target: "_blank", rel: "noopener" } } : {})}
      // on the web the <a> does it; the phone has no <a>, so it opens the URL itself
      onPress={onPress ?? (Platform.OS === "web" ? undefined : () => Linking.openURL(href))}
      style={tw`py-1 text-xs font-semibold text-accent underline`}
    >
      {title}
    </Text>
  );
}
