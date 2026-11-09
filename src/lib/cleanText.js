// Text as it's written into status.yaml and gantry-cycles.yaml: without the invisible characters a phone can slip into a text box.
// iOS puts an object replacement character (U+FFFC) where something like an image or a link card was pasted or dictated;
// zero-width spaces, word joiners, byte-order marks, replacement characters and control characters can come along with
// copied text. None of them shows, and none belongs in the files. The zero-width joiner stays: emoji are built with it.

const INVISIBLE = /[￼\uFFFD​⁠﻿\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * @param {string} text
 * @returns {string} The text without invisible characters.
 */
export const cleanText = (text) => String(text ?? "").replace(INVISIBLE, "");
