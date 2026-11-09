// The rich text toolbar's place on the web: fixed to the bottom of what can be seen, so on a phone it sits on the
// keyboard. Inside a frame, as the Leash Log is in the Claude app, the page can't see the keyboard, and a bar at the bottom
// ends up behind it, so there it floats just above the box being typed in. Pressing it doesn't take the focus from the
// box. KeyboardBar.native.js is the phone's.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const BAR = 64; // room kept at the foot of the page, so the toolbar doesn't cover the last box
const GAP = 4; // between the floating bar and its box

const inFrame = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true; // a frame on another site can't even be asked
  }
})();

/** Where the bar floats in a frame: over the top edge of the box with the focus, in page coordinates. */
function useAboveBox(visible, bar) {
  const [at, setAt] = useState(null);
  const fit = () => {
    const box = document.activeElement?.hasAttribute?.("data-rich") ? document.activeElement.parentElement : null;
    if (!box) return;
    const r = box.getBoundingClientRect();
    const h = bar.current?.offsetHeight || 56;
    setAt((now) => {
      const next = {
        top: Math.max(0, r.top + window.scrollY - h - GAP),
        left: r.left + window.scrollX,
        width: r.width,
      };
      return now && now.top === next.top && now.left === next.left && now.width === next.width ? now : next;
    });
  };
  useLayoutEffect(() => {
    if (inFrame && visible) fit();
  });
  useEffect(() => {
    if (!inFrame || !visible) return undefined;
    const box = document.activeElement?.parentElement;
    const size = new ResizeObserver(fit);
    if (box) size.observe(box);
    window.addEventListener("resize", fit);
    document.addEventListener("focusin", fit);
    return () => {
      size.disconnect();
      window.removeEventListener("resize", fit);
      document.removeEventListener("focusin", fit);
    };
  }, [visible]);
  return at;
}

export function KeyboardBar({ visible, children }) {
  const bar = useRef(null);
  const above = useAboveBox(visible, bar);
  const [lift, setLift] = useState(0); // how far the keyboard covers the bottom of the window
  useEffect(() => {
    const vv = window.visualViewport;
    if (inFrame || !visible || !vv) return undefined;
    const fit = () => setLift(Math.max(0, window.innerHeight - vv.offsetTop - vv.height));
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
    };
  }, [visible]);
  useEffect(() => {
    if (inFrame || !visible) return undefined;
    const was = document.body.style.paddingBottom;
    document.body.style.paddingBottom = `${BAR}px`;
    return () => {
      document.body.style.paddingBottom = was;
    };
  }, [visible]);
  if (!visible) return null;
  const place = inFrame
    ? { position: "absolute", top: above?.top ?? 0, left: above?.left ?? 0, width: above?.width ?? "100%" }
    : {
        position: "fixed",
        left: 0,
        right: 0,
        bottom: lift,
        paddingBottom: lift ? 0 : "env(safe-area-inset-bottom, 0px)",
        maxWidth: 640,
        margin: "0 auto",
      };
  return createPortal(
    <div
      ref={bar}
      data-rich-toolbar=""
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.preventDefault()}
      style={{ zIndex: 50, ...place, ...(inFrame && !above && { visibility: "hidden" }) }}
    >
      {children}
    </div>,
    document.body,
  );
}
