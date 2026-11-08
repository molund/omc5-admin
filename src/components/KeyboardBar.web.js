// The rich text toolbar's place on the web: fixed to the bottom of what can be seen, so on a phone it sits on the
// keyboard. Pressing it doesn't take the focus from the box being typed in. KeyboardBar.native.js is the phone's.
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const BAR = 64; // room kept at the foot of the page, so the toolbar doesn't cover the last box

export function KeyboardBar({ visible, children }) {
  const [lift, setLift] = useState(0); // how far the keyboard covers the bottom of the window
  useEffect(() => {
    const vv = window.visualViewport;
    if (!visible || !vv) return undefined;
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
    if (!visible) return undefined;
    const was = document.body.style.paddingBottom;
    document.body.style.paddingBottom = `${BAR}px`;
    return () => {
      document.body.style.paddingBottom = was;
    };
  }, [visible]);
  if (!visible) return null;
  return createPortal(
    <div
      data-rich-toolbar=""
      onMouseDown={(e) => e.preventDefault()}
      onPointerDown={(e) => e.preventDefault()}
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: lift,
        zIndex: 50,
        paddingBottom: lift ? 0 : "env(safe-area-inset-bottom, 0px)",
        maxWidth: 640,
        margin: "0 auto",
      }}
    >
      {children}
    </div>,
    document.body,
  );
}
