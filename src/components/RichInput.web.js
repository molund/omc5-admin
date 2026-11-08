// A rich text box on the web: an editable div showing its text with bold and links, so what's typed looks as it will on the
// site. It hands up markdown (lib/richText.js); the toolbar works on it through the ref. The browser does the typing, and
// the div is read back after each change; line breaks, pastes and the toolbar's changes go through the model and draw the
// div again. RichInput.native.js is the phone's.
import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef } from "react";
import { unstable_createElement } from "react-native";
import { useTw } from "../theme/tw.js";
import {
  fromMarkdown,
  isBold,
  oneLine,
  linkAt,
  plainOf,
  removeLink,
  replace,
  setLink,
  styleFor,
  tidy,
  toMarkdown,
  toggleBold,
} from "../lib/richText.js";

// the placeholder, shown while the div is empty
const CSS = "[data-rich]:empty::before{content:attr(data-placeholder);color:var(--rich-mute);pointer-events:none}";
function addCss() {
  if (document.getElementById("rich-css")) return;
  const s = document.createElement("style");
  s.id = "rich-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The runs as the div's HTML. A last line break needs a <br> after it to show as a line. */
function draw(runs, accent) {
  const html = runs
    .map((r) => {
      let h = esc(r.text);
      if (r.bold) h = `<b>${h}</b>`;
      if (r.href) h = `<a href="${esc(r.href)}" style="color:${accent};text-decoration:underline">${h}</a>`;
      return h;
    })
    .join("");
  return plainOf(runs).endsWith("\n") ? `${html}<br>` : html;
}

/** The div read back as runs: <b> or a bold weight for bold, <a> for links. */
function read(root) {
  const out = [];
  const walk = (node, st) => {
    for (const c of node.childNodes) {
      if (c.nodeType === Node.TEXT_NODE) out.push({ text: c.data.replace(/ /g, " "), ...st });
      else if (c.nodeType === Node.ELEMENT_NODE) {
        if (c.tagName === "BR") {
          if (c !== root.lastChild) out.push({ text: "\n", ...st });
          continue;
        }
        const next = { ...st };
        const weight = c.style?.fontWeight;
        if (c.tagName === "B" || c.tagName === "STRONG" || weight === "bold" || Number(weight) >= 600) next.bold = true;
        if (weight === "normal" || (weight && Number(weight) < 600)) next.bold = false;
        if (c.tagName === "A" && c.getAttribute("href")) next.href = c.getAttribute("href");
        // a block the browser made for a new line
        if ((c.tagName === "DIV" || c.tagName === "P") && out.length && !plainOf(out).endsWith("\n"))
          out.push({ text: "\n" });
        walk(c, next);
      }
    }
  };
  walk(root, {});
  return tidy(out);
}

/** Where a point in the div is, as an offset into its text. */
function offsetOf(root, node, offset) {
  const r = document.createRange();
  r.selectNodeContents(root);
  r.setEnd(node, offset);
  return r.toString().length;
}

/** The point in the div at an offset into its text. */
function pointAt(root, at) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (at <= n.data.length) return [n, at];
    at -= n.data.length;
  }
  return [root, root.childNodes.length - (root.lastChild?.tagName === "BR" ? 1 : 0)];
}

