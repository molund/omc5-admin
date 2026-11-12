// Shares a file from the phone: written to the cache, then handed to iOS's share sheet (AirDrop, Save to Files and the
// rest). shareFile.web.js is the web's.
import { Share } from "react-native";
import { File, Paths } from "expo-file-system";

/**
 * @param {string} name The file's name, "sparkle-prompts-2026-11-12.zip".
 * @param {Uint8Array} bytes
 */
export async function shareFile(name, bytes) {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.create();
  await file.write(bytes);
  await Share.share({ url: file.uri });
}
