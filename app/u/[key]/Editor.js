"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GESTURES as G } from "@/lib/gestures";
import { getKey, lockImage, lockJSON, unlockJSON } from "@/lib/e2e";
import { describeSong, topArtists } from "@/lib/songs";
import { Camera, EmojiGrid } from "./ui";

/*
  The Scribbles editor, Instagram-story style:
  - a 900×900 picture made of layers: background (paper / photo / their doodle), ink (drawing),
    and movable objects on top (text, stickers, a song record)
  - one tool panel open at a time, so the screen never gets crowded
*/

export const SIZE = 900;
const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const uid = () => Math.random().toString(36).slice(2, 9);

export const PAPERS = [
  { name: "Paper", c: "#FBF6EC" },
  { name: "Blush", c: "#FCE3E1" },
  { name: "Mint", c: "#DDF2E3" },
  { name: "Sky", c: "#DCE8FB" },
  { name: "Butter", c: "#FFF0BF" },
  { name: "Lilac", c: "#ECE3FB" },
  { name: "Night", c: "#1E2233" },
];
const NIGHT = "#1E2233";

// Colour families, each with six shades from light to dark.
const FAMILIES = [
  { name: "Red", shades: ["#FECACA", "#F87171", "#EF4444", "#DC2626", "#B91C1C", "#7F1D1D"] },
  { name: "Orange", shades: ["#FED7AA", "#FB923C", "#F97316", "#EA580C", "#C2410C", "#7C2D12"] },
  { name: "Yellow", shades: ["#FEF08A", "#FDE047", "#FACC15", "#EAB308", "#CA8A04", "#854D0E"] },
  { name: "Green", shades: ["#BBF7D0", "#4ADE80", "#22C55E", "#16A34A", "#15803D", "#14532D"] },
  { name: "Teal", shades: ["#99F6E4", "#2DD4BF", "#14B8A6", "#0D9488", "#0F766E", "#134E4A"] },
  { name: "Blue", shades: ["#BFDBFE", "#60A5FA", "#3B82F6", "#2563EB", "#1D4ED8", "#1E3A8A"] },
  { name: "Purple", shades: ["#DDD6FE", "#A78BFA", "#8B5CF6", "#7C3AED", "#6D28D9", "#4C1D95"] },
  { name: "Pink", shades: ["#FBCFE8", "#F472B6", "#EC4899", "#DB2777", "#BE185D", "#831843"] },
  { name: "Brown", shades: ["#E7D3C1", "#C8A27C", "#A47551", "#85593A", "#6B4226", "#3E2516"] },
  { name: "Grey", shades: ["#FFFFFF", "#E5E5E5", "#A3A3A3", "#525252", "#262626", "#1F1B18"] },
];
const BRUSHES = [
  { id: "pen", name: "Pen", hint: "Pressure & speed" },
  { id: "marker", name: "Marker", hint: "Even line" },
  { id: "highlight", name: "Highlighter", hint: "See-through" },
  { id: "erase", name: "Eraser", hint: "Rub out ink" },
];
export const FONTS = [
  { id: "classic", name: "Classic", css: '700 {s}px "DM Sans", -apple-system, sans-serif', lh: 1.12 },
  { id: "modern", name: "Modern", css: '700 {s}px "Space Grotesk", "Helvetica Neue", sans-serif', lh: 1.1 },
  { id: "hand", name: "Handwritten", css: '600 {s}px Caveat, "Bradley Hand", cursive', lh: 1.02 },
  { id: "elegant", name: "Elegant", css: '700 {s}px "Dancing Script", "Snell Roundhand", cursive', lh: 1.1 },
  { id: "script", name: "Script", css: '400 {s}px Pacifico, "Snell Roundhand", cursive', lh: 1.3 },
  { id: "editor", name: "Editor", css: 'italic 700 {s}px "Playfair Display", Georgia, serif', lh: 1.15 },
  { id: "poster", name: "Poster", css: '400 {s}px "Abril Fatface", Georgia, serif', lh: 1.1 },
  { id: "strong", name: "Strong", css: '400 {s}px "Bebas Neue", Impact, sans-serif', lh: 1.0 },
  { id: "bubble", name: "Bubble", css: '700 {s}px Comfortaa, "Arial Rounded MT Bold", sans-serif', lh: 1.15 },
  { id: "retro", name: "Retro", css: '400 {s}px Righteous, "Arial Black", sans-serif', lh: 1.1 },
  { id: "marker", name: "Marker", css: '400 {s}px "Permanent Marker", "Marker Felt", cursive', lh: 1.15 },
  { id: "type", name: "Typewriter", css: '400 {s}px "Special Elite", "Courier New", monospace', lh: 1.2 },
];
const TEXT_STYLES = [
  { id: "plain", label: "A", name: "Plain" },
  { id: "pill", label: "A", name: "Box" },
  { id: "outline", label: "A", name: "Outline" },
  { id: "neon", label: "A", name: "Neon" },
  { id: "shadow", label: "A", name: "Shadow" },
];
const fontOf = (id) => FONTS.find((f) => f.id === id) || FONTS.find((f) => f.id === "hand");
const STICKERS = ["❤️", "💕", "💌", "✨", "⭐", "🌙", "☀️", "🌸", "🌷", "🌻", "🦋", "🎀", "🍓", "🍒", "☕", "🧸", "😘", "🥹", "😂", "😍", "🫶", "👀", "🔥", "🎶"];
const FILTERS = [
  { id: "none", name: "Original" },
  { id: "warm", name: "Warm" },
  { id: "film", name: "Film" },
  { id: "mono", name: "Mono" },
  { id: "fade", name: "Dreamy" },
  { id: "pop", name: "Pop" },
];
const TOOLS = [
  { id: "draw", icon: "✎", name: "Draw" },
  { id: "text", icon: "Aa", name: "Text" },
  { id: "sticker", icon: "☺", name: "Stickers" },
  { id: "music", icon: "♫", name: "Music" },
  { id: "photo", icon: "▣", name: "Photo" },
  { id: "paper", icon: "◐", name: "Paper" },
];

const contrastOn = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  const l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
  return l > 165 ? "#1F1B18" : "#FFFFFF";
};

/* ───────────── ink ───────────── */

function widthAt(s, pt) {
  if (s.brush === "highlight") return s.size * 2.2;
  if (s.brush === "marker" || s.erase) return s.size;
  const p = pt[2] ?? 0.5;
  return s.size * (0.18 + Math.pow(p, 0.8) * 1.55);
}
function styleFor(ctx, s) {
  ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
  ctx.strokeStyle = ctx.fillStyle = s.erase ? "#000" : s.color;
  ctx.lineCap = s.brush === "highlight" ? "square" : "round";
  ctx.lineJoin = "round";
}
function drawSegment(ctx, s, n) {
  const p = s.pts;
  ctx.lineWidth = s.brush === "pen" ? (widthAt(s, p[n - 1]) + widthAt(s, p[n - 2])) / 2 : widthAt(s, p[n - 1]);
  ctx.beginPath();
  if (n === 2) {
    const m = mid(p[0], p[1]);
    ctx.moveTo(p[0][0], p[0][1]);
    ctx.lineTo(m[0], m[1]);
  } else {
    const a = mid(p[n - 3], p[n - 2]);
    const b = mid(p[n - 2], p[n - 1]);
    ctx.moveTo(a[0], a[1]);
    ctx.quadraticCurveTo(p[n - 2][0], p[n - 2][1], b[0], b[1]);
  }
  ctx.stroke();
}
function strokeOnto(ctx, s) {
  styleFor(ctx, s);
  const p = s.pts;
  if (s.brush !== "highlight") {
    ctx.beginPath();
    ctx.arc(p[0][0], p[0][1], widthAt(s, p[0]) / 2, 0, Math.PI * 2);
    ctx.fill();
  }
  for (let n = 2; n <= p.length; n++) drawSegment(ctx, s, n);
  if (p.length > 1) {
    const last = p[p.length - 1];
    const m = mid(p[p.length - 2], last);
    ctx.lineWidth = widthAt(s, last);
    ctx.beginPath();
    ctx.moveTo(m[0], m[1]);
    ctx.lineTo(last[0], last[1]);
    ctx.stroke();
  } else if (s.brush === "highlight") {
    ctx.fillRect(p[0][0] - s.size, p[0][1] - s.size, s.size * 2, s.size * 2);
  }
}
let scratch = null;
function renderStroke(ctx, s) {
  if (s.brush === "highlight" && !s.erase) {
    if (!scratch) { scratch = document.createElement("canvas"); scratch.width = scratch.height = SIZE; }
    const sc = scratch.getContext("2d");
    sc.globalCompositeOperation = "source-over";
    sc.clearRect(0, 0, SIZE, SIZE);
    strokeOnto(sc, s);
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 0.38;
    ctx.drawImage(scratch, 0, 0);
    ctx.globalAlpha = 1;
    return;
  }
  strokeOnto(ctx, s);
}

