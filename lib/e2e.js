/*
  End-to-end encryption for Scribbles (runs only in your browsers/apps).
  - One shared 256-bit key, made on a phone. It never goes to the server.
  - Pictures, songs and saved songs are locked with AES-256-GCM before upload.
  - The server only ever sees: "e2e:" + base64( 12-byte IV | ciphertext | 16-byte tag ).
  - A short fingerprint of the key (a hash) is stored so devices can check they typed the right code;
    it can't be turned back into the key.
*/

const LS = "scribbles-e2e-key";
const te = new TextEncoder();
const td = new TextDecoder();

export function toB64(bytes) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
const toB64u = (b) => toB64(b).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromB64u = (s) => fromB64(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));

export function getKey() {
  try { return localStorage.getItem(LS) || null; } catch (_) { return null; }
}
export function setKey(code) {
  try { localStorage.setItem(LS, code); } catch (_) {}
  // Android app: hand the key to the widget (stays on the phone).
  try { window.ScribblesAndroid?.setKey?.(code); } catch (_) {}
}

export const cleanCode = (s) => String(s || "").trim().replace(/^.*#e=/, "").replace(/[^A-Za-z0-9_-]/g, "");
export const validCode = (s) => { try { return fromB64u(cleanCode(s)).length === 32; } catch (_) { return false; } };

export function newKey() {
  return toB64u(crypto.getRandomValues(new Uint8Array(32)));
}

export async function fingerprint(code) {
  const raw = fromB64u(code);
  const tag = te.encode("scribbles-fingerprint:");
  const buf = new Uint8Array(tag.length + raw.length);
  buf.set(tag);
  buf.set(raw, tag.length);
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  return toB64u(h.subarray(0, 12));
}

const keyCache = new Map();
function cryptoKey(code) {
  if (!keyCache.has(code)) {
    keyCache.set(code, crypto.subtle.importKey("raw", fromB64u(code), "AES-GCM", false, ["encrypt", "decrypt"]));
  }
  return keyCache.get(code);
}

export async function lockBytes(code, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await cryptoKey(code), bytes));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv);
  out.set(ct, 12);
  return out;
}
export async function unlockBytes(code, bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: b.subarray(0, 12) }, await cryptoKey(code), b.subarray(12)));
}

// Pictures: data URL in → "e2e:..." out.
export async function lockImage(code, dataUrl) {
  const [, b64] = dataUrl.split(",");
  return "e2e:" + toB64(await lockBytes(code, fromB64(b64)));
}
// Small things (song details): object in → string out, and back.
export async function lockJSON(code, obj) {
  return toB64(await lockBytes(code, te.encode(JSON.stringify(obj))));
}
export async function unlockJSON(code, s) {
  return JSON.parse(td.decode(await unlockBytes(code, fromB64(s))));
}
