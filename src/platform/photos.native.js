// Picking and preparing a photo on the phone: at most 1024 pixels wide, JPEG at quality 85, the same as photos.web.js. The
// photo is picked from the library and saved again by the image manipulator, then its metadata segments (location, camera,
// time, colour profile) are dropped, as AGENTS.md in molund/omc5 asks.
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { fromBase64, stripJpegMetadata, toBase64 } from "../lib/jpeg.js";

const MAX_WIDTH = 1024;
const QUALITY = 0.85;

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
  // the manipulator's own JPEG can still carry segments the site refuses (its ICC profile, say): drop them too
  const jpeg = stripJpegMetadata(fromBase64(out.base64));
  const base64 = toBase64(jpeg);
  return {
    dataUrl: `data:image/jpeg;base64,${base64}`,
    width: out.width,
    height: out.height,
    bytes: jpeg.length,
    original: asset.fileName ?? "",
  };
}

/** Only the web build uploads photos as files; the phone pushes their bytes (the data URL) itself. */
export async function toBlob() {
  throw new Error("toBlob is only for the web build.");
}
