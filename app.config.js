// app.json's config, plus the writing prompt's version (scripts/promptVersion.cjs) for the phone app to read through
// expo-constants.
import { promptVersion } from "./scripts/promptVersion.cjs";

export default ({ config }) => ({ ...config, extra: { ...config.extra, promptVersion: promptVersion() } });
