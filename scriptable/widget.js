// Scribbles widget body. The small loader script on the iPhone downloads this
// fresh on every run, so design changes never need a re-paste.

// ---- AES-256-GCM decryption in plain JavaScript (Scriptable has no built-in crypto) ----
// Only the counter-mode part is needed to read the picture; the tag at the end is skipped.
const SBOX = (() => {
  const s = new Uint8Array(256), inv = new Uint8Array(256);
  let p = 1, q = 1;
  do {
    p = p ^ ((p << 1) & 0xff) ^ (p & 0x80 ? 0x1b : 0);
    q ^= q << 1; q ^= q << 2; q ^= q << 4; q &= 0xff; if (q & 0x80) q ^= 0x09;
    const x = q ^ ((q << 1) | (q >> 7)) ^ ((q << 2) | (q >> 6)) ^ ((q << 3) | (q >> 5)) ^ ((q << 4) | (q >> 4));
    s[p] = (x ^ 0x63) & 0xff;
  } while (p !== 1);
  s[0] = 0x63;
  return s;
})();
const xt = (a) => ((a << 1) ^ (a & 0x80 ? 0x1b : 0)) & 0xff;

function expandKey(key) {
  const Nk = key.length / 4, Nr = Nk + 6, w = new Uint8Array(16 * (Nr + 1));
  w.set(key);
  let rcon = 1;
  for (let i = Nk; i < 4 * (Nr + 1); i++) {
    let t = w.slice((i - 1) * 4, i * 4);
    if (i % Nk === 0) {
      t = new Uint8Array([SBOX[t[1]] ^ rcon, SBOX[t[2]], SBOX[t[3]], SBOX[t[0]]]);
      rcon = xt(rcon);
    } else if (Nk > 6 && i % Nk === 4) {
      t = t.map((b) => SBOX[b]);
    }
    for (let j = 0; j < 4; j++) w[i * 4 + j] = w[(i - Nk) * 4 + j] ^ t[j];
  }
  return { w, Nr };
}

function encryptBlock({ w, Nr }, input, out) {
  const s = new Uint8Array(16);
  for (let i = 0; i < 16; i++) s[i] = input[i] ^ w[i];
  const t = new Uint8Array(16);
  for (let r = 1; r <= Nr; r++) {
    for (let i = 0; i < 16; i++) t[i] = SBOX[s[(i + 4 * (i % 4)) % 16]]; // SubBytes + ShiftRows
    if (r !== Nr) {
      for (let c = 0; c < 4; c++) {
        const a0 = t[4 * c], a1 = t[4 * c + 1], a2 = t[4 * c + 2], a3 = t[4 * c + 3], x = a0 ^ a1 ^ a2 ^ a3;
        s[4 * c] = a0 ^ x ^ xt(a0 ^ a1);
        s[4 * c + 1] = a1 ^ x ^ xt(a1 ^ a2);
        s[4 * c + 2] = a2 ^ x ^ xt(a2 ^ a3);
        s[4 * c + 3] = a3 ^ x ^ xt(a3 ^ a0);
      }
    } else s.set(t);
    for (let i = 0; i < 16; i++) s[i] ^= w[r * 16 + i];
  }
  out.set(s);
}

// blob = 12-byte IV | ciphertext | 16-byte tag  →  plaintext bytes
function gcmDecrypt(keyBytes, blob) {
  const ks = expandKey(keyBytes);
  const iv = blob.subarray(0, 12), ct = blob.subarray(12, blob.length - 16);
  const out = new Uint8Array(ct.length);
  const ctr = new Uint8Array(16), pad = new Uint8Array(16);
  ctr.set(iv);
  let n = 2; // GCM: counter block 1 is for the tag, data starts at 2
  for (let off = 0; off < ct.length; off += 16, n++) {
    ctr[12] = (n >>> 24) & 255; ctr[13] = (n >>> 16) & 255; ctr[14] = (n >>> 8) & 255; ctr[15] = n & 255;
    encryptBlock(ks, ctr, pad);
    const len = Math.min(16, ct.length - off);
    for (let i = 0; i < len; i++) out[off + i] = ct[off + i] ^ pad[i];
  }
  return out;
}

function b64uBytes(s) {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const out = [];
  let buf = 0, bits = 0;
  for (const ch of t) {
    const v = A.indexOf(ch);
    if (v < 0) continue;
    buf = (buf << 6) | v; bits += 6;
    if (bits >= 8) { bits -= 8; out.push((buf >> bits) & 255); }
  }
  return new Uint8Array(out);
}

const INK = new Color("#1F1B18");
const SOFT = new Color("#7A6E62");
const CREAM = "#FBF6EC";

