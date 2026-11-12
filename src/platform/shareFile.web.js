// Shares a file on the web: downloads it. shareFile.native.js is the phone's.

/**
 * @param {string} name The file's name, "sparkle-prompts-2026-11-12.zip".
 * @param {Uint8Array} bytes
 */
export async function shareFile(name, bytes) {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
