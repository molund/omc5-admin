// The GitHub token on the phone: in the iPhone's Keychain (expo-secure-store), on this device only (not in iCloud Keychain
// or backups, and not readable while the phone is locked). It's saved so that reading it needs Face ID, so every push asks.
// The token never goes anywhere else: not in the desk's storage, the code or an error message. What the desk shows about it
// (its last four characters and when it expires) is kept apart, in storage.native.js, and needs no Face ID.
import * as SecureStore from "expo-secure-store";

const KEY = "github-token";
const OPTIONS = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: true,
};

/** Whether this platform can keep a token (the Claude app can't; it pushes through Claude Code). */
export const canKeepToken = true;

/** Saves the token, replacing any saved before. */
export async function saveToken(token) {
  await SecureStore.setItemAsync(KEY, token, OPTIONS);
}

/**
 * Reads the token, after Face ID.
 * @param {string} reason What Face ID's prompt says it's for ("Push 2 changes to GitHub").
 * @returns {Promise<string|null>} The token, or null if none is saved (or it was dropped when Face ID's faces changed).
 * @throws when Face ID doesn't confirm (cancelled, failed, locked out).
 */
export async function readToken(reason) {
  return SecureStore.getItemAsync(KEY, { ...OPTIONS, authenticationPrompt: reason });
}

export async function removeToken() {
  await SecureStore.deleteItemAsync(KEY, OPTIONS);
}