function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v * (1 - t) + y[i] * t).toString(16).padStart(2, "0")).join("");
}

// Warm paper: soft light from the top-left, fine grain and a few fibres.
function paper(tint) {
  const W = 600, H = 600;
  const dc = new DrawContext();
  dc.size = new Size(W, H);
  dc.opaque = true;
  dc.respectScreenScale = false;
  dc.setFillColor(new Color(tint));
  dc.fillRect(new Rect(0, 0, W, H));
  for (let i = 0; i < 16; i++) {
    const r = W * (1.5 - i * 0.07);
    dc.setFillColor(new Color("#FFFFFF", 0.04));
    dc.fillEllipse(new Rect(-r * 0.42, -r * 0.5, r, r));
  }
  for (let i = 0; i < 12; i++) {
    const r = W * (1.6 - i * 0.05);
    dc.setFillColor(new Color("#5A3E25", 0.012));
    dc.fillEllipse(new Rect(W - r * 0.35, H - r * 0.3, r, r));
  }
  for (let i = 0; i < 3200; i++) {
    const s = Math.random() * 1.5 + 0.5;
    dc.setFillColor(new Color(Math.random() < 0.55 ? "#3B2A1A" : "#FFFFFF", Math.random() * 0.06));
    dc.fillRect(new Rect(Math.random() * W, Math.random() * H, s, s));
  }
  dc.setLineWidth(0.8);
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * W, y = Math.random() * H, a = Math.random() * Math.PI, l = 8 + Math.random() * 22;
    const path = new Path();
    path.move(new Point(x, y));
    path.addLine(new Point(x + Math.cos(a) * l, y + Math.sin(a) * l));
    dc.addPath(path);
    dc.setStrokeColor(new Color("#6B4F35", 0.05));
    dc.strokePath();
  }
  return dc.getImage();
}

// The doodle with a strip of washi tape across the top edge.
function taped(img) {
  const S = 600;
  const dc = new DrawContext();
  dc.size = new Size(S, S);
  dc.respectScreenScale = false;
  dc.drawImageInRect(img, new Rect(0, 0, S, S));
  const t = new Path();
  t.addLines([new Point(S / 2 - 92, -6), new Point(S / 2 + 98, 6), new Point(S / 2 + 92, 52), new Point(S / 2 - 98, 40)]);
  t.closeSubpath();
  dc.addPath(t);
  dc.setFillColor(new Color("#F2C94C", 0.62));
  dc.fillPath();
  for (let i = 0; i < 9; i++) {
    const s = new Path();
    const x = S / 2 - 80 + i * 20;
    s.move(new Point(x, 0));
    s.addLine(new Point(x + 4, 46));
    dc.addPath(s);
    dc.setLineWidth(3);
    dc.setStrokeColor(new Color("#FFFFFF", 0.18));
    dc.strokePath();
  }
  return dc.getImage();
}

// A polaroid with a soft edge underneath it.
function polaroid(parent, img, size, name, date, big) {
  const row = parent.addStack();
  row.addSpacer();
  const shadow = row.addStack();
  shadow.backgroundColor = new Color("#4A3320", 0.13);
  shadow.cornerRadius = big ? 22 : 15;
  shadow.setPadding(0, 0, big ? 3 : 2, big ? 2 : 1);
  const card = shadow.addStack();
  card.layoutVertically();
  card.backgroundColor = new Color("#FFFDF8");
  card.cornerRadius = big ? 21 : 14;
  card.borderWidth = 1;
  card.borderColor = new Color("#FFFFFF", 0.9);
  const pad = big ? 10 : 6;
  card.setPadding(pad, pad, big ? 9 : 5, pad);
  const pic = card.addImage(img);
  pic.imageSize = new Size(size, size);
  pic.cornerRadius = big ? 14 : 9;
  card.addSpacer(big ? 8 : 4);
  const cap = card.addStack();
  cap.centerAlignContent();
  cap.size = new Size(size, 0);
  const n = cap.addText(name);
  n.font = new Font("Georgia-BoldItalic", big ? 16 : 11);
  n.textColor = INK;
  n.lineLimit = 1;
  cap.addSpacer();
  if (date) {
    const d = cap.addText(clock(date));
    d.font = Font.mediumSystemFont(big ? 11 : 8.5);
    d.textColor = SOFT;
    d.lineLimit = 1;
  }
  row.addSpacer();
}

// "12:02 am" today, "Tue 9:41 pm" otherwise. Static, so no ticking seconds.
function clock(d) {
  const df = new DateFormatter();
  const today = new Date().toDateString() === d.toDateString();
  df.dateFormat = today ? "h:mm a" : "EEE h:mm a";
  return df.string(d).toLowerCase();
}

