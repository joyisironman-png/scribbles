// Scribbles widget body. The small loader script on the iPhone downloads this
// fresh on every run, so design changes never need a re-paste.

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
    const d = cap.addDate(date);
    d.applyRelativeStyle(); // keeps "5 min" ticking on its own
    d.font = Font.mediumSystemFont(big ? 11 : 8.5);
    d.textColor = SOFT;
    d.lineLimit = 1;
  }
  row.addSpacer();
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
  w.url = `${m[1]}/u/${m[2]}`; // tap → open Scribbles to draw back

  let d = null;
  try {
    const req = new Request(`${m[1]}/api/widget?k=${m[2]}&format=json&t=${Date.now()}`);
    req.timeoutInterval = 15;
    d = await req.loadJSON();
    if (d.has) {
      const old = fm.fileExists(cacheMeta) ? JSON.parse(fm.readString(cacheMeta)) : {};
      if (old.id !== d.id || !fm.fileExists(cacheImg)) fm.writeImage(cacheImg, await new Request(d.image).loadImage());
      fm.writeString(cacheMeta, JSON.stringify(d));
    }
  } catch (e) {
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
    const t = col.addDate(when);
    t.applyRelativeStyle();
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
