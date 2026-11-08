// The frame around the desk. On the web the page scrolls by itself, and web/index.html sets the side gutter. The browser's
// back (its button, or a swipe on a trackpad) goes back a page (useBack in components/backContext.js): each step the desk
// goes forward adds an entry to the browser's history, and the desk going back by itself takes them off again.
import { useEffect, useMemo, useRef } from "react";
import { BackContext } from "../components/backContext.js";

export function Frame({ children }) {
  const back = useRef(null);
  const shown = useRef(0); // the desk's entries in the browser's history
  const skips = useRef(0); // the history moves the desk made itself, which aren't a press of the browser's back
  const frame = useMemo(
    () => ({
      set: (f, depth) => {
        back.current = f;
        try {
          if (depth > shown.current) {
            while (shown.current < depth) window.history.pushState({ desk: ++shown.current }, "");
          } else if (depth < shown.current) {
            const n = shown.current - depth;
            shown.current = depth;
            skips.current += 1;
            window.history.go(-n);
          }
        } catch {
          // a frame that won't keep a history: the page's own Back is still there
        }
      },
    }),
    [],
  );
  useEffect(() => {
    const popped = () => {
      if (skips.current > 0) return void (skips.current -= 1);
      if (!back.current || shown.current === 0) return;
      shown.current -= 1;
      back.current();
    };
    window.addEventListener("popstate", popped);
    return () => window.removeEventListener("popstate", popped);
  }, []);
  return <BackContext.Provider value={frame}>{children}</BackContext.Provider>;
}
