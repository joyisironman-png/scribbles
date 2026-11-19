// Scribbles widget for iPhone (runs in the free "Scriptable" app).
// 1. Paste your personal Scribbles link below (the one you open the app with).
// 2. Add a Scriptable widget to your home screen, long-press it → Edit Widget → Script: Scribbles.

const MY_LINK = "PASTE-YOUR-PERSONAL-LINK-HERE"; // e.g. https://scribbles-xyz.vercel.app/u/abc123

// ─────────────────────────────────────────────────────────────

const m = MY_LINK.match(/^(https?:\/\/[^/]+)\/u\/([^/?#]+)/);
const fm = FileManager.local();
const cacheImg = fm.joinPath(fm.documentsDirectory(), "scribbles-latest.png");
const cacheMeta = fm.joinPath(fm.documentsDirectory(), "scribbles-latest.json");

const PAPER = new Color("#FBF6EC");
const INK = new Color("#1F1B18");

const w = new ListWidget();
w.backgroundColor = PAPER;
w.setPadding(0, 0, 0, 0);

async function fetchLatest() {
  const [, base, key] = m;
  const req = new Request(`${base}/api/widget?k=${key}&format=json&t=${Date.now()}`);
  req.timeoutInterval = 15;
  const d = await req.loadJSON();
  if (d.has) {
    const old = fm.fileExists(cacheMeta) ? JSON.parse(fm.readString(cacheMeta)) : {};
    if (old.id !== d.id || !fm.fileExists(cacheImg)) {
      const img = await new Request(d.image).loadImage();
      fm.writeImage(cacheImg, img);
    }
    fm.writeString(cacheMeta, JSON.stringify(d));
  }
  return d;
}

function caption(text, date) {
  w.addSpacer();
  const row = w.addStack();
  row.setPadding(0, 10, 10, 10);
  const pill = row.addStack();
  pill.backgroundColor = new Color("#FFFFFF", 0.88);
  pill.cornerRadius = 10;
  pill.setPadding(4, 8, 4, 8);
  pill.centerAlignContent();
  const t = pill.addText(text);
  t.font = Font.semiboldSystemFont(11);
  t.textColor = INK;
  if (date) {
    const dot = pill.addText(" · ");
    dot.font = Font.systemFont(11);
    dot.textColor = new Color("#6F655B");
    const dt = pill.addDate(date);
    dt.applyRelativeStyle(); // keeps "5 min" ticking without a refresh
    dt.font = Font.systemFont(11);
    dt.textColor = new Color("#6F655B");
  }
  row.addSpacer();
}

function message(title, sub) {
  w.setPadding(14, 14, 14, 14);
  const a = w.addText("✎ Scribbles");
  a.font = Font.semiboldSystemFont(12);
  a.textColor = new Color("#6F655B");
  w.addSpacer();
  const b = w.addText(title);
  b.font = new Font("Georgia-Italic", 20);
  b.textColor = INK;
  if (sub) {
    w.addSpacer(4);
    const c = w.addText(sub);
    c.font = Font.systemFont(11);
    c.textColor = new Color("#6F655B");
  }
}

if (!m) {
  message("Add your link", "Open this script in Scriptable and paste your personal link at the top.");
} else {
  let d = null;
  try {
    d = await fetchLatest();
  } catch (e) {
    d = fm.fileExists(cacheMeta) ? JSON.parse(fm.readString(cacheMeta)) : null; // offline: show last one
  }
  w.url = `${m[1]}/u/${m[2]}`; // tap → open Scribbles to draw back
  if (d && d.has && fm.fileExists(cacheImg)) {
    w.backgroundImage = fm.readImage(cacheImg);
    caption(d.fromName, new Date(d.createdAt));
  } else if (d) {
    message("Nothing yet", `When ${d.fromName || "they"} draw something, it shows up here.`);
  } else {
    message("Can't connect", "Check your link or internet.");
  }
}

// Ask iOS to refresh soon. iOS decides the exact timing (usually every few minutes).
w.refreshAfterDate = new Date(Date.now() + 5 * 60 * 1000);

if (config.runsInWidget) Script.setWidget(w);
else await w.presentLarge();
Script.complete();
