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

// iPhone or iPad (iPadOS Safari pretends to be a Mac, but has a touch screen).
const isIOSDevice = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

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
  const [platform, setPlatform] = useState("web"); // web | ios | android-app
  const [widgetScript, setWidgetScript] = useState("");
  const [widgetDone, setWidgetDone] = useState(false);
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
    const onAppRefresh = () => {
      load();
      if (window.ScribblesAndroid) setPush(window.ScribblesAndroid.notificationsOn() ? "on" : "native-off");
    };
    window.addEventListener("scribbles-refresh", onAppRefresh);
    return () => { clearInterval(t); clearInterval(clock); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("scribbles-refresh", onAppRefresh); };
  }, [load]);

  // Service worker + notification state.
  useEffect(() => {
    (async () => {
      let vapidOk = false;
      try {
        const r = await fetch(`/api/me?k=${encodeURIComponent(k)}`);
        const j = await r.json();
        setVapid(j.vapidPublicKey);
        setRemind(j.remind !== false);
        vapidOk = Boolean(j.vapidPublicKey);
      } catch (_) {}

      // Inside the Android app: notifications are native, not web push.
      if (window.ScribblesAndroid) {
        setPlatform("android-app");
        return setPush(window.ScribblesAndroid.notificationsOn() ? "on" : "native-off");
      }
      if (isIOSDevice()) {
        setPlatform("ios");
        try { setWidgetDone(localStorage.getItem("scribbles-widget-done") === "1"); } catch (_) {}
        fetch(`/api/scriptable?k=${encodeURIComponent(k)}`).then((r) => r.text()).then(setWidgetScript).catch(() => {});
      }
      if (!vapidOk) return setPush("off-server");

      if (!("serviceWorker" in navigator)) return setPush("unsupported");
      const reg = await navigator.serviceWorker.register("/sw.js");
      navigator.serviceWorker.addEventListener("message", (e) => e.data?.type === "refresh" && load());
      try {
        const cache = await caches.open("scribbles-meta");
        await cache.put("/__home", new Response(location.pathname));
      } catch (_) {}

      const ios = isIOSDevice();
      const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
      if (!("PushManager" in window)) return setPush(ios && !standalone ? "install-first" : "unsupported");
      const sub = await reg.pushManager.getSubscription();
      setPush(sub && Notification.permission === "granted" ? "on" : Notification.permission === "denied" ? "denied" : "off");
    })();
  }, [k, load]);

  async function enablePush() {
    if (window.ScribblesAndroid) {
      window.ScribblesAndroid.enableNotifications();
      setTimeout(() => setPush(window.ScribblesAndroid.notificationsOn() ? "on" : "native-off"), 4000);
      return;
    }
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

  function copyWidgetScript() {
    try {
      navigator.clipboard.writeText(widgetScript);
      flash("Copied. Now follow step 2 below");
    } catch (_) {
      flash("Couldn't copy. Try again");
    }
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

      {(push === "off" || push === "native-off") && (
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
          <button className="btn ghost" onClick={() => setDrawing({ base: null, startWith: "library" })}>
            Send a photo
          </button>
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
          <span className="muted">One ping at 8 pm, only on days you haven&apos;t sent anything{push !== "on" ? ". Turn on notifications first." : "."}</span>
        </span>
        <span className={`switch ${remind ? "on" : ""}`} aria-label={remind ? "On" : "Off"} />
      </button>

      {platform === "android-app" && (
        <div className="phone-row">
          <button className="btn ghost" onClick={() => window.ScribblesAndroid.addWidget()}>Add widget</button>
          <button className="btn ghost" onClick={() => window.ScribblesAndroid.openSettings()}>App settings</button>
        </div>
      )}

      {platform === "ios" && widgetDone && (
        <button className="link recopy" disabled={!widgetScript} onClick={copyWidgetScript}>
          Copy widget script again
        </button>
      )}

      {platform === "ios" && !widgetDone && (
        <section className="widget-card">
          <h3>Put {partner.name}&apos;s doodles on your home screen</h3>
          <ol>
            <li>
              <span>Copy your widget script. Your link is already inside it.</span>
              <button className="btn primary small-btn" disabled={!widgetScript} onClick={copyWidgetScript}>Copy widget script</button>
            </li>
            <li>Get the free <b>Scriptable</b> app from the App Store. Open it, tap <b>+</b>, paste, and name the script <b>Scribbles</b> at the top.</li>
            <li>Long-press your home screen → <b>Edit</b> → <b>Add Widget</b> → <b>Scriptable</b>. Choose the square size and add it.</li>
            <li>Long-press the new widget → <b>Edit Widget</b>. Set <b>Script</b> to Scribbles and <b>When Interacting</b> to Open URL.</li>
          </ol>
          <button className="link" onClick={() => { setWidgetDone(true); try { localStorage.setItem("scribbles-widget-done", "1"); } catch (_) {} }}>
            Done, hide this
          </button>
        </section>
      )}
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

      {drawing && <DrawSheet k={k} base={drawing.base} startWith={drawing.startWith} partner={partner} onClose={() => setDrawing(null)} onSent={onSent} />}

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
      if (window.ScribblesAndroid) {
        const reader = new FileReader();
        reader.onload = () => window.ScribblesAndroid.saveImage(reader.result);
        return reader.readAsDataURL(blob);
      }
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
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

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
];
const STICKERS = ["❤️", "✨", "🌸", "⭐", "🦋", "😘", "🌙", "☀️", "🎀", "🍓", "🌷", "💌"];
const FILTERS = [
  { id: "none", name: "Original" },
  { id: "warm", name: "Warm" },
  { id: "film", name: "Film" },
  { id: "mono", name: "Mono" },
  { id: "fade", name: "Dreamy" },
  { id: "pop", name: "Pop" },
];

// Stroke width at a point. Pen: Apple Pencil pressure, or speed for fingers/mouse.
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

let scratch = null; // reused canvas so a highlighter stroke never darkens where it overlaps itself
function renderItem(ctx, s) {
  if (s.kind === "stamp") {
    ctx.globalCompositeOperation = "source-over";
    ctx.font = `${s.size}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s.emoji, s.x, s.y);
    return;
  }
  if (s.kind === "text") {
    ctx.globalCompositeOperation = "source-over";
    ctx.font = `600 ${s.size}px Caveat, "Bradley Hand", cursive`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineWidth = s.size / 7;
    ctx.strokeStyle = s.color === "#FFFFFF" ? "rgba(0,0,0,.35)" : "rgba(255,255,255,.85)";
    s.text.split("\n").forEach((line, i, all) => {
      const y = s.y + (i - (all.length - 1) / 2) * s.size * 1.05;
      ctx.strokeText(line, s.x, y);
      ctx.fillStyle = s.color;
      ctx.fillText(line, s.x, y);
    });
    return;
  }
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

// Photo filters done by hand, so they look the same in every browser.
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

// Read a picked photo; converts iPhone HEIC photos in browsers that can't open them.
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

const loadRecents = () => {
  try { return JSON.parse(localStorage.getItem("scribbles-recent-colors") || "[]"); } catch (_) { return []; }
};

function DrawSheet({ k, base, startWith, partner, onClose, onSent }) {
  const baseRef = useRef(null);
  const inkRef = useRef(null);
  const liveRef = useRef(null);
  const libRef = useRef(null);
  const camRef = useRef(null);
  const history = useRef([]); // strokes, stamps, text and {clear:true} markers
  const live = useRef(null);
  const frame = useRef(0);
  const penSeen = useRef(false);
  const [color, setColor] = useState("#1F1B18");
  const [family, setFamily] = useState(9);
  const [recents, setRecents] = useState([]);
  const [size, setSize] = useState(10);
  const [brush, setBrush] = useState("pen");
  const [smooth, setSmooth] = useState(0.5);
  const [tool, setTool] = useState("draw"); // draw | erase | sticker | text
  const [sticker, setSticker] = useState(STICKERS[0]);
  const [paper, setPaper] = useState(PAPERS[0].c);
  const [baseImg, setBaseImg] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [fit, setFit] = useState("fill");
  const [filter, setFilter] = useState("none");
  const [textAt, setTextAt] = useState(null);
  const [draft, setDraft] = useState("");
  const [count, setCount] = useState(0);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [touchy, setTouchy] = useState(true);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    document.body.classList.add("drawing");
    setTouchy(window.matchMedia("(pointer: coarse)").matches);
    setRecents(loadRecents());
    document.fonts?.load?.('600 60px "Caveat"').catch(() => {});
    if (startWith === "library") setTimeout(() => libRef.current?.click(), 250);
    // iPad Safari: stop long-presses on the canvas from selecting text or showing the magnifier.
    const el = liveRef.current;
    const stop = (e) => e.preventDefault();
    el.addEventListener("touchstart", stop, { passive: false });
    el.addEventListener("touchmove", stop, { passive: false });
    el.addEventListener("contextmenu", stop);
    return () => {
      document.body.style.overflow = "";
      document.body.classList.remove("drawing");
      el.removeEventListener("touchstart", stop);
      el.removeEventListener("touchmove", stop);
      el.removeEventListener("contextmenu", stop);
    };
  }, [startWith]);

  useEffect(() => {
    if (!base) return;
    const im = new Image();
    im.onload = () => setBaseImg(im);
    im.src = base;
  }, [base]);

  useEffect(() => {
    const ctx = baseRef.current.getContext("2d", { willReadFrequently: true });
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.fillStyle = photo ? "#FFFFFF" : paper;
    ctx.fillRect(0, 0, SIZE, SIZE);
    if (photo) {
      const r = photo.naturalWidth / photo.naturalHeight;
      const cover = fit === "fill";
      let w = SIZE, h = SIZE;
      if ((r > 1) === cover) { h = SIZE; w = SIZE * r; } else { w = SIZE; h = SIZE / r; }
      if (!cover) { ctx.fillStyle = paper === "#1E2233" ? paper : "#FFFDF8"; ctx.fillRect(0, 0, SIZE, SIZE); }
      ctx.drawImage(photo, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
      applyFilter(ctx, filter);
    } else if (baseImg) {
      ctx.drawImage(baseImg, 0, 0, SIZE, SIZE);
    }
  }, [paper, baseImg, photo, fit, filter]);

  useEffect(() => {
    if (paper === "#1E2233" && color === "#1F1B18") setColor("#FFFFFF");
    if (paper !== "#1E2233" && color === "#FFFFFF") setColor("#1F1B18");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paper]);

  function pickColor(c) {
    setColor(c);
    if (tool === "erase") setTool("draw");
    const next = [c, ...recents.filter((x) => x !== c)].slice(0, 8);
    setRecents(next);
    try { localStorage.setItem("scribbles-recent-colors", JSON.stringify(next)); } catch (_) {}
  }

  const activeItems = () => {
    const h = history.current;
    let i = h.length - 1;
    while (i >= 0 && !h[i].clear) i--;
    return h.slice(i + 1);
  };

  function redraw() {
    const ctx = inkRef.current.getContext("2d");
    ctx.globalCompositeOperation = "source-over";
    ctx.clearRect(0, 0, SIZE, SIZE);
    activeItems().forEach((s) => renderItem(ctx, s));
  }

  function commit(item) {
    history.current.push(item);
    redraw();
    setCount((c) => c + 1);
  }

  const toXY = (e) => {
    const r = liveRef.current.getBoundingClientRect();
    return [((e.clientX - r.left) * SIZE) / r.width, ((e.clientY - r.top) * SIZE) / r.height];
  };

  // Redraw the stroke in progress once per frame, so long strokes stay smooth.
  function paintLive() {
    frame.current = 0;
    const s = live.current;
    const ctx = liveRef.current.getContext("2d");
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (s && !s.erase) renderItem(ctx, s);
  }
  const schedule = () => { if (!frame.current) frame.current = requestAnimationFrame(paintLive); };

  function down(e) {
    if (e.pointerType === "pen") penSeen.current = true;
    if (e.pointerType === "touch" && penSeen.current) return; // palm rejection once a Pencil is in use
    if (live.current) return;
    e.preventDefault();
    const [x, y] = toXY(e);
    if (tool === "sticker") return commit({ kind: "stamp", emoji: sticker, x, y, size: 50 + size * 3.2 });
    if (tool === "text") { setTextAt({ x, y }); setDraft(""); return; }
    try { liveRef.current.setPointerCapture(e.pointerId); } catch (_) {}
    const pencil = e.pointerType === "pen";
    const p0 = pencil ? clamp(e.pressure || 0.5, 0.05, 1) : 0.55;
    const s = {
      color, size: tool === "erase" ? size * 2.2 : size, brush, erase: tool === "erase",
      pts: [[x, y, p0]], pid: e.pointerId, pencil, t: e.timeStamp, raw: [x, y],
    };
    live.current = s;
    if (s.erase) {
      const ctx = inkRef.current.getContext("2d");
      styleFor(ctx, s);
      ctx.beginPath();
      ctx.arc(x, y, s.size / 2, 0, Math.PI * 2);
      ctx.fill();
    } else schedule();
  }

  function move(e) {
    const s = live.current;
    if (!s || e.pointerId !== s.pid) return;
    const batch = e.nativeEvent.getCoalescedEvents?.();
    const evs = batch && batch.length ? batch : [e.nativeEvent];
    for (const ev of evs) {
      const [rx, ry] = toXY(ev);
      const prev = s.pts[s.pts.length - 1];
      // Steadying: each new point only goes part of the way towards the finger/pen.
      const k = s.erase ? 0 : smooth * 0.85;
      const x = prev[0] + (rx - prev[0]) * (1 - k);
      const y = prev[1] + (ry - prev[1]) * (1 - k);
      const dist = Math.hypot(x - prev[0], y - prev[1]);
      if (dist < 1.2) continue;
      let p;
      if (s.pencil) p = clamp(ev.pressure || prev[2], 0.05, 1);
      else {
        // Fingers and mice: faster strokes get thinner, like a real brush.
        const dt = Math.max(1, ev.timeStamp - s.t);
        p = clamp(0.9 - (dist / dt) * 0.12, 0.28, 0.9);
      }
      p = prev[2] * 0.65 + p * 0.35; // ease pressure changes so the line glides
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
    const s = live.current;
    if (!s || e.pointerId !== s.pid) return;
    live.current = null;
    const [rx, ry] = toXY(e);
    const last = s.pts[s.pts.length - 1];
    if (Math.hypot(rx - last[0], ry - last[1]) > 1) s.pts.push([rx, ry, last[2] * 0.7]); // finish where the pen lifted, tapering off
    const { pid, pencil, t, raw, ...stroke } = s;
    paintLive();
    commit(stroke);
  }

  function placeText() {
    const t = draft.trim();
    if (t && textAt) commit({ kind: "text", text: t, x: textAt.x, y: textAt.y, size: 30 + size * 2, color });
    setTextAt(null);
    setDraft("");
  }

  function undo() {
    history.current.pop();
    redraw();
    setCount((c) => c + 1);
  }

  function clearAll() {
    if (!activeItems().length) return;
    history.current.push({ clear: true });
    redraw();
    setCount((c) => c + 1);
  }

  async function onPick(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr("");
    try {
      setPhoto(await readPhoto(f));
      setFilter("none");
      setFit("fill");
    } catch (_) {
      setErr("Couldn't open that photo. Try a different one?");
    }
  }

  const hasInk = useMemo(() => activeItems().some((s) => !s.erase), [count]); // eslint-disable-line react-hooks/exhaustive-deps
  const canSend = hasInk || Boolean(photo);
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
      let data = photo ? out.toDataURL("image/jpeg", 0.88) : out.toDataURL("image/png");
      if (data.length > 1_400_000) data = out.toDataURL("image/jpeg", 0.82);
      const r = await fetch("/api/doodles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ k, image: data, bg: base || photo ? null : paper }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Couldn't send");
      onSent((await r.json()).doodle);
    } catch (e) {
      setErr(e.message || "Couldn't send. Try again?");
      setSending(false);
    }
  }

  const previewW = tool === "erase" ? size * 2.2 : brush === "highlight" ? size * 2.2 : size;
  const sizeLabel = tool === "sticker" ? "Sticker size" : tool === "text" ? "Text size" : tool === "erase" ? "Eraser size" : "Thickness";

  return (
    <div className="sheet">
      <div className="sheet-top">
        <button className="icon" onClick={onClose} aria-label="Close">✕</button>
        <div className="sheet-title">for <em>{partner.name}</em></div>
        <div className="sheet-tools">
          <button className="icon" onClick={undo} disabled={!canUndo} aria-label="Undo">↶</button>
          <button className="icon" onClick={clearAll} disabled={!hasInk} aria-label="Clear">⌫</button>
        </div>
      </div>

      <div className="sheet-body">
        <div className="canvas-col">
          <div className="canvas-wrap">
            <canvas ref={baseRef} width={SIZE} height={SIZE} className="layer" />
            <canvas ref={inkRef} width={SIZE} height={SIZE} className="layer" />
            <canvas
              ref={liveRef}
              width={SIZE}
              height={SIZE}
              className={`layer ink tool-${tool}`}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
            />
            {textAt && (
              <div className="text-pop" onPointerDown={(e) => e.stopPropagation()}>
                <textarea
                  autoFocus
                  rows={2}
                  value={draft}
                  placeholder="Write something sweet…"
                  onChange={(e) => setDraft(e.target.value)}
                  style={{ color: color === "#FFFFFF" ? "#1F1B18" : color }}
                />
                <div className="text-pop-actions">
                  <button className="chip" onClick={() => setTextAt(null)}>Cancel</button>
                  <button className="chip on" onClick={placeText}>Add</button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="side">
          <div className="tools">
            <div className="row modes">
              {[["draw", "✎ Draw"], ["sticker", "✿ Stickers"], ["text", "Aa Text"], ["erase", "Eraser"]].map(([id, label]) => (
                <button key={id} className={`chip ${tool === id ? "on" : ""}`} onClick={() => setTool(id)}>{label}</button>
              ))}
            </div>

            {tool === "draw" && (
              <div className="row brushes">
                {BRUSHES.map((b) => (
                  <button key={b.id} className={`brush ${brush === b.id ? "on" : ""}`} onClick={() => setBrush(b.id)}>
                    <b>{b.name}</b>
                    <span>{b.hint}</span>
                  </button>
                ))}
              </div>
            )}

            {tool === "sticker" ? (
              <div className="row stickers">
                {STICKERS.map((st) => (
                  <button key={st} className={`sticker ${sticker === st ? "on" : ""}`} onClick={() => setSticker(st)}>{st}</button>
                ))}
              </div>
            ) : tool !== "erase" && (
              <div className="palette">
                <div className="families">
                  {FAMILIES.map((f, i) => (
                    <button
                      key={f.name}
                      className={`family ${family === i ? "on" : ""}`}
                      style={{ "--c": f.shades[i === 9 ? 5 : 2] }}
                      onClick={() => { setFamily(i); pickColor(f.shades[i === 9 ? 5 : 2]); }}
                      aria-label={f.name}
                    />
                  ))}
                </div>
                <div className="shades">
                  {FAMILIES[family].shades.map((c) => (
                    <button key={c} className={`shade ${color === c ? "on" : ""}`} style={{ "--c": c }} onClick={() => pickColor(c)} aria-label={c} />
                  ))}
                </div>
                {recents.length > 1 && (
                  <div className="recents">
                    <span className="label">Recent</span>
                    {recents.map((c) => (
                      <button key={c} className={`swatch mini ${color === c ? "on" : ""}`} style={{ "--c": c }} onClick={() => pickColor(c)} aria-label={c} />
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="slider-row">
              <span className="label">{sizeLabel}</span>
              <input type="range" min="1" max="60" step="1" value={size} onChange={(e) => setSize(Number(e.target.value))} />
              <span className="preview">
                <span
                  style={{
                    width: Math.max(3, Math.min(40, previewW / 1.5)),
                    height: Math.max(3, Math.min(40, previewW / 1.5)),
                    background: tool === "erase" ? "#B9AFA3" : color,
                    opacity: brush === "highlight" && tool === "draw" ? 0.45 : 1,
                  }}
                />
              </span>
            </div>

            {tool === "draw" && (
              <div className="slider-row">
                <span className="label">Smoothing</span>
                <input type="range" min="0" max="0.9" step="0.05" value={smooth} onChange={(e) => setSmooth(Number(e.target.value))} />
                <span className="preview text">{smooth < 0.15 ? "Off" : smooth < 0.55 ? "Soft" : "Silky"}</span>
              </div>
            )}

            <div className="photo-block">
              <div className="row">
                <span className="label">Photo</span>
                <div className="photo-btns">
                  <button className="chip" onClick={() => libRef.current?.click()}>🖼 {photo ? "Change" : "Add photo"}</button>
                  {touchy && <button className="chip" onClick={() => camRef.current?.click()}>📷 Camera</button>}
                  {photo && <button className="chip" onClick={() => setPhoto(null)}>Remove</button>}
                </div>
              </div>
              {photo && (
                <>
                  <div className="row">
                    <span className="label">Frame</span>
                    <div className="photo-btns">
                      <button className={`chip ${fit === "fill" ? "on" : ""}`} onClick={() => setFit("fill")}>Fill square</button>
                      <button className={`chip ${fit === "fit" ? "on" : ""}`} onClick={() => setFit("fit")}>Show whole</button>
                    </div>
                  </div>
                  <div className="row filters-row">
                    {FILTERS.map((f) => (
                      <button key={f.id} className={`chip ${filter === f.id ? "on" : ""}`} onClick={() => setFilter(f.id)}>{f.name}</button>
                    ))}
                  </div>
                </>
              )}
              <input ref={libRef} type="file" accept="image/*" hidden onChange={onPick} />
              <input ref={camRef} type="file" accept="image/*" capture="environment" hidden onChange={onPick} />
            </div>

            {!base && !photo && (
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
          <button className="btn primary send" disabled={!canSend || sending} onClick={send}>
            {sending ? "Sending…" : `Send to ${partner.name}`}
            {!sending && <span className="arrow">→</span>}
          </button>
        </div>
      </div>
    </div>
  );
}
