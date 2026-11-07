// Picking and preparing a photo in the browser: at most 800 pixels wide, JPEG at quality 75. Drawing it onto a canvas and
// saving that drops all of the original's metadata (location, camera, time), as CLAUDE.md asks.
// (A native build would use expo-image-picker and expo-image-manipulator behind the same two functions.)

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
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
    const bytes = Math.round(((dataUrl.length - dataUrl.indexOf(",") - 1) * 3) / 4);
    return { dataUrl, width, height, bytes, original: file.name };
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
