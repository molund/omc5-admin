// The desk's building blocks, in the site's look: panels, the grey and green buttons, the segmented control, fields.
import { Pressable, Switch, Text, TextInput, View } from "react-native";
import { useTw } from "../theme/tw.js";
import { Icon } from "./Icon"; // Icon.web.js here, Icon.native.js in a native build

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

/** A small uppercase label over a field or group. */
export function Label({ children, right }) {
  const { tw } = useTw();
  return (
    <View style={tw`flex-row items-center justify-between gap-2`}>
      <Text style={tw`text-xs font-bold uppercase tracking-wider text-mute`}>{children}</Text>
      {right}
    </View>
  );
}

export function Body({ children, style, mute, small }) {
  const { tw } = useTw();
  return (
    <Text style={[tw`${small ? "text-xs" : "text-sm"} leading-snug`, mute ? tw`text-mute` : tw`text-ink`, style]}>
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
    <View accessibilityRole="tablist" style={tw`flex-row overflow-hidden rounded-md border border-button-line bg-button-bg`}>
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={[
              tw`flex-1 flex-row items-center justify-center gap-1.5 ${small ? "py-1" : "py-2"} px-1`,
              i > 0 && tw`border-l border-button-line`,
              on && tw`bg-accent`,
            ]}
          >
            {o.icon && <Icon name={o.icon} color={on ? colors["accent-ink"] : colors["button-ink"]} size={small ? 14 : 16} />}
            <Text style={tw`${small ? "text-xs" : "text-sm"} font-semibold ${on ? "text-accent-ink" : "text-button-ink"}`}>
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

export function Field({ value, onChangeText, placeholder, multiline, mono, small, autoFocus, label, style }) {
  const { tw, colors } = useTw();
  return (
    <TextInput
      accessibilityLabel={label ?? placeholder}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.mute}
      multiline={multiline}
      autoFocus={autoFocus}
      style={[
        tw`rounded-md border border-line bg-panel px-2.5 py-2 text-ink ${small ? "text-xs" : "text-sm"}`,
        mono && tw`font-mono`,
        multiline && tw`min-h-20`,
        { outlineColor: colors.accent },
        style,
      ]}
    />
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

export function Row({ children, style }) {
  const { tw } = useTw();
  return <View style={[tw`flex-row flex-wrap items-center justify-between gap-2`, style]}>{children}</View>;
}

/** A real link (an <a> on the web), which opens in a new tab. */
export function Link({ href, title }) {
  const { tw } = useTw();
  return (
    <Text href={href} hrefAttrs={{ target: "_blank", rel: "noopener" }} style={tw`px-1 py-1 text-xs font-semibold text-accent underline`}>
      {title}
    </Text>
  );
}