function message(w, title, sub) {
  w.setPadding(16, 16, 16, 16);
  const top = w.addText("✎  Scribbles");
  top.font = Font.semiboldSystemFont(12);
  top.textColor = SOFT;
  w.addSpacer();
  const t = w.addText(title);
  t.font = new Font("Georgia-Italic", 24);
  t.textColor = INK;
  if (sub) {
    w.addSpacer(4);
    const s = w.addText(sub);
    s.font = Font.systemFont(12);
    s.textColor = SOFT;
  }
}

module.exports.run = async function (MY_LINK) {
  const m = MY_LINK.match(/^(https?:\/\/[^/]+)\/u\/([^/?#]+)/);
  const fm = FileManager.local();
  const dir = fm.documentsDirectory();
  const cacheImg = fm.joinPath(dir, "scribbles-latest.png");
  const cacheMeta = fm.joinPath(dir, "scribbles-latest.json");
  const family = config.widgetFamily || "large";

  const w = new ListWidget();
  w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);
  if (!m) {
    w.backgroundImage = paper(CREAM);
    message(w, "Add your link", "Copy the widget script again from the Scribbles app.");
    return w;
  }
  const key = (MY_LINK.match(/#e=([A-Za-z0-9_-]+)/) || [])[1];
  w.url = `${m[1]}/u/${m[2]}${key ? "#e=" + key : ""}`; // tap → open Scribbles to draw back (and unlock it)

  let d = null;
  try {
    const req = new Request(`${m[1]}/api/widget?k=${m[2]}&format=json&t=${Date.now()}`);
    req.timeoutInterval = 15;
    d = await req.loadJSON();
    if (d.has) {
      const old = fm.fileExists(cacheMeta) ? JSON.parse(fm.readString(cacheMeta)) : {};
      if (old.id !== d.id || !fm.fileExists(cacheImg)) {
        if (d.e2e) {
          // End-to-end encrypted: unlock the picture here on the phone.
          if (!key) throw new Error("locked");
          const data = await new Request(d.image).load();
          const plain = gcmDecrypt(b64uBytes(key), Uint8Array.from(data.getBytes()));
          fm.writeImage(cacheImg, Image.fromData(Data.fromBytes(Array.from(plain))));
        } else {
          fm.writeImage(cacheImg, await new Request(d.image).loadImage());
        }
      }
      fm.writeString(cacheMeta, JSON.stringify(d));
    }
  } catch (e) {
    if (String(e && e.message) === "locked") {
      w.backgroundImage = paper(CREAM);
      message(w, "Locked 🔒", "Open Scribbles and tap “Copy widget script again”, then paste it into Scriptable.");
      return w;
    }
    d = fm.fileExists(cacheMeta) ? JSON.parse(fm.readString(cacheMeta)) : null; // offline: show the last one
  }

  const tint = d && d.bg && d.bg !== "#1E2233" ? mix(d.bg, CREAM, 0.55) : "#F6EFE3";
  w.backgroundImage = paper(tint);

  if (!d) {
    message(w, "Can't connect", "Check the internet. It'll try again soon.");
    return w;
  }
  if (!d.has || !fm.fileExists(cacheImg)) {
    message(w, "Nothing yet", `When ${d.fromName || "they"} draws something, it lands here.`);
    return w;
  }

  const img = taped(fm.readImage(cacheImg));
  const when = new Date(d.createdAt);
  if (family === "medium") {
    w.setPadding(10, 14, 10, 14);
    const row = w.addStack();
    row.centerAlignContent();
    polaroid(row, img, 108, d.fromName, null, false);
    row.addSpacer(14);
    const col = row.addStack();
    col.layoutVertically();
    const a = col.addText(`From ${d.fromName}`);
    a.font = new Font("Georgia-BoldItalic", 19);
    a.textColor = INK;
    col.addSpacer(3);
    const t = col.addText(clock(when));
    t.font = Font.mediumSystemFont(12);
    t.textColor = SOFT;
    col.addSpacer(10);
    const b = col.addText("Tap to draw back ✎");
    b.font = Font.semiboldSystemFont(12);
    b.textColor = new Color("#B4432F");
    row.addSpacer();
  } else {
    const big = family === "large" || family === "extraLarge";
    w.setPadding(big ? 14 : 8, 8, big ? 14 : 8, 8);
    w.addSpacer();
    polaroid(w, img, big ? 270 : 118, d.fromName, when, big);
    w.addSpacer();
  }
  return w;
};
