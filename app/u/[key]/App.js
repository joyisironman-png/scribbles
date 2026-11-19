"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const SIZE = 900; // drawings are saved as 900×900 squares

const INKS = ["#1F1B18", "#E5484D", "#F2994A", "#F5C842", "#3BA272", "#3E7BFA", "#8E5CF6", "#EF6FA6", "#FFFFFF"];
const SIZES = [6, 14, 30];
const PAPERS = [
  { name: "Paper", c: "#FBF6EC" },
  { name: "Blush", c: "#FCE3E1" },
  { name: "Mint", c: "#DDF2E3" },
  { name: "Sky", c: "#DCE8FB" },
  { name: "Butter", c: "#FFF0BF" },
  { name: "Night", c: "#1E2233" },
];

function ago(ts) {
  if (!ts) return "";
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function when(ts) {
  return new Date(ts).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function b64ToBytes(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

/* ───────────────────────── App ───────────────────────── */

export default function App({ k, me, partner }) {
  const [doodles, setDoodles] = useState(null);
  const [drawing, setDrawing] = useState(null); // null | { base: url|null }
  const [viewing, setViewing] = useState(null); // { list, i }
  const [toast, setToast] = useState("");
  const [push, setPush] = useState("checking");
  const [vapid, setVapid] = useState(null);
  const [tab, setTab] = useState("today");
  const [remind, setRemind] = useState(true);
  const [, tick] = useState(0);

  const img = useCallback((id) => `/api/image/${id}?k=${encodeURIComponent(k)}`, [k]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/doodles?k=${encodeURIComponent(k)}&limit=300`, { cache: "no-store" });
      if (r.ok) setDoodles((await r.json()).doodles);
    } catch (_) {}
  }, [k]);

  // Initial load, polling while open, refresh on return to the app.
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 15000);
    const onVis = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVis);
    const clock = setInterval(() => tick((n) => n + 1), 30000);
    return () => { clearInterval(t); clearInterval(clock); document.removeEventListener("visibilitychange", onVis); };
  }, [load]);

  // Service worker + notification state.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/me?k=${encodeURIComponent(k)}`);
        const j = await r.json();
        setVapid(j.vapidPublicKey);
        setRemind(j.remind !== false);
        if (!j.vapidPublicKey) return setPush("off-server");
      } catch (_) { return setPush("off-server"); }

      if (!("serviceWorker" in navigator)) return setPush("unsupported");
      const reg = await navigator.serviceWorker.register("/sw.js");
      navigator.serviceWorker.addEventListener("message", (e) => e.data?.type === "refresh" && load());
      try {
        const cache = await caches.open("scribbles-meta");
        await cache.put("/__home", new Response(location.pathname));
      } catch (_) {}

      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
      if (!("PushManager" in window)) return setPush(ios && !standalone ? "install-first" : "unsupported");
      const sub = await reg.pushManager.getSubscription();
      setPush(sub && Notification.permission === "granted" ? "on" : Notification.permission === "denied" ? "denied" : "off");
    })();
  }, [k, load]);

  async function enablePush() {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setPush("denied");
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(vapid) });
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ k, subscription: sub.toJSON() }),
      });
      setPush("on");
      flash("Notifications are on");
    } catch (e) {
      flash("Couldn't turn on notifications");
    }
  }

  async function toggleRemind() {
    const next = !remind;
    setRemind(next);
    await fetch("/api/me", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ k, remind: next }) });
    flash(next ? "Evening reminder on" : "Evening reminder off");
  }

  function flash(msg) {
    setToast(msg);
    setTimeout(() => setToast(""), 2600);
  }

  const received = useMemo(() => doodles?.find((d) => d.to === me.id) || null, [doodles, me.id]);
  const sent = useMemo(() => doodles?.find((d) => d.from === me.id) || null, [doodles, me.id]);

  // Mark the latest received doodle as seen once it's on screen.
  useEffect(() => {
    if (!received || received.seenAt || document.visibilityState !== "visible") return;
    fetch("/api/seen", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ k, id: received.id }) });
  }, [received, k]);

  function onSent(d) {
    setDrawing(null);
    setDoodles((list) => [d, ...(list || [])]);
    flash(`Sent to ${partner.name} ✓`);
  }

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="brand-mark">✎</span>
          <span className="brand-name">Scribbles</span>
        </div>
        <div className="with">
          with <b>{partner.name}</b>
        </div>
      </header>

      <nav className="tabs">
        <button className={tab === "today" ? "on" : ""} onClick={() => setTab("today")}>Today</button>
        <button className={tab === "album" ? "on" : ""} onClick={() => setTab("album")}>
          Album{doodles?.length ? <span className="count">{doodles.length}</span> : null}
        </button>
      </nav>

      {tab === "album" && <Album doodles={doodles} me={me} partner={partner} img={img} open={(list, i) => setViewing({ list, i })} />}

      {tab === "today" && <>

      {push === "off" && (
        <button className="nudge" onClick={enablePush}>
          <span className="nudge-dot" />
          Get a ping when {partner.name} draws something
          <span className="nudge-cta">Turn on</span>
        </button>
      )}
      {push === "install-first" && (
        <div className="nudge static">
          <span className="nudge-dot" />
          For pings, tap <b>&nbsp;Share → Add to Home Screen&nbsp;</b> and open Scribbles from there.
        </div>
      )}

      <section className="hero">
        <div className="hero-label">
          <span>From {partner.name}</span>
          {received && <span className="muted">{ago(received.createdAt)}</span>}
        </div>

        {doodles === null ? (
          <div className="frame skeleton" />
        ) : received ? (
          <button className="frame tilt" onClick={() => setViewing({ list: [received], i: 0 })} aria-label="Open doodle">
            <span className="tape" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img(received.id)} alt={`Doodle from ${partner.name}`} />
          </button>
        ) : (
          <div className="frame empty">
            <p className="empty-title">Nothing yet</p>
            <p className="muted">When {partner.name} draws something, it lands here and on your home screen.</p>
          </div>
        )}

        <div className="hero-actions">
          <button className="btn primary" onClick={() => setDrawing({ base: null })}>
            Draw something
          </button>
          {received && (
            <button className="btn ghost" onClick={() => setDrawing({ base: img(received.id) })}>
              Draw on this
            </button>
          )}
        </div>

        {sent && (
          <div className="sent-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img(sent.id)} alt="" />
            <span>
              Your last one · {ago(sent.createdAt)} ·{" "}
              <b className={sent.seenAt ? "seen" : ""}>{sent.seenAt ? `seen ${ago(sent.seenAt)}` : "delivered"}</b>
            </span>
          </div>
        )}
      </section>

      {doodles?.length > 0 && (
        <section className="wall">
          <h2>
            Recently <button className="link" onClick={() => setTab("album")}>Open album →</button>
          </h2>
          <div className="grid">
            {doodles.slice(0, 6).map((d, i) => (
              <button
                key={d.id}
                className={`polaroid ${d.from === me.id ? "mine" : "theirs"}`}
                style={{ "--r": `${((i * 37) % 7) - 3}deg` }}
                onClick={() => setViewing({ list: doodles, i })}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img(d.id)} alt="" loading="lazy" />
                <span className="who">{d.from === me.id ? "you" : partner.name}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <button className="remind-row" onClick={toggleRemind}>
        <span>
          <b>Evening reminder</b>
          <span className="muted">One ping at 8 pm, only on days you haven&apos;t sent anything{push !== "on" ? ". Needs notifications on." : "."}</span>
        </span>
        <span className={`switch ${remind ? "on" : ""}`} aria-label={remind ? "On" : "Off"} />
      </button>
      </>}

      {viewing && (
        <Viewer
          list={viewing.list}
          i={viewing.i}
          setI={(i) => setViewing((v) => ({ ...v, i }))}
          img={img}
          me={me}
          partner={partner}
          onClose={() => setViewing(null)}
          onDrawOn={(d) => {
            setDrawing({ base: img(d.id) });
            setViewing(null);
          }}
        />
      )}

      {drawing && <DrawSheet k={k} base={drawing.base} partner={partner} onClose={() => setDrawing(null)} onSent={onSent} />}

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}

/* ───────────────────────── Viewer ───────────────────────── */

function Viewer({ list, i, setI, img, me, partner, onClose, onDrawOn }) {
  const d = list[i];
  const src = img(d.id);
  const mine = d.from === me.id;
  const touch = useRef(null);
  const prev = () => i > 0 && setI(i - 1);
  const next = () => i < list.length - 1 && setI(i + 1);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function share() {
    try {
      const blob = await (await fetch(src)).blob();
      const file = new File([blob], `scribble-${d.id}.png`, { type: blob.type });
      if (navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file] });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = file.name;
      a.click();
    } catch (_) {}
  }
  return (
    <div className="overlay" onClick={onClose}>
      <div
        className="viewer"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => (touch.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          const dx = e.changedTouches[0].clientX - (touch.current ?? 0);
          if (dx > 50) prev();
          if (dx < -50) next();
        }}
      >
        <div className="viewer-img">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={d.id} src={src} alt="" />
          {list.length > 1 && (
            <>
              <button className="nav-arrow left" onClick={prev} disabled={i === 0} aria-label="Newer">‹</button>
              <button className="nav-arrow right" onClick={next} disabled={i === list.length - 1} aria-label="Older">›</button>
            </>
          )}
        </div>
        <div className="viewer-meta">
          <b>{mine ? `You → ${partner.name}` : `${partner.name} → you`}</b>
          <span className="muted">
            {when(d.createdAt)}
            {mine && (d.seenAt ? ` · seen ${ago(d.seenAt)}` : " · delivered")}
            {list.length > 1 && ` · ${i + 1} of ${list.length}`}
          </span>
        </div>
        <div className="viewer-actions">
          <button className="btn primary" onClick={() => onDrawOn(d)}>Draw on this</button>
          <button className="btn ghost" onClick={share}>Save</button>
          <button className="btn ghost" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────── Album ───────────────────────── */

// Each month is a folder. The newest starts open; tap a folder and its doodles fan out.
function Album({ doodles, me, partner, img, open }) {
  const [openSet, setOpenSet] = useState(null);
  const [filter, setFilter] = useState("all");

  const list = useMemo(
    () => (doodles || []).filter((d) => filter === "all" || (filter === "mine" ? d.from === me.id : d.from !== me.id)),
    [doodles, filter, me.id]
  );
  const months = useMemo(() => {
    const m = new Map();
    list.forEach((d) => {
      const key = new Date(d.createdAt).toLocaleDateString(undefined, { month: "long", year: "numeric" });
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(d);
    });
    return [...m.entries()];
  }, [list]);
  const opened = openSet || new Set(months.length ? [months[0][0]] : []);

  if (doodles === null) return <div className="frame skeleton" />;
  if (!doodles.length)
    return (
      <div className="frame empty">
        <p className="empty-title">An empty album</p>
        <p className="muted">Every doodle you two send each other gathers here, month by month.</p>
      </div>
    );

  const toggle = (m) => {
    const s = new Set(opened);
    s.has(m) ? s.delete(m) : s.add(m);
    setOpenSet(s);
    navigator.vibrate?.(6);
  };

  return (
    <section className="album">
      <div className="filters">
        {[["all", "All"], ["theirs", `From ${partner.name}`], ["mine", "From you"]].map(([v, l]) => (
          <button key={v} className={`chip ${filter === v ? "on" : ""}`} onClick={() => setFilter(v)}>{l}</button>
        ))}
      </div>
      {!months.length && <p className="muted center">Nothing here yet.</p>}
      {months.map(([m, items]) => {
        const tally = {};
        items.forEach((d) => { const c = d.bg && d.bg !== "#1E2233" ? d.bg : "#F3E6D3"; tally[c] = (tally[c] || 0) + (c === "#F3E6D3" ? 0.5 : 1); });
        const tint = Object.entries(tally).sort((a, b) => b[1] - a[1])[0][0];
        const mineN = items.filter((d) => d.from === me.id).length;
        const theirN = items.length - mineN;
        const isOpen = opened.has(m);
        const [mon, yr] = m.split(" ");
        return (
          <section key={m} className={`album-month ${isOpen ? "open" : ""}`} style={{ "--c": tint }}>
            <button className="folder" aria-expanded={isOpen} onClick={() => toggle(m)}>
              <div className="fback" />
              <div className="fan">
                {items.slice(0, 3).map((d) => (
                  <div key={d.id} className="peek">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img(d.id)} alt="" loading="lazy" />
                  </div>
                ))}
              </div>
              <div className="ffront">
                <div>
                  <div className="mt">{mon} <span>{yr}</span></div>
                  <div className="mc">
                    {items.length} doodle{items.length > 1 ? "s" : ""}
                    {theirN > 0 && <span><i className="dot theirs" />{partner.name} {theirN}</span>}
                    {mineN > 0 && <span><i className="dot mine" />you {mineN}</span>}
                  </div>
                </div>
                <span className="chev">›</span>
              </div>
            </button>
            {isOpen && (
              <div className="agrid">
                {items.map((d) => (
                  <button key={d.id} className={`tile ${d.from === me.id ? "mine" : "theirs"}`} onClick={() => open(list, list.indexOf(d))}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img(d.id)} alt="" loading="lazy" />
                    <span className="day">{new Date(d.createdAt).getDate()}</span>
                  </button>
                ))}
              </div>
            )}
          </section>
        );
      })}
      <p className="muted center small">The dot shows who drew it. Tap any doodle to flip through.</p>
    </section>
  );
}

