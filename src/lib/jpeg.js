// Removes a JPEG's metadata segments without re-encoding the picture: the EXIF (location, camera, time), XMP, Photoshop and
// colour-profile segments and comments. The checker in molund/omc5 (.github/scripts/check_desk.py) refuses any APP1–APP15
// or comment segment, so this drops exactly those, and leaves every other segment and the image data as they are.

/**
 * @param {Uint8Array} bytes A JPEG file.
 * @returns {Uint8Array} The same picture with no metadata segments.
 */
export function stripJpegMetadata(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error("Not a JPEG.");
  const kept = [bytes.subarray(0, 2)];
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) throw new Error("Not a readable JPEG.");
    const marker = bytes[i + 1];
    if (marker === 0xff) {
      // a fill byte before a marker
      i += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      // no length: start of image, temporary, restart markers
      kept.push(bytes.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    const end = i + 2 + length;
    const metadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!metadata) kept.push(bytes.subarray(i, end));
    if (marker === 0xda) {
      // start of scan: the image data and everything after it are kept as they are
      kept.push(bytes.subarray(end));
      break;
    }
    i = end;
  }
  return concat(kept);
}

function concat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

/** A JPEG's bytes from base64, and back. */
export function fromBase64(text) {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

export function toBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
