// The frame around the Leash Log. On the web the page scrolls by itself, and web/index.html sets the side gutter. The browser's
// back (its button, or a swipe on a trackpad) goes back a page (useBack in components/backContext.js): each step the Leash Log
// goes forward adds an entry to the browser's history, and the Leash Log going back by itself takes them off again. Each new
// page, or a step back, starts at the top.
import { useEffect, useMemo, useRef } from "react";
import { BackContext } from "../components/backContext.js";

export function Frame({ children }) {
  const back = useRef(null);
  const shown = useRef(0); // the Leash Log's entries in the browser's history
  const at = useRef(0); // how many steps back the Leash Log is, to start a new page at the top
  const skips = useRef(0); // the history moves the Leash Log made itself, which aren't a press of the browser's back
  const frame = useMemo(
    () => ({
      set: (f, depth) => {
        back.current = f;
        if (depth !== at.current) window.scrollTo(0, 0);
        at.current = depth;
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
