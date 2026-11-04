// The viewer's theme on the web: the Claude app sets data-theme="dark" or "light" on the page for an explicit choice, and
// nothing for "system", where prefers-color-scheme decides. (A native build would use useColorScheme() instead.)
import { useEffect, useState } from "react";

function read() {
  const t = document.documentElement.dataset.theme;
  if (t === "dark" || t === "light") return t;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useScheme() {
  const [scheme, setScheme] = useState(read);
  useEffect(() => {
    const update = () => setScheme(read());
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener?.("change", update);
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      mq?.removeEventListener?.("change", update);
      mo.disconnect();
    };
  }, []);
  return scheme;
}
