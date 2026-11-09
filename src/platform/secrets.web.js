// No GitHub token in the Claude app: the desk there pushes through Claude Code (services/outbox.js), and an artifact's
// browser storage is no place for one. secrets.native.js keeps it in the iPhone's Keychain.

export const canKeepToken = false;

const none = () => Promise.reject(new Error("The Claude app version of the Leash Log doesn't keep a GitHub token."));
export const saveToken = none;
export const readToken = none;
export const removeToken = none;
