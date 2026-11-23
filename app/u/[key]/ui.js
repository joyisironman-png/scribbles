"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/* ───────────────────────── Emoji picker (WhatsApp-sized set, with search) ───────────────────────── */

let emojiData = null;
function useEmoji() {
  const [data, setData] = useState(emojiData);
  useEffect(() => {
    if (emojiData) return;
    fetch("/emoji.json")
      .then((r) => r.json())
      .then((d) => { delete d._moods; emojiData = d; setData(d); })
      .catch(() => {});
  }, []);
  return data;
}

const CAT_ICONS = { Recent: "🕘", Smileys: "😀", People: "👋", Animals: "🐶", Food: "🍓", Travel: "✈️", Activities: "⚽", Objects: "💡", Symbols: "❤️", Flags: "🏳️" };
const RECENT_KEY = "scribbles-recent-emoji";
export const recentEmoji = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]"); } catch (_) { return []; } };
export function rememberEmoji(e) {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([e, ...recentEmoji().filter((x) => x !== e)].slice(0, 32))); } catch (_) {}
}

export function EmojiGrid({ onPick, compact = false }) {
  const data = useEmoji();
  const [cat, setCat] = useState(() => (recentEmoji().length ? "Recent" : "Smileys"));
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    if (!data) return [];
    if (q.trim()) {
      const words = q.toLowerCase().split(/\s+/).filter(Boolean);
      const out = [];
      // match the start of words ("cat" finds 🐱, not "education")
      for (const c of Object.values(data)) for (const [e, kw] of c) {
        const kws = kw.split(" ");
        if (words.every((w) => kws.some((x) => x.startsWith(w)))) out.push(e);
      }
      return out.slice(0, 240);
    }
    if (cat === "Recent") return recentEmoji();
    return (data[cat] || []).map(([e]) => e);
  }, [data, cat, q]);
  const cats = data ? ["Recent", ...Object.keys(data)] : [];
  return (
    <div className={`emoji-grid-wrap ${compact ? "compact" : ""}`}>
      <input className="emoji-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search emoji" />
      {!q && (
        <div className="emoji-cats">
          {cats.map((c) => (
            <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)} aria-label={c}>{CAT_ICONS[c] || "•"}</button>
          ))}
        </div>
      )}
      <div className="emoji-grid">
        {!data && <p className="muted">Loading…</p>}
        {data && !list.length && <p className="muted">{cat === "Recent" && !q ? "Your recent emoji show up here." : "No matches."}</p>}
        {list.map((e) => (
          <button key={e} onClick={() => { rememberEmoji(e); onPick(e); }}>{e}</button>
        ))}
      </div>
    </div>
  );
}

export function EmojiSheet({ onPick, onClose, title = "Pick an emoji" }) {
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="bottom-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grabber" />
        <div className="bs-head"><b>{title}</b><button className="icon-btn" onClick={onClose} aria-label="Close">✕</button></div>
        <EmojiGrid onPick={(e) => { onPick(e); onClose(); }} />
      </div>
    </div>
  );
}

/* ───────────────────────── Touch: hold / double-tap / swipe to reply ─────────────────────────
   Rules (so nothing fires by accident):
   - hold: finger stays within 10px for 380ms        → onHold (little buzz)
   - double tap: two quick, still taps within 300ms  → onDoubleTap
   - swipe right: mostly-horizontal drag past 64px   → onSwipe (the item follows the finger, then springs back)
   - vertical movement is left to the page, so scrolling never triggers any of these */
export function useTouchActions({ onTap, onHold, onDoubleTap, onSwipe }) {
  const st = useRef(null);
  const lastTap = useRef(0);
  const tapTimer = useRef(0);
  const ref = useRef(null);

  const reset = (el) => {
    if (el) { el.style.transition = "transform .25s cubic-bezier(.2,.9,.3,1.3)"; el.style.transform = ""; }
  };

  const handlers = {
    onPointerDown(e) {
      if (e.button > 0) return;
      const el = ref.current;
      st.current = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false, horiz: false, held: false, id: e.pointerId };
      clearTimeout(st.current.hold);
      st.current.hold = setTimeout(() => {
        const s = st.current;
        if (s && !s.moved) { s.held = true; navigator.vibrate?.(10); onHold?.(e); }
      }, 380);
      if (el) el.style.transition = "none";
    },
    onPointerMove(e) {
      const s = st.current;
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!s.moved && Math.hypot(dx, dy) > 10) {
        s.moved = true;
        clearTimeout(s.hold);
        s.horiz = Math.abs(dx) > Math.abs(dy) * 1.6 && dx > 0;
      }
      if (s.horiz && onSwipe && ref.current) {
        const pull = Math.min(90, dx * 0.6);
        ref.current.style.transform = `translateX(${pull}px)`;
        if (pull > 62 && !s.armed) { s.armed = true; navigator.vibrate?.(8); }
        if (pull <= 62) s.armed = false;
      }
    },
    onPointerUp(e) {
      const s = st.current;
      st.current = null;
      if (!s || e.pointerId !== s.id) return;
      clearTimeout(s.hold);
      reset(ref.current);
      if (s.held) return;
      if (s.horiz && s.armed) return onSwipe?.();
      if (s.moved || performance.now() - s.t > 300) return;
      const now = performance.now();
      if (onDoubleTap && now - lastTap.current < 300) {
        clearTimeout(tapTimer.current);
        lastTap.current = 0;
        return onDoubleTap();
      }
      lastTap.current = now;
      if (onTap) {
        if (onDoubleTap) tapTimer.current = setTimeout(() => onTap(), 300);
        else onTap();
      }
    },
    onPointerCancel() {
      const s = st.current;
      st.current = null;
      if (s) clearTimeout(s.hold);
      reset(ref.current);
    },
    onContextMenu(e) { e.preventDefault(); },
  };
  return { ref, handlers };
}

