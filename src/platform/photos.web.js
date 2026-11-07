// Picking and preparing a photo in the browser: at most 800 pixels wide, JPEG at quality 75. Drawing it onto a canvas and
// saving that drops the original's metadata (location, camera, time), and the saved JPEG's own extra segments are dropped
// too, as CLAUDE.md asks.
// (A native build would use expo-image-picker and expo-image-manipulator behind the same two functions.)

import { fromBase64, stripJpegMetadata, toBase64 } from "../lib/jpeg.js";

const MAX_WIDTH = 800;
const QUALITY = 0.75;

/**
 * Opens the photo picker. Call it straight from a button press.
 * @returns {Promise<File|null>} null if nothing was picked.
 */
export function pickPhoto() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";
    let done = false;
    const finish = (f) => {
      if (done) return;
      done = true;
      input.remove();
      resolve(f);
    };
    input.addEventListener("change", () => finish(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => finish(null));
    document.body.appendChild(input);
    input.click();
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("This photo couldn't be opened. Try a JPEG or PNG."));
    };
    img.src = url;
  });
}

/** An image (or canvas) drawn onto a new canvas of this size, smoothed as well as the browser can. */
function draw(source, width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/**
 * The photo, resized and re-encoded.
 * @param {File} file
 * @returns {Promise<{ dataUrl: string, width: number, height: number, bytes: number, original: string }>}
 */
export async function preparePhoto(file) {
  const { img, url } = await loadImage(file);
  try {
    const scale = Math.min(1, MAX_WIDTH / img.naturalWidth);
    const width = Math.round(img.naturalWidth * scale),
      height = Math.round(img.naturalHeight * scale);
    // halve it while it's more than twice the size, then draw the rest: each halving averages neighbouring pixels, which
    // comes out a little smoother than one big step (in WebKit, a noise pattern's grain dropped by about a sixth)
    let source = img;
    for (let w = img.naturalWidth, h = img.naturalHeight; w / 2 >= width;) {
      [w, h] = [Math.round(w / 2), Math.round(h / 2)];
      source = draw(source, w, h);
    }
    const canvas = draw(source, width, height);
    // the browser's own JPEG can still carry segments the site refuses (Safari adds a colour profile, say): drop them too
    const [head, data] = canvas.toDataURL("image/jpeg", QUALITY).split(",");
    const jpeg = stripJpegMetadata(fromBase64(data));
    const dataUrl = `${head},${toBase64(jpeg)}`;
    return { dataUrl, width, height, bytes: jpeg.length, original: file.name };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A data: URL as a Blob, for uploading. Decoded here, not fetched: the Claude app doesn't let the desk fetch a data: URL. */
export async function toBlob(dataUrl) {
  const [head, data] = dataUrl.split(",");
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: head.match(/^data:([^;,]+)/)?.[1] ?? "application/octet-stream" });
}
