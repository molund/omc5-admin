import { test } from "node:test";
import assert from "node:assert/strict";
import { stripJpegMetadata, fromBase64, toBase64 } from "../src/lib/jpeg.js";

// A JPEG-shaped file: start of image, a JFIF header, EXIF, a comment, an ICC profile, a quantisation table, a scan
// segment with picture data after it, and the end marker.
function segment(marker, body) {
  const length = body.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...body];
}
const SCAN_DATA = [0x12, 0xff, 0x00, 0x34, 0xff, 0xd9, 0x56];
const JFIF = segment(0xe0, [...Buffer.from("JFIF\0"), 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const EXIF = segment(0xe1, [...Buffer.from("Exif\0\0GPS-location-here")]);
const COM = segment(0xfe, [...Buffer.from("taken on a phone")]);
const ICC = segment(0xe2, [...Buffer.from("ICC_PROFILE\0"), 1, 1, 0, 0]);
const DQT = segment(0xdb, [0, ...new Array(64).fill(8)]);
const SOS = segment(0xda, [1, 1, 0, 0, 63, 0]);
const JPEG = Uint8Array.from([0xff, 0xd8, ...JFIF, ...EXIF, ...COM, ...ICC, ...DQT, ...SOS, ...SCAN_DATA, 0xff, 0xd9]);

test("removes the metadata segments and keeps the rest, byte for byte", () => {
  const out = stripJpegMetadata(JPEG);
  const expected = Uint8Array.from([0xff, 0xd8, ...JFIF, ...DQT, ...SOS, ...SCAN_DATA, 0xff, 0xd9]);
  assert.deepEqual(out, expected);
});

test("what's left has no APP1–APP15 or comment segment, as the site's check requires", () => {
  const out = stripJpegMetadata(JPEG);
  for (let i = 2; i + 4 <= out.length;) {
    if (out[i] !== 0xff) break;
    const m = out[i + 1];
    if (m === 0xda) break;
    assert.ok(!((m >= 0xe1 && m <= 0xef) || m === 0xfe), `marker ${m.toString(16)} left in`);
    i += 2 + ((out[i + 2] << 8) | out[i + 3]);
  }
});

test("a file with nothing to strip comes back the same", () => {
  const plain = Uint8Array.from([0xff, 0xd8, ...JFIF, ...DQT, ...SOS, ...SCAN_DATA, 0xff, 0xd9]);
  assert.deepEqual(stripJpegMetadata(plain), plain);
});

test("refuses something that isn't a JPEG", () => {
  assert.throws(() => stripJpegMetadata(Uint8Array.from([0x89, 0x50, 0x4e, 0x47])), /Not a JPEG/);
});

test("base64 round trip keeps the bytes", () => {
  const bytes = Uint8Array.from({ length: 70000 }, (_, i) => (i * 37) & 0xff);
  assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
});
