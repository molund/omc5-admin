// A rich text box on the phone: a TextInput showing its text as styled pieces (bold, links), so what's typed looks as it
// will on the site. It hands up markdown (lib/richText.js); the toolbar works on it through the ref. RichInput.web.js is
// the web's.
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Text, TextInput } from "react-native";
import { useTw } from "../theme/tw.js";
import {
  applyEdit,
  fromMarkdown,
  isBold,
  linkAt,
  plainOf,
  removeLink,
  setLink,
  toMarkdown,
  toggleBold,
} from "../lib/richText.js";

export const RichInput = forwardRef(function RichInput({ value, onChangeText, onState, ...props }, ref) {
  const { colors } = useTw();
  const input = useRef(null);
  const [state, setState] = useState(() => ({ runs: fromMarkdown(value), md: value }));
  // a new value from outside (another note opened, a draft cleared) starts the runs again
  let runs = state.runs;
  if (value !== state.md) {
    runs = fromMarkdown(value);
    setState({ runs, md: value });
  }
  const sel = useRef({ start: 0, end: 0 });
  const pending = useRef(null); // { at, bold }: Bold pressed with nothing selected, for what's typed next at `at`
  const latest = useRef(runs);
  latest.current = runs;

  const report = (r = latest.current) => {
    const { start, end } = sel.current;
    const p = pending.current;
    onState?.({
      bold: p && start === end && p.at === start ? p.bold : isBold(r, start, end),
      link: !!linkAt(r, start, end),
    });
  };
  const commit = (next) => {
    const md = toMarkdown(next);
    latest.current = next;
    setState({ runs: next, md });
    if (md !== value) onChangeText?.(md);
    report(next);
  };
  const select = (start, end = start) => {
    sel.current = { start, end };
    // after the pieces are drawn again
    setTimeout(() => input.current?.setSelection?.(start, end), 0);
  };

  useImperativeHandle(ref, () => ({
    focus: () => input.current?.focus(),
    blur: () => input.current?.blur(),
    /** The selection, its text, and the link it's in. */
    info: () => {
      const r = latest.current;
      const { start, end } = sel.current;
      return { start, end, text: plainOf(r).slice(start, end), link: linkAt(r, start, end) };
    },
    toggleBold: () => {
      const { start, end } = sel.current;
      if (start === end) {
        const p = pending.current;
        const now = p && p.at === start ? p.bold : isBold(latest.current, start);
        pending.current = { at: start, bold: !now };
        return report();
      }
      const out = toggleBold(latest.current, start, end);
      commit(out.runs);
      select(out.start, out.end);
    },
    link: (start, end, text, href) => {
      const out = setLink(latest.current, start, end, text, href);
      commit(out.runs);
      input.current?.focus();
      select(out.cursor);
    },
    unlink: (start, end) => {
      commit(removeLink(latest.current, start, end));
      input.current?.focus();
      select(start, end);
    },
  }));

  return (
    <TextInput
      ref={input}
      {...props}
      onChangeText={(text) => {
        const p = pending.current;
        pending.current = null;
        commit(applyEdit(latest.current, text, sel.current, (at) => (p && p.at === at ? p.bold : null)));
      }}
      onSelectionChange={(e) => {
        sel.current = e.nativeEvent.selection;
        report();
      }}
    >
      {runs.map((r, i) => (
        <Text
          key={i}
          style={[r.bold && { fontWeight: "700" }, r.href && { color: colors.accent, textDecorationLine: "underline" }]}
        >
          {r.text}
        </Text>
      ))}
    </TextInput>
  );
});
