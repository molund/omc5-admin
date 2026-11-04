// Picking and preparing a photo on the phone: at most 800 pixels wide, JPEG at quality 75, the same as photos.web.js. The
// photo is picked from the library and saved again by the image manipulator, which writes a new JPEG with none of the
// original's metadata (location, camera, time), as CLAUDE.md in molund/omc5 asks.
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

const MAX_WIDTH = 800;
const QUALITY = 0.75;

/**
 * Opens the photo library.
 * @returns {Promise<object|null>} The picked photo, or null if nothing was picked.
 */
export async function pickPhoto() {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsEditing: false,
    exif: false,
  });
  return result.canceled || !result.assets?.length ? null : result.assets[0];
}

/**
 * The photo, resized and re-encoded.
 * @param {{ uri: string, width: number, fileName?: string|null }} asset
 * @returns {Promise<{ dataUrl: string, width: number, height: number, bytes: number, original: string }>}
 */
export async function preparePhoto(asset) {
  const context = ImageManipulator.manipulate(asset.uri);
  if (asset.width > MAX_WIDTH) context.resize({ width: MAX_WIDTH });
  const image = await context.renderAsync();
  const out = await image.saveAsync({ format: SaveFormat.JPEG, compress: QUALITY, base64: true });
  const padding = out.base64.endsWith("==") ? 2 : out.base64.endsWith("=") ? 1 : 0;
  return {
    dataUrl: `data:image/jpeg;base64,${out.base64}`,
    width: out.width,
    height: out.height,
    bytes: Math.floor((out.base64.length * 3) / 4) - padding,
    original: asset.fileName ?? "",
  };
}

/** Only the web build uploads photos as files; the phone pushes their bytes (the data URL) itself. */
export async function toBlob() {
  throw new Error("toBlob is only for the web build.");
}