/* ───────────── photo filters ───────────── */

function applyFilter(ctx, id) {
  if (id === "none") return;
  const img = ctx.getImageData(0, 0, SIZE, SIZE);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    if (id === "warm") { r = r * 1.08 + 10; g = g * 1.02 + 4; b = b * 0.9; }
    else if (id === "film") {
      r = 0.85 * r + 0.15 * l + 14; g = 0.85 * g + 0.15 * l + 6; b = 0.8 * b + 0.2 * l + 2;
      r = (r - 128) * 0.92 + 128; g = (g - 128) * 0.92 + 128; b = (b - 128) * 0.88 + 128;
    }
    else if (id === "mono") { const c = (l - 128) * 1.15 + 128; r = g = b = c; }
    else if (id === "fade") { r = r * 0.82 + 52; g = g * 0.8 + 46; b = b * 0.82 + 56; }
    else if (id === "pop") {
      r = l + (r - l) * 1.35; g = l + (g - l) * 1.35; b = l + (b - l) * 1.35;
      r = (r - 128) * 1.1 + 128; g = (g - 128) * 1.1 + 128; b = (b - 128) * 1.1 + 128;
    }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(img, 0, 0);
  if (id === "film" || id === "fade") {
    const v = ctx.createRadialGradient(SIZE / 2, SIZE / 2, SIZE * 0.35, SIZE / 2, SIZE / 2, SIZE * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, id === "film" ? "rgba(40,20,0,.28)" : "rgba(255,240,245,.25)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }
}

async function readPhoto(file) {
  const tryLoad = (blob) =>
    new Promise((ok, bad) => {
      const im = new Image();
      im.onload = () => ok(im);
      im.onerror = bad;
      im.src = URL.createObjectURL(blob);
    });
  try {
    return await tryLoad(file);
  } catch (_) {
    if (!window.heic2any) {
      await new Promise((ok, bad) => {
        const sc = document.createElement("script");
        sc.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
        sc.onload = ok;
        sc.onerror = bad;
        document.head.append(sc);
      });
    }
    const out = await window.heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
    return tryLoad(Array.isArray(out) ? out[0] : out);
  }
}

const loadImg = (src) =>
  new Promise((ok, bad) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = bad;
    im.src = src;
  });

/* ───────────── objects: text, stickers, record ───────────── */

const TEXT_BASE = 64;
const STICKER_BASE = 130;
const RECORD_R = 120;

// Neon: a pale core in the chosen colour, with the colour as the glow.
function neonCore(hex) {
  const n = parseInt(hex.slice(1), 16);
  const m = (c) => Math.round(c + (255 - c) * 0.72);
  return `rgb(${m(n >> 16)},${m((n >> 8) & 255)},${m(n & 255)})`;
}

function textLines(o) { return (o.text || " ").split("\n"); }

// Draw one movable object onto the export canvas, matching what's on screen.
function paintObject(ctx, o) {
  ctx.save();
  ctx.translate(o.x, o.y);
  ctx.rotate(o.rot);
  ctx.scale(o.scale, o.scale);
  ctx.globalCompositeOperation = "source-over";
  if (o.type === "sticker") {
    ctx.font = `${STICKER_BASE}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(o.emoji, 0, 0);
  } else if (o.type === "text") {
    const f = fontOf(o.font);
    const s = o.fs || TEXT_BASE;
    ctx.font = f.css.replace("{s}", s);
    ctx.textBaseline = "middle";
    const lines = textLines(o);
    const lh = s * f.lh;
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const h = lines.length * lh;
    const align = o.align || "center";
    ctx.textAlign = align;
    const x = align === "left" ? -w / 2 : align === "right" ? w / 2 : 0;
    if (o.style === "pill") {
      const px = s * 0.45, py = s * 0.22;
      ctx.fillStyle = o.color;
      roundRect(ctx, -w / 2 - px, -h / 2 - py, w + px * 2, h + py * 2, s * 0.32);
      ctx.fill();
    }
    lines.forEach((line, i) => {
      const y = -h / 2 + lh * (i + 0.5);
      if (o.style === "outline") {
        ctx.lineJoin = "round";
        ctx.lineWidth = s * 0.16;
        ctx.strokeStyle = contrastOn(o.color) === "#FFFFFF" ? "#FFFFFF" : "#1F1B18";
        ctx.strokeText(line, x, y);
      }
      ctx.save();
      if (o.style === "neon") { ctx.shadowColor = o.color; ctx.shadowBlur = s * 0.45; }
      if (o.style === "shadow") { ctx.shadowColor = "rgba(0,0,0,.45)"; ctx.shadowBlur = s * 0.14; ctx.shadowOffsetY = s * 0.06; }
      ctx.fillStyle = o.style === "pill" ? contrastOn(o.color) : o.style === "neon" ? neonCore(o.color) : o.color;
      ctx.fillText(line, x, y);
      if (o.style === "neon") ctx.fillText(line, x, y); // second pass for a stronger glow
      ctx.restore();
    });
  } else if (o.type === "music") {
    drawRecord(ctx, o);
  }
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawRecord(ctx, o) {
  const R = RECORD_R;
  // vinyl
  const g = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.1, 0, 0, R);
  g.addColorStop(0, "#3a3a3a");
  g.addColorStop(0.55, "#141414");
  g.addColorStop(1, "#050505");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.07)";
  ctx.lineWidth = 1.5;
  for (let r = R * 0.5; r < R * 0.97; r += 6) { ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke(); }
  // shine
  ctx.strokeStyle = "rgba(255,255,255,.16)";
  ctx.lineWidth = R * 0.12;
  ctx.beginPath(); ctx.arc(0, 0, R * 0.74, -2.4, -1.7); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, R * 0.74, 0.75, 1.45); ctx.stroke();
  // label = song art
  const L = R * 0.44;
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, L, 0, Math.PI * 2);
  ctx.clip();
  if (o.thumb) {
    const t = o.thumb, side = Math.min(t.naturalWidth, t.naturalHeight);
    ctx.drawImage(t, (t.naturalWidth - side) / 2, (t.naturalHeight - side) / 2, side, side, -L, -L, L * 2, L * 2);
  } else {
    ctx.fillStyle = "#E5484D";
    ctx.fillRect(-L, -L, L * 2, L * 2);
  }
  ctx.restore();
  ctx.fillStyle = "#FBF6EC";
  ctx.beginPath(); ctx.arc(0, 0, R * 0.05, 0, Math.PI * 2); ctx.fill();
  // song tag underneath
  const title = trimTo(ctx, `♫  ${o.title}`, '700 26px "DM Sans", -apple-system, sans-serif', R * 2.5);
  const by = o.author ? trimTo(ctx, o.author, '500 21px "DM Sans", -apple-system, sans-serif', R * 2.5) : "";
  ctx.font = '700 26px "DM Sans", -apple-system, sans-serif';
  const w1 = ctx.measureText(title).width;
  ctx.font = '500 21px "DM Sans", -apple-system, sans-serif';
  const w2 = by ? ctx.measureText(by).width : 0;
  const tw = Math.max(w1, w2) + 40, th = by ? 74 : 50, ty = R + 16;
  ctx.fillStyle = "rgba(255,253,248,.95)";
  roundRect(ctx, -tw / 2, ty, tw, th, 18);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#1F1B18";
  ctx.font = '700 26px "DM Sans", -apple-system, sans-serif';
  ctx.fillText(title, 0, ty + (by ? 24 : th / 2));
  if (by) {
    ctx.fillStyle = "#7A6E62";
    ctx.font = '500 21px "DM Sans", -apple-system, sans-serif';
    ctx.fillText(by, 0, ty + 52);
  }
}

function trimTo(ctx, text, font, max) {
  ctx.font = font;
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + "…").width > max) t = t.slice(0, -1);
  return t + "…";
}

/* ───────────── shared bits ───────────── */

function Palette({ color, onPick, recents }) {
  const start = Math.max(0, FAMILIES.findIndex((f) => f.shades.includes(color)));
  const [family, setFamily] = useState(start);
  return (
    <div className="palette">
      <div className="families">
        {FAMILIES.map((f, i) => (
          <button
            key={f.name}
            className={`family ${family === i ? "on" : ""}`}
            style={{ "--c": f.shades[i === 9 ? 5 : 2] }}
            onClick={() => { setFamily(i); onPick(f.shades[i === 9 ? 5 : 2]); }}
            aria-label={f.name}
          />
        ))}
      </div>
      <div className="shades">
        {FAMILIES[family].shades.map((c) => (
          <button key={c} className={`shade ${color === c ? "on" : ""}`} style={{ "--c": c }} onClick={() => onPick(c)} aria-label={c} />
        ))}
      </div>
      {recents?.length > 1 && (
        <div className="recents">
          <span className="label">Recent</span>
          {recents.map((c) => (
            <button key={c} className={`swatch mini ${color === c ? "on" : ""}`} style={{ "--c": c }} onClick={() => onPick(c)} aria-label={c} />
          ))}
        </div>
      )}
    </div>
  );
}

function TextEditor({ initial, onDone, onCancel, recents, onColor }) {
  const [t, setT] = useState({ fs: TEXT_BASE, align: "center", ...initial });
  const [panel, setPanel] = useState("fonts"); // fonts | colors
  const f = fontOf(t.font);
  const fg = t.style === "pill" ? contrastOn(t.color) : t.style === "neon" ? neonCore(t.color) : t.color;
  const shown = Math.round(t.fs * 0.62);
  const nextStyle = () => setT({ ...t, style: TEXT_STYLES[(TEXT_STYLES.findIndex((x) => x.id === t.style) + 1) % TEXT_STYLES.length].id });
  const nextAlign = () => setT({ ...t, align: t.align === "center" ? "left" : t.align === "left" ? "right" : "center" });
  const styleName = TEXT_STYLES.find((x) => x.id === t.style)?.name;
  return (
    <div className="text-editor">
      <div className="te-top">
        <button className="te-link" onClick={onCancel}>Cancel</button>
        <div className="te-icons">
          <button className="te-icon" onClick={nextAlign} aria-label={`Align ${t.align}`} title="Alignment">
            <span className={`align-ico ${t.align}`}><i /><i /><i /></span>
          </button>
          <button className={`te-icon style-${t.style}`} onClick={nextStyle} aria-label={`Style: ${styleName}`} title={styleName}>A</button>
          <button
            className={`te-icon color-dot ${panel === "colors" ? "on" : ""}`}
            style={{ "--c": t.color }}
            onClick={() => setPanel(panel === "colors" ? "fonts" : "colors")}
            aria-label="Colour"
          />
        </div>
        <button className="te-done" onClick={() => onDone(t)}>Done</button>
      </div>
      <div className="te-stage">
        <input
          className="te-size"
          type="range"
          min="28"
          max="150"
          value={t.fs}
          onChange={(e) => setT({ ...t, fs: Number(e.target.value) })}
          aria-label="Text size"
        />
        <textarea
          autoFocus
          value={t.text}
          placeholder="Type…"
          onChange={(e) => setT({ ...t, text: e.target.value })}
          rows={Math.max(1, t.text.split("\n").length)}
          style={{
            font: f.css.replace("{s}", shown),
            lineHeight: f.lh,
            textAlign: t.align,
            color: fg,
            // dark text on the dark editing backdrop gets a light card behind it, so you can always see what you type
            background: t.style === "pill" ? t.color : contrastOn(fg.startsWith("#") ? fg : "#FFFFFF") === "#FFFFFF" ? "rgba(255,253,248,.92)" : "transparent",
            WebkitTextStroke: t.style === "outline" ? `${shown * 0.12}px ${contrastOn(t.color) === "#FFFFFF" ? "#fff" : "#1F1B18"}` : "0",
            textShadow: t.style === "neon" ? `0 0 ${shown * 0.3}px ${t.color}, 0 0 ${shown * 0.6}px ${t.color}` : t.style === "shadow" ? `0 ${shown * 0.06}px ${shown * 0.14}px rgba(0,0,0,.5)` : "none",
            paintOrder: "stroke fill",
          }}
        />
      </div>
      <div className="te-bottom">
        {panel === "fonts" ? (
          <div className="fonts">
            {FONTS.map((x) => (
              <button key={x.id} className={`font-chip ${t.font === x.id ? "on" : ""}`} style={{ font: x.css.replace("{s}", 16) }} onClick={() => setT({ ...t, font: x.id })}>
                {x.name}
              </button>
            ))}
          </div>
        ) : (
          <Palette color={t.color} recents={recents} onPick={(c) => { setT({ ...t, color: c }); onColor(c); }} />
        )}
      </div>
    </div>
  );
}

/* ───────────── the editor ───────────── */

const loadRecents = () => {
  try { return JSON.parse(localStorage.getItem("scribbles-recent-colors") || "[]"); } catch (_) { return []; }
};

export default function Editor({ k, me, base, startWith, initialMusic, replyTo, partner, onClose, onSent }) {
  const baseRef = useRef(null);
  const inkRef = useRef(null);
  const liveRef = useRef(null);
  const wrapRef = useRef(null);
  const libRef = useRef(null);
  const camRef = useRef(null);
  const strokes = useRef([]);
  const hist = useRef({ past: [], future: [] }); // undo / redo: whole-picture snapshots
  const live = useRef(null);
  const frame = useRef(0);
  const baseFrame = useRef(0);
  const penSeen = useRef(false);
  const gesture = useRef(null);
  const lastTap = useRef({ id: null, t: 0 });

  const [tool, setTool] = useState(startWith === "library" ? "photo" : "draw");
  const [color, setColor] = useState("#1F1B18");
  const [recents, setRecents] = useState([]);
  const [size, setSize] = useState(10);
  const [brush, setBrush] = useState("pen");
  const [smooth, setSmooth] = useState(0.5);
  const [paper, setPaper] = useState(PAPERS[0].c);
  const [baseImg, setBaseImg] = useState(null);
  const [photo, setPhoto] = useState(null); // { img, ox, oy, z }
  const [filter, setFilter] = useState("none");
  const [objects, setObjects] = useState([]);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(null); // text object being typed
  const [unit, setUnit] = useState(0.4); // screen px per picture unit
  const [link, setLink] = useState("");
  const [musicBusy, setMusicBusy] = useState(false);
  const [songs, setSongs] = useState([]); // your shared song library (unlocked on this device)
  const [songTab, setSongTab] = useState("mine");
  const [artist, setArtist] = useState(null);
  const [count, setCount] = useState(0);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [touchy, setTouchy] = useState(true);

  const objRef = useRef(objects);
  objRef.current = objects;
  const photoRef = useRef(photo);
  photoRef.current = photo;
  const filterRef = useRef(filter);
  filterRef.current = filter;
  const paperRef = useRef(paper);
  paperRef.current = paper;

  // Every change is recorded first, so each one can be undone and redone on its own.
  const snap = () => ({ strokes: strokes.current, objects: objRef.current, photo: photoRef.current, filter: filterRef.current, paper: paperRef.current });
  function record() {
    const h = hist.current;
    h.past.push(snap());
    if (h.past.length > 150) h.past.shift();
    h.future = [];
    setCount((c) => c + 1);
  }
  function restore(st) {
    strokes.current = st.strokes;
    redraw();
    setObjects(st.objects);
    setPhoto(st.photo);
    setFilter(st.filter);
    setPaper(st.paper);
    setSelected(null);
    setCount((c) => c + 1);
  }
  function undo() {
    const h = hist.current;
    if (!h.past.length) return;
    h.future.push(snap());
    restore(h.past.pop());
  }
  function redo() {
    const h = hist.current;
    if (!h.future.length) return;
    h.past.push(snap());
    restore(h.future.pop());
  }
  useEffect(() => {
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z" || e.target.closest?.("input,textarea")) return;
      e.preventDefault();
      e.shiftKey ? redo() : undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.body.classList.add("drawing");
    setTouchy(window.matchMedia("(pointer: coarse)").matches);
    setRecents(loadRecents());
    FONTS.forEach((f) => document.fonts?.load?.(f.css.replace("{s}", 40)).catch(() => {}));
    if (startWith === "library") setTimeout(() => libRef.current?.click(), 250);
    if (startWith === "camera") setTimeout(() => openCamera(), 150);
    const el = wrapRef.current;
    // Stop the page scrolling while you draw, but never block taps on buttons and text boxes.
    const stop = (e) => { if (!e.target.closest("textarea,input,button,.sel-bar")) e.preventDefault(); };
    el.addEventListener("touchstart", stop, { passive: false });
    el.addEventListener("touchmove", stop, { passive: false });
    el.addEventListener("contextmenu", stop);
    const ro = new ResizeObserver(() => setUnit(el.clientWidth / SIZE));
    ro.observe(el);
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("drawing");
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("touchmove", stop);
      el.removeEventListener("contextmenu", stop);
      ro.disconnect();
    };
  }, [startWith]);

  useEffect(() => {
    if (!base) return;
    loadImg(base).then(setBaseImg).catch(() => {});
  }, [base]);

  // Background layer.
  function paintBase() {
    baseFrame.current = 0;
    const ctx = baseRef.current.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, SIZE, SIZE);
    const ph = photoRef.current;
    if (ph) {
      const { img, ox, oy, z } = ph;
      const cover = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight);
      const sc = cover * z;
      const w = img.naturalWidth * sc, h = img.naturalHeight * sc;
      ctx.drawImage(img, SIZE / 2 + ox - w / 2, SIZE / 2 + oy - h / 2, w, h);
      applyFilter(ctx, filter);
    } else if (baseImg) {
      ctx.drawImage(baseImg, 0, 0, SIZE, SIZE);
    }
  }
  useEffect(paintBase, [paper, baseImg, photo, filter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (paper === NIGHT && color === "#1F1B18") setColor("#FFFFFF");
    if (paper !== NIGHT && color === "#FFFFFF") setColor("#1F1B18");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper]);

  function pickColor(c) {
    setColor(c);
    const next = [c, ...recents.filter((x) => x !== c)].slice(0, 8);
    setRecents(next);
    try { localStorage.setItem("scribbles-recent-colors", JSON.stringify(next)); } catch (_) {}
  }

  /* ink */
  const activeStrokes = () => strokes.current;
  function redraw() {
    const ctx = inkRef.current.getContext("2d");
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, SIZE, SIZE);
    activeStrokes().forEach((s) => renderStroke(ctx, s));
  }
  function paintLive() {
    frame.current = 0;
    const s = live.current;
    const ctx = liveRef.current.getContext("2d");
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (s && !s.erase) renderStroke(ctx, s);
  }
  const schedule = () => { if (!frame.current) frame.current = requestAnimationFrame(paintLive); };
  const scheduleBase = () => { if (!baseFrame.current) baseFrame.current = requestAnimationFrame(paintBase); };

  const toXY = (e) => {
    const r = liveRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) * SIZE) / r.width, ((e.clientY - r.top) * SIZE) / r.height];
  };

  /* canvas pointer: draw, pan/zoom the photo, or tap to add text */
  function down(e) {
    if (e.pointerType === "pen") penSeen.current = true;
    if (e.pointerType === "touch" && penSeen.current && tool === "draw") return; // palm rejection
    e.preventDefault();
    setSelected(null);
    const [x, y] = toXY(e);

    if (tool === "photo" && photo) {
      if (gesture.current?.kind !== "photo") record();
      const g = gesture.current?.kind === "photo" ? gesture.current : { kind: "photo", pts: new Map() };
      g.pts.set(e.pointerId, [x, y]);
      g.start = { ...photoRef.current, pts: new Map(g.pts) };
      gesture.current = g;
      try { liveRef.current.setPointerCapture(e.pointerId); } catch (_) {}
      return;
    }
    if (tool === "text") return addText(x, y);
    if (tool === "sticker") return;
    if (tool !== "draw" || live.current) return;

    try { liveRef.current.setPointerCapture(e.pointerId); } catch (_) {}
    const pencil = e.pointerType === "pen";
    const erase = brush === "erase";
    const s = {
      color, size: erase ? size * 2.2 : size, brush: erase ? "marker" : brush, erase,
      pts: [[x, y, pencil ? clamp(e.pressure || 0.5, 0.05, 1) : 0.55]], pid: e.pointerId, pencil, t: e.timeStamp,
    };
    live.current = s;
    if (erase) {
      const ctx = inkRef.current.getContext("2d");
      styleFor(ctx, s);
      ctx.beginPath();
      ctx.arc(x, y, s.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else schedule();
  }

  function move(e) {
    const g = gesture.current;
    if (g?.kind === "photo" && g.pts.has(e.pointerId)) {
      g.pts.set(e.pointerId, toXY(e));
      const st = g.start;
      const ids = [...g.pts.keys()];
      if (ids.length === 1) {
        const [a0] = [st.pts.get(ids[0])], a1 = g.pts.get(ids[0]);
        if (!a0) return;
        setPhoto({ ...photoRef.current, ox: st.ox + a1[0] - a0[0], oy: st.oy + a1[1] - a0[1] });
      } else {
        const [i, j] = ids;
        const a0 = st.pts.get(i), b0 = st.pts.get(j), a1 = g.pts.get(i), b1 = g.pts.get(j);
        if (!a0 || !b0) return;
        const d0 = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]) || 1;
        const d1 = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]);
        const z = clamp(st.z * (d1 / d0), minZoom(st.img), 6);
        const m0 = mid(a0, b0), m1 = mid(a1, b1);
        setPhoto({ ...photoRef.current, z, ox: st.ox + m1[0] - m0[0], oy: st.oy + m1[1] - m0[1] });
      }
      scheduleBase();
      return;
    }
    const s = live.current;
    if (!s || e.pointerId !== s.pid) return;
    const batch = e.nativeEvent.getCoalescedEvents?.();
    const evs = batch && batch.length ? batch : [e.nativeEvent];
    for (const ev of evs) {
      const [rx, ry] = toXY(ev);
      const prev = s.pts[s.pts.length - 1];
      const kk = s.erase ? 0 : smooth * 0.85;
      const x = prev[0] + (rx - prev[0]) * (1 - kk);
      const y = prev[1] + (ry - prev[1]) * (1 - kk);
      const dist = Math.hypot(x - prev[0], y - prev[1]);
      if (dist < 1.2) continue;
      let p;
      if (s.pencil) p = clamp(ev.pressure || prev[2], 0.05, 1);
      else {
        const dt = Math.max(1, ev.timeStamp - s.t);
        p = clamp(0.9 - (dist / dt) * 0.12, 0.28, 0.9);
      }
      p = prev[2] * 0.65 + p * 0.35;
      s.t = ev.timeStamp;
      s.pts.push([x, y, p]);
      if (s.erase) {
        const ctx = inkRef.current.getContext("2d");
        styleFor(ctx, s);
        drawSegment(ctx, s, s.pts.length);
      }
    }
    if (!s.erase) schedule();
  }

  function up(e) {
    const g = gesture.current;
    if (g?.kind === "photo" && g.pts.has(e.pointerId)) {
      g.pts.delete(e.pointerId);
      g.start = { ...photoRef.current, pts: new Map(g.pts) };
      if (!g.pts.size) gesture.current = null;
      return;
    }
    const s = live.current;
    if (!s || e.pointerId !== s.pid) return;
    live.current = null;
    const [rx, ry] = toXY(e);
    const last = s.pts[s.pts.length - 1];
    if (Math.hypot(rx - last[0], ry - last[1]) > 1) s.pts.push([rx, ry, last[2] * 0.7]);
    const { pid, pencil, t, ...stroke } = s;
    record();
    strokes.current = [...strokes.current, stroke];
    paintLive();
    redraw();
    setCount((c) => c + 1);
  }

  const wheelT = useRef(0);
  function wheel(e) {
    if (tool !== "photo" || !photo) return;
    if (performance.now() - wheelT.current > 600) record();
    wheelT.current = performance.now();
    const z = clamp(photo.z * (e.deltaY < 0 ? 1.06 : 0.94), minZoom(photo.img), 6);
    setPhoto({ ...photo, z });
  }

  const minZoom = (img) => {
    const cover = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight);
    const fit = Math.min(SIZE / img.naturalWidth, SIZE / img.naturalHeight);
    return (fit / cover) * 0.6;
  };

  /* objects */
  function addObject(o, { recorded = false } = {}) {
    const obj = { id: uid(), x: SIZE / 2, y: SIZE / 2, scale: 1, rot: 0, ...o };
    if (!recorded) record();
    setObjects((list) => [...list, obj]);
    setSelected(obj.id);
    setCount((c) => c + 1);
    return obj;
  }
  function updateObject(id, patch) {
    setObjects((list) => list.map((o) => (o.id === id ? { ...o, ...patch } : o)));
  }
  function removeObject(id) {
    record();
    setObjects((list) => list.filter((o) => o.id !== id));
    setSelected(null);
    setCount((c) => c + 1);
  }
  function addText(x = SIZE / 2, y = SIZE / 2) {
    setEditing({ id: null, text: "", font: "classic", fs: TEXT_BASE, align: "center", color: color === "#FFFFFF" && paper !== NIGHT ? "#1F1B18" : color, style: "plain", x, y });
  }
  function finishText(t) {
    const text = t.text.replace(/\s+$/, "");
    if (t.id) {
      record();
      if (text) updateObject(t.id, { text, font: t.font, color: t.color, style: t.style, fs: t.fs, align: t.align });
      else { setObjects((list) => list.filter((o) => o.id !== t.id)); setSelected(null); }
    } else if (text) {
      addObject({ type: "text", text, font: t.font, color: t.color, style: t.style, fs: t.fs, align: t.align, x: t.x, y: t.y });
    }
    setEditing(null);
  }

  /*
    Gestures (rules in lib/gestures.js), Instagram-style:
    - one finger drags, two fingers pinch & twist (the second finger can land anywhere)
    - while your fingers move, the item is moved on screen directly (no page re-render) so it
      tracks smoothly; the new position is saved once you let go
    - editing is deliberate: the first tap selects, a tap on the already-selected text (or ✎) edits.
      Drags, pinches, holds and interrupted touches never open the editor.
  */
  const zTop = useRef(1);
  const guideV = useRef(null), guideH = useRef(null), trashRef = useRef(null);
  const [busy, setBusy] = useState(false); // hides the little ✎ / 🗑 bar while you're moving something
  const buzz = () => navigator.vibrate?.(G.hapticMs);

  function snapshot(g) {
    const cur = g.cur || objRef.current.find((x) => x.id === g.id);
    g.start = { ...cur, pts: new Map(g.pts) };
  }
  function paint(g, v) {
    g.cur = { ...g.cur, ...v };
    const el = g.el;
    if (!el) return;
    el.style.left = `${(g.cur.x / SIZE) * 100}%`;
    el.style.top = `${(g.cur.y / SIZE) * 100}%`;
    el.style.transform = `translate(-50%, -50%) rotate(${g.cur.rot}rad) scale(${g.cur.scale})`;
  }
  const show = (ref, on, cls = "show") => ref.current?.classList.toggle(cls, on);

  function objDown(e, o, mode = "move") {
    e.stopPropagation();
    e.preventDefault();
    const wasSelected = selected === o.id;
    const el = e.currentTarget.closest(".obj");
    zTop.current += 1;
    if (el) el.style.zIndex = zTop.current; // bring to front without a re-render
    try { wrapRef.current.setPointerCapture(e.pointerId); } catch (_) {}
    const g = {
      kind: "obj", id: o.id, mode, el, wasSelected, z: zTop.current,
      pts: new Map([[e.pointerId, [e.clientX, e.clientY]]]), t0: performance.now(), moved: 0, multi: false, snap: {},
      cur: { x: o.x, y: o.y, scale: o.scale, rot: o.rot },
    };
    snapshot(g);
    gesture.current = g;
    if (!wasSelected) setSelected(o.id);
  }

  // A second finger anywhere on the screen (not only on the picture) joins the move as a pinch.
  const downRef = useRef(null);
  downRef.current = wrapDownCapture;
  useEffect(() => {
    const onDown = (e) => {
      if (gesture.current?.kind === "obj" && !wrapRef.current?.contains(e.target)) downRef.current(e);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, []);
  function wrapDownCapture(e) {
    const g = gesture.current;
    if (g?.kind !== "obj" || g.pts.has(e.pointerId) || g.mode !== "move") return;
    e.stopPropagation();
    e.preventDefault();
    try { wrapRef.current.setPointerCapture(e.pointerId); } catch (_) {}
    g.pts.set(e.pointerId, [e.clientX, e.clientY]);
    g.multi = true;
    show(trashRef, false); show(trashRef, false, "hot");
    snapshot(g);
  }

  function wrapMove(e) {
    const g = gesture.current;
    if (g?.kind !== "obj" || !g.pts.has(e.pointerId)) return;
    g.pts.set(e.pointerId, [e.clientX, e.clientY]);
    const st = g.start;
    const u = unit || 0.4;
    const ids = [...g.pts.keys()];
    const first = st.pts.get(ids[0]);
    if (first) g.moved = Math.max(g.moved, Math.hypot(e.clientX - first[0], e.clientY - first[1]));
    if (g.moved < G.tapMaxMovePx && !g.multi && g.mode === "move") return; // tiny wobble: not a move yet
    if (!g.active) { g.active = true; g.el?.classList.add("lifted"); setBusy(true); }
    const snapRot = (r) => {
      const step = Math.PI / 2, near = Math.round(r / step) * step;
      return Math.abs(r - near) < (G.rotationSnapDeg * Math.PI) / 180 ? near : r;
    };

    if (g.mode === "handle") {
      const r = wrapRef.current.getBoundingClientRect();
      const cx = r.left + st.x * u, cy = r.top + st.y * u;
      const p0 = st.pts.get(ids[0]), p1 = g.pts.get(ids[0]);
      const d0 = Math.hypot(p0[0] - cx, p0[1] - cy) || 1, d1 = Math.hypot(p1[0] - cx, p1[1] - cy);
      const a0 = Math.atan2(p0[1] - cy, p0[0] - cx), a1 = Math.atan2(p1[1] - cy, p1[0] - cx);
      return paint(g, { scale: clamp(st.scale * (d1 / d0), G.minScale, G.maxScale), rot: snapRot(st.rot + a1 - a0) });
    }
    if (ids.length === 1 && !g.multi) {
      const p0 = st.pts.get(ids[0]), p1 = g.pts.get(ids[0]);
      if (!p0) return;
      let x = clamp(st.x + (p1[0] - p0[0]) / u, 0, SIZE);
      let y = clamp(st.y + (p1[1] - p0[1]) / u, 0, SIZE);
      const sv = Math.abs(x - SIZE / 2) < G.snapDistance, sh = Math.abs(y - SIZE / 2) < G.snapDistance;
      if (sv) x = SIZE / 2;
      if (sh) y = SIZE / 2;
      if ((sv && !g.snap.v) || (sh && !g.snap.h)) buzz();
      g.snap = { v: sv, h: sh };
      show(guideV, sv); show(guideH, sh);
      if (g.moved > G.trashShowAfterPx) {
        const r = wrapRef.current.getBoundingClientRect();
        const fx = (p1[0] - r.left) / u, fy = (p1[1] - r.top) / u;
        const hot = Math.hypot(fx - SIZE / 2, fy - G.trashY) < G.trashRadius;
        if (hot && !g.hot) buzz();
        g.hot = hot;
        show(trashRef, true); show(trashRef, hot, "hot");
        g.el?.classList.toggle("doomed", hot);
      }
      return paint(g, { x, y });
    }
    if (ids.length >= 2) {
      const [i, j] = ids;
      const a0 = st.pts.get(i), b0 = st.pts.get(j), a1 = g.pts.get(i), b1 = g.pts.get(j);
      if (!a0 || !b0) return;
      const d0 = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]) || 1, d1 = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]);
      const ang0 = Math.atan2(b0[1] - a0[1], b0[0] - a0[0]), ang1 = Math.atan2(b1[1] - a1[1], b1[0] - a1[0]);
      const m0 = mid(a0, b0), m1 = mid(a1, b1);
      paint(g, {
        scale: clamp(st.scale * (d1 / d0), G.minScale, G.maxScale),
        rot: snapRot(st.rot + ang1 - ang0),
        x: clamp(st.x + (m1[0] - m0[0]) / u, 0, SIZE),
        y: clamp(st.y + (m1[1] - m0[1]) / u, 0, SIZE),
      });
    }
  }

  function wrapUp(e) {
    const g = gesture.current;
    if (g?.kind !== "obj" || !g.pts.has(e.pointerId)) return;
    g.pts.delete(e.pointerId);
    if (g.pts.size) { snapshot(g); return; } // one finger lifted mid-pinch: carry on with the other
    gesture.current = null;
    g.el?.classList.remove("lifted", "doomed");
    show(guideV, false); show(guideH, false); show(trashRef, false); show(trashRef, false, "hot");
    setBusy(false);
    if (g.hot && !g.multi) { removeObject(g.id); buzz(); return; }
    if (g.active) { record(); updateObject(g.id, { ...g.cur, z: g.z }); return; } // save where it ended up (undoable)
    updateObject(g.id, { z: g.z });
    // A tap: only a real lift of the finger counts (an interrupted touch never does).
    const isTap =
      e.type === "pointerup" && g.mode === "move" && !(G.pinchLocksOutTap && g.multi) &&
      g.moved < G.tapMaxMovePx && performance.now() - g.t0 < G.tapMaxMs;
    if (isTap && g.wasSelected) {
      const o = objRef.current.find((x) => x.id === g.id);
      if (o?.type === "text") setEditing({ ...o });
    }
  }

  function objWheel(e, o) {
    e.stopPropagation();
    updateObject(o.id, e.shiftKey ? { rot: o.rot + (e.deltaY > 0 ? 0.08 : -0.08) } : { scale: clamp(o.scale * (e.deltaY < 0 ? 1.06 : 0.94), G.minScale, G.maxScale) });
  }

  // Delete / Backspace removes the selected item (keyboard users).
  useEffect(() => {
    const onKey = (e) => {
      if (!selected || editing || e.target.closest?.("input,textarea")) return;
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); removeObject(selected); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  /* music */
  useEffect(() => {
    const key = getKey();
    if (!key) return;
    fetch(`/api/songs?k=${encodeURIComponent(k)}`)
      .then((r) => r.json())
      .then(async (j) => {
        const open = await Promise.all((j.songs || []).map((x) => unlockJSON(key, x.enc).then((s) => ({ ...s, by: x.by, at: x.at })).catch(() => null)));
        setSongs(open.filter(Boolean));
      })
      .catch(() => {});
  }, [k]);

  async function placeSong(song) {
    const thumb = await loadImg(`/api/music/thumb?id=${song.vid}`).catch(() => null);
    record();
    setObjects((list) => list.filter((o) => o.type !== "music"));
    addObject({
      type: "music",
      vid: song.vid,
      title: song.title,
      author: song.artist || song.movie || (song.credits || [])[0] || "",
      thumb,
      x: SIZE * 0.7,
      y: SIZE * 0.28,
      scale: 0.85,
    }, { recorded: true });
  }

  useEffect(() => {
    if (initialMusic) { setTool("music"); placeSong(initialMusic); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function addMusic() {
    setErr("");
    setMusicBusy(true);
    try {
      const r = await fetch("/api/music", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ k, url: link }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Couldn't find that song");
      const song = { ...describeSong({ ...j, url: link }), by: me?.id, at: Date.now() };
      await placeSong(song);
      // Every song you use is also remembered in your library (locked).
      const key = getKey();
      if (key) {
        fetch("/api/songs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ k, enc: await lockJSON(key, song) }) });
        setSongs((list) => [song, ...list]);
      }
      setLink("");
    } catch (e) {
      setErr(e.message);
    }
    setMusicBusy(false);
  }

  // Unique songs (newest first) for each person, plus most-shared artists.
  const library = useMemo(() => {
    const seen = new Set();
    const list = songs
      .slice()
      .sort((a, b) => (b.at || 0) - (a.at || 0))
      .filter((x) => (songTab === "mine" ? x.by === me?.id : x.by !== me?.id))
      .filter((x) => !artist || x.artist === artist)
      .filter((x) => (seen.has(x.vid) ? false : seen.add(x.vid)));
    return { list: list.slice(0, 30), artists: topArtists(songs) };
  }, [songs, songTab, artist, me]);
  const music = objects.find((o) => o.type === "music");
  const selectedObj = objects.find((o) => o.id === selected);

  /* photo */
  // iPhone's own camera ignores our settings (it opened with flash), so iPhone/iPad/Mac use the
  // in-app camera. The Android app keeps the phone's camera app, which works well there.
  const [camOpen, setCamOpen] = useState(false);
  function openCamera() {
    if (window.ScribblesAndroid || !navigator.mediaDevices?.getUserMedia) camRef.current?.click();
    else setCamOpen(true);
  }
  function applyPhoto(img) {
    record();
    setPhoto({ img, ox: 0, oy: 0, z: 1 });
    setFilter("none");
    setTool("photo");
  }

  async function onPick(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr("");
    try {
      const img = await readPhoto(f);
      record();
      setPhoto({ img, ox: 0, oy: 0, z: 1 });
      setFilter("none");
      setTool("photo");
    } catch (_) {
      setErr("Couldn't open that photo. Try a different one?");
    }
  }
  function photoFit(kind) {
    if (!photo) return;
    const { img } = photo;
    const cover = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight);
    const fit = Math.min(SIZE / img.naturalWidth, SIZE / img.naturalHeight);
    record();
    setPhoto({ ...photo, ox: 0, oy: 0, z: kind === "fill" ? 1 : fit / cover });
  }

  /* clear */
  function clearInk() {
    if (!strokes.current.length) return;
    record();
    strokes.current = [];
    redraw();
  }

  const hasContent = useMemo(
    () => strokes.current.some((s) => !s.erase) || objects.length > 0 || Boolean(photo),
    [count, objects, photo] // eslint-disable-line react-hooks/exhaustive-deps
  );

  async function send() {
    setSending(true);
    setErr("");
    setSelected(null);
    try {
      await Promise.all(FONTS.map((f) => document.fonts?.load?.(f.css.replace("{s}", 40)).catch(() => {})));
      const out = document.createElement("canvas");
      out.width = out.height = SIZE;
      const ctx = out.getContext("2d");
      ctx.drawImage(baseRef.current, 0, 0);
      ctx.drawImage(inkRef.current, 0, 0);
      [...objects].sort((a, b) => (a.z || 1) - (b.z || 1)).forEach((o) => paintObject(ctx, o));
      const rich = photo || music;
      let data = rich ? out.toDataURL("image/jpeg", 0.88) : out.toDataURL("image/png");
      if (data.length > 1_100_000) data = out.toDataURL("image/jpeg", 0.82);
      const key = getKey();
      const songInfo = music ? { id: music.vid, title: music.title, author: music.author, x: music.x, y: music.y, r: RECORD_R * music.scale } : null;
      // End-to-end: lock the picture and the song on this phone before anything is uploaded.
      const image = key ? await lockImage(key, data) : data;
      const songPayload = songInfo ? (key ? { enc: await lockJSON(key, songInfo) } : songInfo) : null;
      const r = await fetch("/api/doodles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          k,
          image,
          bg: base || photo ? null : paper,
          music: songPayload,
          replyTo: replyTo || null,
        }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't send");
      const sentDoodle = (await r.json()).doodle;
      onSent({ ...sentDoodle, music: songInfo });
    } catch (e) {
      setErr(e.message || "Couldn't send. Try again?");
      setSending(false);
    }
  }

  const previewW = brush === "erase" ? size * 2.2 : brush === "highlight" ? size * 2.2 : size;
  const u = unit;

  return (
    <div className="sheet">
      <div className="sheet-top">
        <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        <div className="sheet-title">{replyTo ? "↩︎ reply to " : "for "}<em>{partner.name}</em></div>
        <div className="sheet-tools">
          <button className="icon" onClick={undo} disabled={!hist.current.past.length} aria-label="Undo">↶</button>
          <button className="icon" onClick={redo} disabled={!hist.current.future.length} aria-label="Redo">↷</button>
          <button className="icon" onClick={clearInk} disabled={!strokes.current.length} aria-label="Clear drawing">⌫</button>
          <button className="send-top" disabled={!hasContent || sending} onClick={send}>{sending ? "…" : "Send"}</button>
        </div>
      </div>

      <div className="sheet-body">
        <div className="canvas-col">
          <div
            className={`canvas-wrap tool-${tool}`}
            ref={wrapRef}
            onWheel={wheel}
            onPointerDownCapture={wrapDownCapture}
            onPointerMove={wrapMove}
            onPointerUp={wrapUp}
            onPointerCancel={wrapUp}
          >
            <canvas ref={baseRef} width={SIZE} height={SIZE} className="layer" />
            <canvas ref={inkRef} width={SIZE} height={SIZE} className="layer" />
            <canvas
              ref={liveRef}
              width={SIZE}
              height={SIZE}
              className="layer ink"
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            />
            <div className={`objects ${tool === "draw" ? "passive" : ""}`}>
              {objects.map((o) => (
                <div
                  key={o.id}
                  className={`obj obj-${o.type} ${selected === o.id ? "sel" : ""}`}
                  style={{
                    zIndex: o.z || 1,
                    left: `${(o.x / SIZE) * 100}%`,
                    top: `${(o.y / SIZE) * 100}%`,
                    transform: `translate(-50%, -50%) rotate(${o.rot}rad) scale(${o.scale})`,
                  }}
                  onPointerDown={(e) => objDown(e, o)}
                  onWheel={(e) => objWheel(e, o)}
                >
                  <ObjectView o={o} u={u} />
                  {selected === o.id && (
                    <span
                      className="obj-handle"
                      style={{ transform: `scale(${1 / o.scale})` }}
                      onPointerDown={(e) => objDown(e, o, "handle")}
                      aria-label="Resize and turn"
                    >
                      ⤡
                    </span>
                  )}
                </div>
              ))}
            </div>
            {/* the little bar above the selected item: ✎ edit (text) and 🗑 delete */}
            {selectedObj && !busy && tool !== "draw" && (
              <div
                className="sel-bar"
                style={{ left: `${(selectedObj.x / SIZE) * 100}%`, top: `${(selectedObj.y / SIZE) * 100}%` }}
                onPointerDown={(e) => e.stopPropagation()}
              >
                {selectedObj.type === "text" && <button onClick={() => setEditing({ ...selectedObj })}>✎ Edit</button>}
                <button onClick={() => removeObject(selectedObj.id)} aria-label="Delete">🗑 Delete</button>
              </div>
            )}
            <span ref={guideV} className="guide v" />
            <span ref={guideH} className="guide h" />
            <div ref={trashRef} className="trash" aria-hidden="true">🗑</div>
          </div>
        </div>

        <div className="side">
          <div className="dock">
            {TOOLS.filter((t) => t.id !== "paper" || !photo).map((t) => (
              <button key={t.id} className={`dock-btn ${tool === t.id ? "on" : ""}`} onClick={() => { setTool(t.id); setSelected(null); }}>
                <span className="di">{t.icon}</span>
                <span className="dn">{t.name}</span>
              </button>
            ))}
          </div>

          <div className="panel">
            {tool === "draw" && (
              <>
                <div className="row brushes">
                  {BRUSHES.map((b) => (
                    <button key={b.id} className={`brush ${brush === b.id ? "on" : ""}`} onClick={() => setBrush(b.id)}>
                      <b>{b.name}</b>
                      <span>{b.hint}</span>
                    </button>
                  ))}
                </div>
                {brush !== "erase" && <Palette color={color} recents={recents} onPick={pickColor} />}
                <div className="slider-row">
                  <span className="label">{brush === "erase" ? "Eraser size" : "Thickness"}</span>
                  <input type="range" min="1" max="60" step="1" value={size} onChange={(e) => setSize(Number(e.target.value))} />
                  <span className="preview">
                    <span
                      style={{
                        width: Math.max(3, Math.min(40, previewW / 1.5)),
                        height: Math.max(3, Math.min(40, previewW / 1.5)),
                        background: brush === "erase" ? "#B9AFA3" : color,
                        opacity: brush === "highlight" ? 0.45 : 1,
                      }}
                    />
                  </span>
                </div>
                {brush !== "erase" && (
                  <div className="slider-row">
                    <span className="label">Smoothing</span>
                    <input type="range" min="0" max="0.9" step="0.05" value={smooth} onChange={(e) => setSmooth(Number(e.target.value))} />
                    <span className="preview text">{smooth < 0.15 ? "Off" : smooth < 0.55 ? "Soft" : "Silky"}</span>
                  </div>
                )}
              </>
            )}

            {tool === "text" && (
              <div className="panel-msg">
                <button className="btn primary small-btn" onClick={() => addText()}>Add text</button>
                <p className="muted">Or tap anywhere on the picture to write there. Drag to move, pinch to resize and turn, tap to edit, drag to the bin to delete.</p>
              </div>
            )}

            {tool === "sticker" && (
              <EmojiGrid compact onPick={(st) => addObject({ type: "sticker", emoji: st, x: SIZE / 2 + (Math.random() - 0.5) * 200, y: SIZE / 2 + (Math.random() - 0.5) * 200 })} />
            )}

            {tool === "music" && (
              <div className="music-panel">
                {music ? (
                  <div className="music-now">
                    <div className="mini-record" style={{ backgroundImage: `url(/api/music/thumb?id=${music.vid})` }} />
                    <div className="mn-text">
                      <b>{music.title}</b>
                      <span className="muted">{music.author || "YouTube"}</span>
                    </div>
                    <button className="chip" onClick={() => removeObject(music.id)}>Remove</button>
                  </div>
                ) : (
                  <p className="muted">Pick a song, or paste a YouTube / YouTube Music link. It becomes a record {partner.name} can tap to play.</p>
                )}
                {songs.length > 0 && (
                  <div className="library">
                    <div className="lib-tabs">
                      <button className={songTab === "mine" ? "on" : ""} onClick={() => { setSongTab("mine"); setArtist(null); }}>Your songs</button>
                      <button className={songTab === "theirs" ? "on" : ""} onClick={() => { setSongTab("theirs"); setArtist(null); }}>{partner.name}&apos;s</button>
                    </div>
                    {library.artists.length > 1 && (
                      <div className="artist-chips">
                        {library.artists.map((a) => (
                          <button key={a.name} className={`chip ${artist === a.name ? "on" : ""}`} onClick={() => setArtist(artist === a.name ? null : a.name)}>
                            {a.name} <span className="muted">{a.count}</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="song-list">
                      {library.list.length === 0 && <p className="muted small-note">Nothing here yet. Share a song to Scribbles from YouTube Music.</p>}
                      {library.list.map((x) => (
                        <button key={x.vid + x.at} className="song-row" onClick={() => placeSong(x)}>
                          <span className="mini-record" style={{ backgroundImage: `url(https://i.ytimg.com/vi/${x.vid}/default.jpg)` }} />
                          <span className="sr-text">
                            <b>{x.title}</b>
                            <span>{[x.artist || (x.credits || []).slice(0, 2).join(", "), x.movie && `from ${x.movie}`].filter(Boolean).join(", ")}</span>
                          </span>
                          <span className={`kind ${x.kind === "song" ? "song" : ""}`}>{x.kind === "song" ? "♫" : "▶"}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="link-row">
                  <input
                    value={link}
                    onChange={(e) => setLink(e.target.value)}
                    placeholder="https://music.youtube.com/watch?v=…"
                    inputMode="url"
                    autoCapitalize="off"
                    autoCorrect="off"
                  />
                  <button
                    className="chip"
                    onClick={async () => { try { setLink(await navigator.clipboard.readText()); } catch (_) {} }}
                  >
                    Paste
                  </button>
                  <button className="chip on" disabled={!link || musicBusy} onClick={addMusic}>{musicBusy ? "…" : music ? "Swap" : "Add"}</button>
                </div>
              </div>
            )}

            {tool === "photo" && (
              <>
                <div className="row">
                  <div className="photo-btns left">
                    <button className="chip" onClick={() => libRef.current?.click()}>🖼 {photo ? "Change photo" : "Choose photo"}</button>
                    {touchy && <button className="chip" onClick={openCamera}>📷 Camera</button>}
                    {photo && <button className="chip" onClick={() => { record(); setPhoto(null); }}>Remove</button>}
                  </div>
                </div>
                {photo && (
                  <>
                    <p className="muted small-note">Drag the picture to move it. Pinch, scroll or use the slider to zoom.</p>
                    <div className="slider-row">
                      <span className="label">Zoom</span>
                      <input
                        type="range"
                        min={minZoom(photo.img)}
                        max="4"
                        step="0.01"
                        value={photo.z}
                        onPointerDown={record}
                        onChange={(e) => setPhoto({ ...photo, z: Number(e.target.value) })}
                      />
                      <span className="preview text">{Math.round(photo.z * 100)}%</span>
                    </div>
                    <div className="row photo-btns left">
                      <button className="chip" onClick={() => photoFit("fill")}>Fill square</button>
                      <button className="chip" onClick={() => photoFit("fit")}>Show whole</button>
                    </div>
                    <div className="row filters-row">
                      {FILTERS.map((f) => (
                        <button key={f.id} className={`chip ${filter === f.id ? "on" : ""}`} onClick={() => { if (filter !== f.id) { record(); setFilter(f.id); } }}>{f.name}</button>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {tool === "paper" && (
              <div className="row papers">
                {PAPERS.map((p) => (
                  <button key={p.c} className={`paper ${paper === p.c ? "on" : ""}`} style={{ "--c": p.c }} onClick={() => { if (paper !== p.c) { record(); setPaper(p.c); } }}>
                    {p.name}
                  </button>
                ))}
              </div>
            )}
            <input ref={libRef} type="file" accept="image/*" hidden onChange={onPick} />
            <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />
          </div>

          {err && <p className="err">{err}</p>}
          <button className="btn primary send" disabled={!hasContent || sending} onClick={send}>
            {sending ? "Sending…" : `Send to ${partner.name}`}
          </button>
        </div>
      </div>

      {camOpen && <Camera onClose={() => setCamOpen(false)} onShot={(img) => { setCamOpen(false); applyPhoto(img); }} />}

      {editing && (
        <TextEditor
          initial={editing}
          recents={recents}
          onColor={pickColor}
          onCancel={() => setEditing(null)}
          onDone={finishText}
        />
      )}
    </div>
  );
}

// On-screen version of each movable object (the picture gets the canvas-drawn twin when sent).
function ObjectView({ o, u }) {
  if (o.type === "sticker") return <span className="ov-sticker" style={{ fontSize: STICKER_BASE * u }}>{o.emoji}</span>;
  if (o.type === "text") {
    const f = fontOf(o.font);
    const s = (o.fs || TEXT_BASE) * u;
    return (
      <span
        className="ov-text"
        style={{
          font: f.css.replace("{s}", s),
          lineHeight: f.lh,
          textAlign: o.align || "center",
          color: o.style === "pill" ? contrastOn(o.color) : o.style === "neon" ? neonCore(o.color) : o.color,
          background: o.style === "pill" ? o.color : "transparent",
          padding: o.style === "pill" ? `${s * 0.22}px ${s * 0.45}px` : 0,
          borderRadius: s * 0.32,
          WebkitTextStroke: o.style === "outline" ? `${s * 0.16}px ${contrastOn(o.color) === "#FFFFFF" ? "#fff" : "#1F1B18"}` : undefined,
          textShadow: o.style === "neon" ? `0 0 ${s * 0.25}px ${o.color}, 0 0 ${s * 0.5}px ${o.color}` : o.style === "shadow" ? `0 ${s * 0.06}px ${s * 0.14}px rgba(0,0,0,.45)` : undefined,
          paintOrder: "stroke fill",
        }}
      >
        {o.text}
      </span>
    );
  }
  if (o.type === "music") {
    const R = RECORD_R * u;
    return (
      <span className="ov-music">
        <span className="rec spin" style={{ width: R * 2, height: R * 2 }}>
          <span className="rec-label" style={{ backgroundImage: `url(/api/music/thumb?id=${o.vid})` }} />
        </span>
        <span className="rec-tag" style={{ fontSize: 26 * u, marginTop: 16 * u, maxWidth: R * 2.6 }}>
          <b>♫ {o.title}</b>
          {o.author && <span>{o.author}</span>}
        </span>
      </span>
    );
  }
  return null;
}
