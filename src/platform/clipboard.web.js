// Copies text to the clipboard. It has to be called inside a press, and the Claude app's frame can refuse it.
/** @returns {Promise<boolean>} Whether it was copied. */
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
