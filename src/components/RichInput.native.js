// A rich text box on the phone: a TextInput showing its text as styled pieces (bold, links), so what's typed looks as it
// will on the site. It hands up markdown (lib/richText.js); the toolbar works on it through the ref. RichInput.web.js is
// the web's.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Text, TextInput } from "react-native";
import { useTw } from "../theme/tw.js";
import {
  applyEdit,
  editRange,
  fromMarkdown,
  isBold,
  linkAt,
  plainOf,
  removeLink,
  setLink,
  splitPaste,
  styleFor,
  toMarkdown,
  toggleBold,
} from "../lib/richText.js";

export const RichInput = forwardRef(function RichInput(
  { value, onChangeText, onState, onEnter, onSplit, cursorAt, ...props },
  ref,
) {
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
  // a paste split into blocks draws a new box: the phone's own text, with the line breaks in it, can't be kept
  const [epoch, setEpoch] = useState(0);

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
  // the selection to give the phone's text box, once the pieces are drawn again: a selection past the end of the text it still
  // has (a link longer than what it replaced) is an error in the phone's own code, which closes the app
  const wanted = useRef(null);
  const select = (start, end = start) => {
    sel.current = { start, end };
    wanted.current = { start, end };
  };

  // a new box opened with the focus: the cursor at `cursorAt`, when given, instead of the end
  useEffect(() => {
    if (props.autoFocus && cursorAt != null) select(cursorAt);
  }, []);

  useEffect(() => {
    const w = wanted.current;
    if (!w) return;
    wanted.current = null;
    setTimeout(() => {
      const max = plainOf(latest.current).length;
      input.current?.setSelection?.(Math.min(w.start, max), Math.min(w.end, max));
    }, 0);
  });

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
      key={epoch}
      ref={input}
      {...props}
      // the return key makes a new paragraph block (onEnter) instead of a new line
      {...(onEnter && { submitBehavior: "submit", onSubmitEditing: () => onEnter() })}
      onChangeText={(text) => {
        const p = pending.current;
        pending.current = null;
        const old = latest.current;
        // a paste with line breaks: one block for each line (onSplit)
        if (onSplit) {
          const { from, to, text: added } = editRange(old, text, sel.current);
          const st = styleFor(old, from, to, p && p.at === from ? p.bold : null);
          const split = added.length > 1 && splitPaste(old, from, to, added, st);
          if (split) {
            setEpoch((e) => e + 1);
            return onSplit(split.blocks, split.cursor);
          }
        }
        const next = applyEdit(old, text, sel.current, (at) => (p && p.at === at ? p.bold : null));
        commit(next);
        // what came in was changed (a pasted line break became a space, or markdown was read): the cursor goes after it,
        // not where the phone put it
        if (plainOf(next) !== text)
          select(plainOf(next).length - (plainOf(old).length - editRange(old, text, sel.current).to));
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
