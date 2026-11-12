// The writing prompt's version this build was made with (scripts/promptVersion.cjs, through app.config.js).
import Constants from "expo-constants";

export const PROMPT_VERSION = Constants.expoConfig?.extra?.promptVersion ?? "unknown";
