// Copies text to the phone's clipboard.
import * as Clipboard from "expo-clipboard";

/** @returns {Promise<boolean>} Whether it was copied. */
export async function copyText(text) {
  try {
    await Clipboard.setStringAsync(text);
    return true;
  } catch {
    return false;
  }
}
