// What links the desk's pages (App.js) to the frame around them (platform/Frame): the desk says how to go back while there's
// somewhere to go back to, and the frame calls it, from a swipe on the phone or the browser's back on the web.
import { createContext, useContext, useEffect } from "react";

export const BackContext = createContext(null);

/** Hands the frame `back`, or null when there's nowhere to go back to. */
export function useBack(back) {
  const frame = useContext(BackContext);
  useEffect(() => {
    frame?.set(back);
  });
  useEffect(() => () => frame?.set(null), []);
}