/* ───────────────────────── Reaction popover (hold) ───────────────────────── */

export const QUICK = ["❤️", "😂", "😮", "😢", "🙏", "👍"];

export function ReactionPop({ mine, onPick, onMore, onReply, extra, onClose }) {
  const quick = [...new Set([...recentEmoji().slice(0, 2), ...QUICK])].slice(0, 7);
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="sheet-backdrop light" onClick={onClose}>
      <div className="react-pop" onClick={(e) => e.stopPropagation()}>
        <div className="rp-row">
          {quick.map((e) => (
            <button key={e} className={`rp-emo ${mine === e ? "on" : ""}`} onClick={() => { rememberEmoji(e); onPick(e); }}>{e}</button>
          ))}
          <button className="rp-emo more" onClick={onMore} aria-label="More">＋</button>
        </div>
        <div className="rp-actions">
          {onReply && <button onClick={onReply}>↩︎ Reply</button>}
          {extra}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── In-app camera (no flash, never leaves the app) ───────────────────────── */

export function Camera({ onShot, onClose }) {
  const video = useRef(null);
  const stream = useRef(null);
  const [facing, setFacing] = useState("environment");
  const [err, setErr] = useState("");
  const [torch, setTorch] = useState(null); // null = not available

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        stream.current?.getTracks().forEach((t) => t.stop());
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1920 } }, audio: false });
        if (dead) return s.getTracks().forEach((t) => t.stop());
        stream.current = s;
        video.current.srcObject = s;
        await video.current.play().catch(() => {});
        const caps = s.getVideoTracks()[0].getCapabilities?.() || {};
        setTorch(caps.torch ? false : null);
        setErr("");
      } catch (e) {
        setErr("Camera access was blocked. Allow the camera for Scribbles in your phone's settings, or choose a photo instead.");
      }
    })();
    return () => { dead = true; };
  }, [facing]);

  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  async function toggleTorch() {
    const t = stream.current?.getVideoTracks()[0];
    if (!t) return;
    try { await t.applyConstraints({ advanced: [{ torch: !torch }] }); setTorch(!torch); } catch (_) {}
  }

  function shoot() {
    const v = video.current;
    if (!v?.videoWidth) return;
    const side = Math.min(v.videoWidth, v.videoHeight);
    const c = document.createElement("canvas");
    c.width = c.height = Math.min(1600, side);
    const ctx = c.getContext("2d");
    if (facing === "user") { ctx.translate(c.width, 0); ctx.scale(-1, 1); } // selfies come out the way you saw them
    ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, c.width, c.height);
    navigator.vibrate?.(12);
    const img = new Image();
    img.onload = () => { stream.current?.getTracks().forEach((t) => t.stop()); onShot(img); };
    img.src = c.toDataURL("image/jpeg", 0.92);
  }

  return (
    <div className="camera">
      <div className="cam-top">
        <button className="cam-btn" onClick={onClose} aria-label="Close">✕</button>
        {torch !== null && <button className={`cam-btn ${torch ? "on" : ""}`} onClick={toggleTorch} aria-label="Torch">{torch ? "🔦" : "⚡︎"}</button>}
      </div>
      <div className="cam-view">
        <video ref={video} playsInline muted className={facing === "user" ? "mirror" : ""} />
        {err && <p className="cam-err">{err}</p>}
      </div>
      <div className="cam-bottom">
        <span />
        <button className="shutter" onClick={shoot} aria-label="Take photo" />
        <button className="cam-btn" onClick={() => setFacing(facing === "user" ? "environment" : "user")} aria-label="Flip camera">⟲</button>
      </div>
    </div>
  );
}