/* ───────────────────────── Drawing ───────────────────────── */

const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];

function styleFor(ctx, s) {
  ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
  ctx.strokeStyle = ctx.fillStyle = s.erase ? "#000" : s.color;
  ctx.lineWidth = s.size;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
}

function renderStroke(ctx, s) {
  styleFor(ctx, s);
  const p = s.pts;
  ctx.beginPath();
  ctx.arc(p[0][0], p[0][1], s.size / 2, 0, Math.PI * 2);
  ctx.fill();
  if (p.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < p.length - 1; i++) {
    const m = mid(p[i], p[i + 1]);
    ctx.quadraticCurveTo(p[i][0], p[i][1], m[0], m[1]);
  }
  const last = p[p.length - 1];
  ctx.lineTo(last[0], last[1]);
  ctx.stroke();
}

function DrawSheet({ k, base, partner, onClose, onSent }) {
  const baseRef = useRef(null);
  const inkRef = useRef(null);
  const history = useRef([]); // strokes and {clear:true} markers
  const live = useRef(null);
  const [color, setColor] = useState(INKS[0]);
  const [size, setSize] = useState(SIZES[1]);
  const [erase, setErase] = useState(false);
  const [paper, setPaper] = useState(PAPERS[0].c);
  const [baseImg, setBaseImg] = useState(null);
  const [count, setCount] = useState(0);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  useEffect(() => {
    if (!base) return;
    const im = new Image();
    im.onload = () => setBaseImg(im);
    im.src = base;
  }, [base]);

  // Paint the background layer (paper colour or the doodle being drawn on).
  useEffect(() => {
    const ctx = baseRef.current.getContext("2d");
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (baseImg) ctx.drawImage(baseImg, 0, 0, SIZE, SIZE);
    else {
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, SIZE, SIZE);
    }
  }, [paper, baseImg]);

  // Pick a readable default ink on the dark paper.
  useEffect(() => {
    if (paper === "#1E2233" && color === INKS[0]) setColor("#FFFFFF");
    if (paper !== "#1E2233" && color === "#FFFFFF") setColor(INKS[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper]);

  const activeStrokes = () => {
    const h = history.current;
    let i = h.length - 1;
    while (i >= 0 && !h[i].clear) i--;
    return h.slice(i + 1);
  };

  function redraw() {
    const ctx = inkRef.current.getContext("2d");
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, SIZE, SIZE);
    activeStrokes().forEach((s) => renderStroke(ctx, s));
  }

  const toXY = (e) => {
    const r = inkRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) * SIZE) / r.width, ((e.clientY - r.top) * SIZE) / r.height];
  };

  function down(e) {
    if (live.current) return; // ignore a second finger
    e.preventDefault();
    inkRef.current.setPointerCapture(e.pointerId);
    const s = { color, size: erase ? size * 2 : size, erase, pts: [toXY(e)], pid: e.pointerId };
    live.current = s;
    const ctx = inkRef.current.getContext("2d");
    styleFor(ctx, s);
    ctx.beginPath();
    ctx.arc(s.pts[0][0], s.pts[0][1], s.size / 2, 0, Math.PI * 2);
    ctx.fill();
  }

  function move(e) {
    const s = live.current;
    if (!s || e.pointerId !== s.pid) return;
    const ctx = inkRef.current.getContext("2d");
    styleFor(ctx, s);
    const evs = e.nativeEvent.getCoalescedEvents?.() || [e.nativeEvent];
    for (const ev of evs) {
      const p = toXY(ev);
      const pts = s.pts;
      const prev = pts[pts.length - 1];
      if (Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 1.5) continue;
      pts.push(p);
      const n = pts.length;
      ctx.beginPath();
      if (n === 2) {
        const m = mid(pts[0], pts[1]);
        ctx.moveTo(pts[0][0], pts[0][1]);
        ctx.lineTo(m[0], m[1]);
      } else {
        const a = mid(pts[n - 3], pts[n - 2]);
        const b = mid(pts[n - 2], pts[n - 1]);
        ctx.moveTo(a[0], a[1]);
        ctx.quadraticCurveTo(pts[n - 2][0], pts[n - 2][1], b[0], b[1]);
      }
      ctx.stroke();
    }
  }

  function up(e) {
    const s = live.current;
    if (!s || e.pointerId !== s.pid) return;
    live.current = null;
    const { pid, ...stroke } = s;
    history.current.push(stroke);
    redraw(); // re-render cleanly so the saved image matches what you see
    setCount((c) => c + 1);
  }

  function undo() {
    history.current.pop();
    redraw();
    setCount((c) => c + 1);
  }

  function clearAll() {
    if (!activeStrokes().length) return;
    history.current.push({ clear: true });
    redraw();
    setCount((c) => c + 1);
  }

  const hasInk = useMemo(() => activeStrokes().some((s) => !s.erase), [count]); // eslint-disable-line react-hooks/exhaustive-deps
  const canUndo = history.current.length > 0;

  async function send() {
    setSending(true);
    setErr("");
    try {
      const out = document.createElement("canvas");
      out.width = out.height = SIZE;
      const ctx = out.getContext("2d");
      ctx.drawImage(baseRef.current, 0, 0);
      ctx.drawImage(inkRef.current, 0, 0);
      let data = out.toDataURL("image/png");
      if (data.length > 1_400_000) data = out.toDataURL("image/jpeg", 0.9);
      const r = await fetch("/api/doodles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ k, image: data, bg: base ? null : paper }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't send");
      onSent((await r.json()).doodle);
    } catch (e) {
      setErr(e.message || "Couldn't send. Try again?");
      setSending(false);
    }
  }

  return (
    <div className="sheet">
      <div className="sheet-top">
        <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        <div className="sheet-title">
          for <em>{partner.name}</em>
        </div>
        <div className="sheet-tools">
          <button className="icon" onClick={undo} disabled={!canUndo} aria-label="Undo">↶</button>
          <button className="icon" onClick={clearAll} disabled={!hasInk} aria-label="Clear">⌫</button>
        </div>
      </div>

      <div className="canvas-wrap">
        <canvas ref={baseRef} width={SIZE} height={SIZE} className="layer" />
        <canvas
          ref={inkRef}
          width={SIZE}
          height={SIZE}
          className="layer ink"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        />
      </div>

      <div className="tools">
        <div className="row inks">
          {INKS.map((c) => (
            <button
              key={c}
              className={`swatch ${!erase && color === c ? "on" : ""}`}
              style={{ "--c": c }}
              onClick={() => { setColor(c); setErase(false); }}
              aria-label={`Ink ${c}`}
            />
          ))}
        </div>
        <div className="row">
          <div className="sizes">
            {SIZES.map((s) => (
              <button key={s} className={`size ${size === s ? "on" : ""}`} onClick={() => setSize(s)} aria-label={`Brush ${s}`}>
                <span style={{ width: s / 1.6 + 4, height: s / 1.6 + 4, background: erase ? "#B9AFA3" : color }} />
              </button>
            ))}
          </div>
          <button className={`chip ${erase ? "on" : ""}`} onClick={() => setErase((v) => !v)}>
            Eraser
          </button>
        </div>
        {!base && (
          <div className="row papers">
            {PAPERS.map((p) => (
              <button key={p.c} className={`paper ${paper === p.c ? "on" : ""}`} style={{ "--c": p.c }} onClick={() => setPaper(p.c)}>
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {err && <p className="err">{err}</p>}
      <button className="btn primary send" disabled={!hasInk || sending} onClick={send}>
        {sending ? "Sending…" : `Send to ${partner.name}`}
        {!sending && <span className="arrow">→</span>}
      </button>
    </div>
  );
}