export const RichInput = forwardRef(function RichInput(
  {
    value,
    onChangeText,
    onState,
    onEnter,
    onFocus,
    onBlur,
    onLayout,
    autoFocus,
    placeholder,
    accessibilityLabel,
    style,
  },
  ref,
) {
  const { colors } = useTw();
  const el = useRef(null);
  const runs = useRef(fromMarkdown(value));
  const said = useRef(value); // the markdown last handed up, or last taken in
  const sel = useRef({ start: 0, end: 0 });
  const drawn = useRef(null); // the link colour the div was drawn in
  const props = useRef({});
  props.current = { onChangeText, onState, onEnter };

  const selection = () => {
    const s = window.getSelection();
    if (!s?.rangeCount || !el.current.contains(s.anchorNode)) return sel.current;
    const r = s.getRangeAt(0);
    return {
      start: offsetOf(el.current, r.startContainer, r.startOffset),
      end: offsetOf(el.current, r.endContainer, r.endOffset),
    };
  };
  const place = ({ start, end }) => {
    sel.current = { start, end };
    if (document.activeElement !== el.current) return;
    const r = document.createRange();
    r.setStart(...pointAt(el.current, start));
    r.setEnd(...pointAt(el.current, end));
    const s = window.getSelection();
    s.removeAllRanges();
    s.addRange(r);
  };
  const report = () => {
    const { start, end } = sel.current;
    const focused = document.activeElement === el.current;
    props.current.onState?.({
      bold: start === end && focused ? document.queryCommandState("bold") : isBold(runs.current, start, end),
      link: !!linkAt(runs.current, start, end),
    });
  };
  const commit = (next) => {
    runs.current = next;
    const md = toMarkdown(next);
    if (md !== said.current) {
      said.current = md;
      props.current.onChangeText?.(md);
    }
    report();
  };
  const redraw = (next, at) => {
    el.current.innerHTML = draw(next, drawn.current ?? colors.accent);
    commit(next);
    place(at);
  };
  /** The selection replaced by text typed or pasted, in the style typing there takes. */
  const type = (text) => {
    const { start, end } = selection();
    const st = styleFor(runs.current, start, end, start === end ? document.queryCommandState("bold") : undefined);
    redraw(replace(runs.current, start, end, text, st), { start: start + text.length, end: start + text.length });
  };

  // a value from outside (another note opened, a draft cleared), or a new theme, draws the div again
  useLayoutEffect(() => {
    addCss();
    el.current.style.setProperty("--rich-mute", colors.mute);
    const fresh = value !== said.current;
    if (fresh) {
      said.current = value;
      runs.current = fromMarkdown(value);
    }
    if (fresh || drawn.current !== colors.accent) el.current.innerHTML = draw(runs.current, colors.accent);
    drawn.current = colors.accent;
  }, [value, colors.accent, colors.mute]);

  useEffect(() => {
    const div = el.current;
    const before = (e) => {
      if (e.inputType === "insertParagraph" || e.inputType === "insertLineBreak") {
        e.preventDefault();
        // Enter makes a new paragraph block (onEnter) instead of a new line
        if (props.current.onEnter) props.current.onEnter();
        else type("\n");
      } else if (e.inputType === "formatBold") {
        e.preventDefault();
        api.current.toggleBold();
      } else if (e.inputType.startsWith("format")) e.preventDefault(); // italic and the rest aren't allowed
    };
    const input = () => {
      commit(read(div));
      sel.current = selection();
      report();
    };
    const paste = (e) => {
      e.preventDefault();
      // kept to one line: the line breaks become spaces
      type(oneLine(e.clipboardData?.getData("text/plain")));
    };
    const drop = (e) => e.preventDefault();
    const moved = () => {
      if (document.activeElement !== div) return;
      sel.current = selection();
      report();
    };
    div.addEventListener("beforeinput", before);
    div.addEventListener("input", input);
    div.addEventListener("paste", paste);
    div.addEventListener("drop", drop);
    document.addEventListener("selectionchange", moved);
    const size = new ResizeObserver(() => onLayout?.({ nativeEvent: { layout: { height: div.offsetHeight } } }));
    size.observe(div);
    if (autoFocus) {
      div.focus();
      place({ start: plainOf(runs.current).length, end: plainOf(runs.current).length });
    }
    return () => {
      div.removeEventListener("beforeinput", before);
      div.removeEventListener("input", input);
      div.removeEventListener("paste", paste);
      div.removeEventListener("drop", drop);
      document.removeEventListener("selectionchange", moved);
      size.disconnect();
    };
  }, []);

  const api = useRef(null);
  api.current = {
    focus: () => {
      el.current.focus();
      place(sel.current);
    },
    blur: () => el.current.blur(),
    info: () => {
      const { start, end } = document.activeElement === el.current ? selection() : sel.current;
      return { start, end, text: plainOf(runs.current).slice(start, end), link: linkAt(runs.current, start, end) };
    },
    toggleBold: () => {
      const { start, end } = selection();
      if (start === end) {
        // the browser keeps "bold for what's typed next" itself
        document.execCommand("bold");
        return report();
      }
      const out = toggleBold(runs.current, start, end);
      redraw(out.runs, out);
    },
    link: (start, end, text, href) => {
      const out = setLink(runs.current, start, end, text, href);
      el.current.focus();
      redraw(out.runs, { start: out.cursor, end: out.cursor });
    },
    unlink: (start, end) => {
      el.current.focus();
      redraw(removeLink(runs.current, start, end), { start, end });
    },
  };
  useImperativeHandle(ref, () => ({
    focus: () => api.current.focus(),
    blur: () => api.current.blur(),
    info: () => api.current.info(),
    toggleBold: () => api.current.toggleBold(),
    link: (...a) => api.current.link(...a),
    unlink: (...a) => api.current.unlink(...a),
  }));

  return unstable_createElement("div", {
    ref: el,
    contentEditable: true,
    suppressContentEditableWarning: true,
    role: "textbox",
    "aria-multiline": true,
    "aria-label": accessibilityLabel,
    "data-rich": "",
    "data-placeholder": placeholder ?? "",
    autoCapitalize: "sentences",
    spellCheck: true,
    onFocus: (e) => {
      sel.current = selection();
      onFocus?.(e);
      report();
    },
    onBlur,
    style: [style, { whiteSpace: "pre-wrap", overflowWrap: "anywhere", overflowY: "auto", cursor: "text" }],
  });
});
