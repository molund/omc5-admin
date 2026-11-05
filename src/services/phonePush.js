// Push on the phone: Face ID, then the token from the Keychain, then the changes to GitHub (services/github.js).
import { readToken } from "../platform/secrets";
import { GitHubError, pushChanges } from "./github.js";

/**
 * @param {{ changes: object[], photos: object, tokenInfo: object|null, setTokenInfo: Function }} desk
 * @returns {Promise<{ head: string, pushed: string[], skipped: object[] }>}
 * @throws {GitHubError} with a `settings` flag when the fix is in Settings.
 */
export async function pushFromPhone({ changes, photos, tokenInfo, setTokenInfo }) {
  const needsSettings = (code, message, detail) =>
    Object.assign(new GitHubError(code, message, detail), { settings: true });
  if (!tokenInfo) throw needsSettings("no_token", "Push needs a GitHub token. Add one in Settings.");

  let token;
  try {
    token = await readToken(`Push ${changes.length === 1 ? "1 change" : `${changes.length} changes`} to GitHub`);
  } catch (e) {
    throw new GitHubError("face_id", "Face ID didn't confirm it's you, so nothing was pushed.", e?.message ?? "");
  }
  if (!token) {
    setTokenInfo(null);
    throw needsSettings(
      "token_gone",
      "The token isn't in the Keychain any more (it's dropped when Face ID's faces change). Paste it again in Settings.",
    );
  }

  try {
    const result = await pushChanges({ token, changes, photos });
    setTokenInfo((t) => t && { ...t, expiresAt: result.expiresAt ?? t.expiresAt, rejected: false });
    return result;
  } catch (e) {
    if (e?.code === "token_rejected") {
      setTokenInfo((t) => t && { ...t, rejected: true });
      e.settings = true;
    }
    throw e;
  }
}
