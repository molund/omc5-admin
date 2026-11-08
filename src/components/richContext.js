// What links a rich text box (a Field with `rich`) to the toolbar over the keyboard: the box says what it is while it has
// the focus, and the toolbar works on it. RichScope.js provides it.
import { createContext, useContext } from "react";

export const RichContext = createContext(null);

/** { report(id, box or null) }, or null outside a RichScope. */
export const useRich = () => useContext(RichContext);
