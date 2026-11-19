"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DrawSheet, { SIZE } from "./Editor";
import { getKey, setKey, newKey, fingerprint, unlockBytes, lockBytes, lockJSON, unlockJSON, toB64, validCode, cleanCode } from "@/lib/e2e";
import { findLink, describeSong } from "@/lib/songs";

/* Pictures are fetched, unlocked on this device when they're end-to-end encrypted, and shown from memory. */
const KREF = { k: "" };
const picCache = new Map();
const sniff = (b) => (b[0] === 0x89 ? "image/png" : b[0] === 0xff ? "image/jpeg" : "image/webp");
export function picURL(id) {
  if (!picCache.has(id)) {
    picCache.set(
      id,
      (async () => {
        const r = await fetch(`/api/image/${id}?k=${encodeURIComponent(KREF.k)}`);
        if (!r.ok) throw new Error("missing");
        let blob = await r.blob();
        if (r.headers.get("x-e2e") === "1") {
          const key = getKey();
          if (!key) throw new Error("locked");
          const plain = await unlockBytes(key, new Uint8Array(await blob.arrayBuffer()));
          blob = new Blob([plain], { type: sniff(plain) });
        }
        return URL.createObjectURL(blob);
      })().catch((e) => {
        picCache.delete(id);
        throw e;
      })
    );
  }
  return picCache.get(id);
}
const BLANK = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
function Pic({ id, ...rest }) {
  const [src, setSrc] = useState(BLANK);
  useEffect(() => {
    let on = true;
    const get = () => picURL(id).then((u) => on && setSrc(u)).catch(() => {});
    get();
    window.addEventListener("scribbles-unlocked", get); // try again once this device is unlocked
    return () => { on = false; window.removeEventListener("scribbles-unlocked", get); };
  }, [id]);
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  return <img src={src} {...rest} className={`${rest.className || ""} ${src === BLANK ? "pic-loading" : ""}`} />;
}



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

export default function App({ k, me, partner, build }) {
  KREF.k = k;
  const [doodles, setDoodles] = useState(null);
  const [e2e, setE2e] = useState({ state: "checking" }); // checking | off | locked | on
  const [showCode, setShowCode] = useState(false);
  const [shared, setShared] = useState(null); // a song just saved from the Share menu
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

  // After an update, any copy left open (Android app, home-screen app, tabs) reloads itself,
  // but never in the middle of drawing.
  const drawingRef = useRef(false);
  drawingRef.current = Boolean(drawing);
  const checkVersion = useCallback(async () => {
    try {
      const r = await fetch("/api/version", { cache: "no-store" });
      const j = await r.json();
      if (j.build && build && j.build !== build && !drawingRef.current) location.reload();
    } catch (_) {}
  }, [build]);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/doodles?k=${encodeURIComponent(k)}&limit=300`, { cache: "no-store" });
      if (r.ok) {
        const list = (await r.json()).doodles;
        const key = getKey();
        // Song details on locked doodles are unlocked here, on this device.
        const open = await Promise.all(
          list.map(async (d) =>
            d.music?.enc ? { ...d, music: key ? await unlockJSON(key, d.music.enc).catch(() => null) : null } : d
          )
        );
        setDoodles(open);
      }
    } catch (_) {}
  }, [k]);

  // Initial load, polling while open, refresh on return to the app.
  useEffect(() => {
    load();
    const t = setInterval(() => document.visibilityState === "visible" && load(), 15000);
    const v = setInterval(() => document.visibilityState === "visible" && checkVersion(), 120000);
    const onVis = () => { if (document.visibilityState === "visible") { load(); checkVersion(); } };
    document.addEventListener("visibilitychange", onVis);
    const clock = setInterval(() => tick((n) => n + 1), 30000);
    const onAppRefresh = () => {
      load();
      checkVersion();
      if (window.ScribblesAndroid) setPush(window.ScribblesAndroid.notificationsOn() ? "on" : "native-off");
    };
    window.addEventListener("scribbles-refresh", onAppRefresh);
    return () => { clearInterval(t); clearInterval(v); clearInterval(clock); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("scribbles-refresh", onAppRefresh); };
  }, [load, checkVersion]);

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
        await checkE2E(j.e2e);
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

  /* ───── end-to-end encryption ───── */

  // A link with "#e=<code>" unlocks this device straight away.
  async function checkE2E(server) {
    let key = getKey();
    const fromLink = (location.hash.match(/e=([A-Za-z0-9_-]+)/) || [])[1];
    if (fromLink && validCode(fromLink) && server?.fp && (await fingerprint(fromLink)) === server.fp) {
      setKey(fromLink);
      key = fromLink;
      history.replaceState(null, "", location.pathname + location.search);
    }
    if (!server?.fp) return setE2e({ state: "off" });
    if (key && (await fingerprint(key)) === server.fp) {
      setKey(key); // also hands it to the Android widget
      return setE2e({ state: "on", fp: server.fp });
    }
    setE2e({ state: "locked", fp: server.fp });
  }

  async function turnOnE2E() {
    const code = newKey();
    const fp = await fingerprint(code);
    const r = await fetch("/api/e2e", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ k, fp }) });
    if (!r.ok) return flash("Couldn't switch it on. Try again?");
    setKey(code);
    setE2e({ state: "on", fp });
    setShowCode(true);
  }

  async function unlock(code) {
    const c = cleanCode(code);
    if (!validCode(c) || (await fingerprint(c)) !== e2e.fp) return false;
    setKey(c);
    picCache.clear();
    setE2e({ state: "on", fp: e2e.fp });
    await load();
    window.dispatchEvent(new Event("scribbles-unlocked"));
    return true;
  }

  // Lock the doodles sent before encryption was switched on (runs quietly, once).
  const migrated = useRef(false);
  useEffect(() => {
    if (e2e.state !== "on" || !doodles || migrated.current) return;
    const todo = doodles.filter((d) => !d.e2e);
    if (!todo.length) return;
    migrated.current = true;
    (async () => {
      const key = getKey();
      let n = 0;
      for (const d of todo) {
        try {
          const r = await fetch(`/api/image/${d.id}?k=${encodeURIComponent(k)}`);
          if (!r.ok || r.headers.get("x-e2e") === "1") continue;
          const image = "e2e:" + toB64(await lockBytes(key, new Uint8Array(await r.arrayBuffer())));
          const music = d.music && !d.music.enc ? { enc: await lockJSON(key, d.music) } : null;
          const w = await fetch(`/api/image/${d.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ k, image, music }) });
          if (w.ok) n++;
        } catch (_) {}
      }
      if (n) { flash(`Locked ${n} older doodle${n > 1 ? "s" : ""} 🔒`); picCache.clear(); load(); }
    })();
  }, [e2e.state, doodles, k, load]);

  /* ───── songs from the Share menu ───── */
  const saveSong = useCallback(async (text) => {
    const url = findLink(text);
    if (!url) return flash("That doesn't look like a link");
    const key = getKey();
    if (!key) return flash("Switch on encryption first, then share again");
    try {
      const r = await fetch("/api/music", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ k, url }) });
      const j = await r.json();
      if (!r.ok) return flash(j.error || "Couldn't read that link");
      const song = { ...describeSong({ ...j, url }), by: me.id, at: Date.now() };
      await fetch("/api/songs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ k, enc: await lockJSON(key, song) }) });
      setShared(song);
    } catch (_) {
      flash("Couldn't save that song");
    }
  }, [k, me.id]);

  useEffect(() => {
    window.scribblesShare = saveSong; // the Android app calls this when you Share → Scribbles
    const q = new URLSearchParams(location.search).get("share"); // iPhone Shortcut path
    if (q && e2e.state === "on") {
      history.replaceState(null, "", location.pathname);
      saveSong(q);
    }
    return () => { delete window.scribblesShare; };
  }, [saveSong, e2e.state]);

  function copyWidgetScript() {
    try {
      const key = getKey();
      const text = key ? widgetScript.replace(/(MY_LINK = "[^"#]+)"/, `$1#e=${key}"`) : widgetScript;
      navigator.clipboard.writeText(text);
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

  // React to a doodle (tap the same emoji again to take it back).
  async function react(d, emoji) {
    const mine = d.reactions?.[me.id];
    const next = mine === emoji ? "" : emoji;
    const patch = (x) => (x.id === d.id ? { ...x, reactions: { ...(x.reactions || {}), [me.id]: next || undefined } } : x);
    setDoodles((list) => list.map(patch));
    setViewing((v) => (v ? { ...v, list: v.list.map(patch) } : v));
    if (next) {
      try {
        const r = [next, ...JSON.parse(localStorage.getItem("scribbles-recent-react") || "[]").filter((e) => e !== next)].slice(0, 6);
        localStorage.setItem("scribbles-recent-react", JSON.stringify(r));
      } catch (_) {}
    }
    await fetch("/api/react", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ k, id: d.id, emoji: next }) });
  }

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

      {e2e.state === "locked" && <UnlockGate partner={partner} onUnlock={unlock} />}

      {e2e.state === "off" && (
        <section className="lock-card">
          <div className="lock-ico">🔒</div>
          <div>
            <b>Make it just the two of you</b>
            <p>Lock every doodle, photo and song on your phones before it's uploaded. The servers only ever see scrambled data.</p>
          </div>
          <button className="btn primary small-btn" onClick={turnOnE2E}>Turn on</button>
        </section>
      )}

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
          <div className="frame tilt" role="button" onClick={() => setViewing({ list: doodles, i: doodles.indexOf(received) })} aria-label="Open doodle">
            <span className="tape" />
            <div className="pic">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <Pic id={received.id} alt={`Doodle from ${partner.name}`} />
              <MusicSpot d={received} />
              <Reacts d={received} me={me} partner={partner} />
            </div>
          </div>
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
            <Pic id={sent.id} alt="" />
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
                <Pic id={d.id} alt="" loading="lazy" />
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

      {e2e.state === "on" && (
        <button className="link recopy" onClick={() => setShowCode(true)}>🔒 End-to-end encrypted · show unlock code</button>
      )}

      {platform === "android-app" && (
        <div className="phone-row">
          <button className="btn ghost" onClick={() => window.ScribblesAndroid.addWidget()}>Add widget</button>
          <button className="btn ghost" onClick={() => window.ScribblesAndroid.openSettings()}>App settings</button>
        </div>
      )}

      {platform === "ios" && e2e.state === "on" && (
        <details className="shortcut-card">
          <summary>♫ Save songs from YouTube Music&apos;s Share button</summary>
          <ol>
            <li>Open the <b>Shortcuts</b> app → <b>+</b>. Tap the ⓘ at the bottom and switch on <b>Show in Share Sheet</b>.</li>
            <li>Add the action <b>Text</b>, then paste this:
              <button className="btn primary small-btn" onClick={() => {
                try {
                  navigator.clipboard.writeText(`${location.origin}/u/${k}?share=SONG#e=${getKey()}`);
                  flash("Copied. Paste it into the Text action");
                } catch (_) {}
              }}>Copy shortcut link</button>
            </li>
            <li>In that text, select the word <b>SONG</b> and replace it with the <b>Shortcut Input</b> variable.</li>
            <li>Add the action <b>Open URLs</b>. Name the shortcut <b>Scribbles</b>.</li>
          </ol>
          <p className="muted">Now in YouTube Music: Share → Scribbles. The song is saved (locked) to your songs.</p>
        </details>
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
          onReact={react}
          onDrawOn={async (d) => {
            setDrawing({ base: await picURL(d.id) });
            setViewing(null);
          }}
        />
      )}

      {showCode && <CodeSheet partner={partner} onClose={() => setShowCode(false)} />}

      {shared && (
        <div className="overlay" onClick={() => setShared(null)}>
          <div className="song-saved" onClick={(e) => e.stopPropagation()}>
            <div className="mini-record big" style={{ backgroundImage: `url(https://i.ytimg.com/vi/${shared.vid}/hqdefault.jpg)` }} />
            <p className="ss-kicker">♫ Saved to your songs</p>
            <h3>{shared.title}</h3>
            <p className="muted">{[shared.artist, shared.movie && `from ${shared.movie}`, shared.kind].filter(Boolean).join(" · ")}</p>
            <div className="viewer-actions">
              <button className="btn primary" onClick={() => { setDrawing({ base: null, music: shared }); setShared(null); }}>Send it to {partner.name}</button>
              <button className="btn ghost" onClick={() => setShared(null)}>Done</button>
            </div>
          </div>
        </div>
      )}

      {drawing && <DrawSheet k={k} me={me} base={drawing.base} initialMusic={drawing.music} startWith={drawing.startWith} partner={partner} onClose={() => setDrawing(null)} onSent={onSent} />}

      <div className={`toast ${toast ? "show" : ""}`}>{toast}</div>
    </div>
  );
}

/* ───────────────────────── Viewer ───────────────────────── */

function Viewer({ list, i, setI, img, me, partner, onClose, onDrawOn, onReact }) {
  const [more, setMore] = useState(false);
  const d = list[i];
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
      const blob = await (await fetch(await picURL(d.id))).blob();
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
          <Pic key={d.id} id={d.id} alt="" />
          <MusicSpot key={"m" + d.id} d={d} />
          <Reacts d={d} me={me} partner={partner} />
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
        <ReactBar d={d} me={me} more={more} setMore={setMore} onReact={(e) => onReact(d, e)} />
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
                    <Pic id={d.id} alt="" loading="lazy" />
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
                    <Pic id={d.id} alt="" loading="lazy" />
                    <span className="day">{new Date(d.createdAt).getDate()}</span>
                    {(d.music || Object.values(d.reactions || {}).some(Boolean)) && (
                      <span className="tile-badges">
                        {d.music && <i>♫</i>}
                        {Object.values(d.reactions || {}).filter(Boolean).map((e, n) => <i key={n}>{e}</i>)}
                      </span>
                    )}
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


/* ───────────────────────── Music & reactions ───────────────────────── */

const QUICK_REACTS = ["❤️", "😂", "😮", "😢", "🙏", "👍"];
const MORE_REACTS = ["🥹", "😍", "🥰", "😘", "🫶", "💕", "💖", "🔥", "✨", "🎉", "😭", "🤣", "😅", "😳", "🙈", "😴", "🤍", "💯", "👏", "🙌", "💐", "🌸", "🌙", "⭐", "🎶", "🍫", "☕", "🧸", "🤗", "😌", "🤭", "😤", "🥺", "💀", "👀", "🤞"];

// The record on a picture. The YouTube player sits ready inside the circle, so the tap lands
// on the player itself: iPhones only allow sound when the tap is on the player.
let ytSeq = 0;
function MusicSpot({ d }) {
  const m = d.music;
  const ref = useRef(null);
  const frameRef = useRef(null);
  const [px, setPx] = useState(100);
  const [playing, setPlaying] = useState(false);
  const [id] = useState(() => `yt${++ytSeq}`);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(() => setPx(ref.current?.offsetWidth || 100));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  // Listen to the player so the record spins only while the song plays.
  useEffect(() => {
    const onMsg = (e) => {
      if (!/youtube(-nocookie)?\.com$/.test(new URL(e.origin).hostname)) return;
      if (e.source !== frameRef.current?.contentWindow) return;
      let data;
      try { data = typeof e.data === "string" ? JSON.parse(e.data) : e.data; } catch (_) { return; }
      const state = data?.event === "onStateChange" ? data.info : data?.info?.playerState;
      if (state === 1) setPlaying(true);
      else if (state === 0 || state === 2) setPlaying(false);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  if (!m) return null;
  const pct = (v) => `${(v / SIZE) * 100}%`;
  const scale = px / 200; // YouTube wants at least a 200px player: lay it out at 200 and shrink it to the circle
  const origin = typeof window !== "undefined" ? encodeURIComponent(location.origin) : "";
  return (
    <div
      ref={ref}
      className={`music-spot ready ${playing ? "playing" : ""}`}
      style={{ left: pct(m.x - m.r), top: pct(m.y - m.r), width: pct(m.r * 2) }}
      onClick={(e) => e.stopPropagation()}
      title={`${m.title}${m.author ? " · " + m.author : ""}`}
    >
      <div className="ms-disc">
        <iframe
          ref={frameRef}
          id={id}
          title={m.title}
          src={`https://www.youtube-nocookie.com/embed/${m.id}?enablejsapi=1&origin=${origin}&playsinline=1&controls=0&rel=0&modestbranding=1&iv_load_policy=3&loop=1&playlist=${m.id}`}
          allow="autoplay; encrypted-media"
          onLoad={() => frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: "listening", id, channel: "widget" }), "*")}
          style={{ width: 356, height: 200, transform: `translate(-50%, -50%) scale(${scale})` }}
        />
      </div>
      {!playing && <span className="ms-hint">tap to play</span>}
    </div>
  );
}

function Reacts({ d, me, partner }) {
  const r = Object.entries(d.reactions || {}).filter(([, e]) => e);
  if (!r.length) return null;
  return (
    <div className="reacts">
      {r.map(([who, e]) => (
        <span key={who} title={who === me.id ? "You" : partner.name}>
          {e}<i>{who === me.id ? "you" : partner.name}</i>
        </span>
      ))}
    </div>
  );
}

function ReactBar({ d, me, more, setMore, onReact }) {
  const mine = d.reactions?.[me.id];
  let recent = [];
  try { recent = JSON.parse(localStorage.getItem("scribbles-recent-react") || "[]"); } catch (_) {}
  const quick = [...new Set([...recent, ...QUICK_REACTS])].slice(0, 7);
  return (
    <div className="react-bar">
      <div className="react-row">
        {quick.map((e) => (
          <button key={e} className={`emo ${mine === e ? "on" : ""}`} onClick={() => onReact(e)} aria-label={`React ${e}`}>{e}</button>
        ))}
        <button className={`emo more ${more ? "on" : ""}`} onClick={() => setMore(!more)} aria-label="More reactions">＋</button>
      </div>
      {more && (
        <div className="react-more">
          {MORE_REACTS.map((e) => (
            <button key={e} className={`emo ${mine === e ? "on" : ""}`} onClick={() => { onReact(e); setMore(false); }}>{e}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── Encryption screens ───────────────────────── */

function CodeSheet({ partner, onClose }) {
  const code = getKey();
  const [copied, setCopied] = useState(false);
  const msg = `Scribbles unlock code (keep it secret, it opens our doodles):\n${code}`;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="code-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="lock-ico">🔒</div>
        <h3>Your unlock code</h3>
        <p className="muted">
          Send this to {partner.name} once (WhatsApp is fine), and type it on any of your own devices the first time.
          It never goes to the server, so if every copy is lost, the doodles can't be recovered.
        </p>
        <code className="code-box">{code}</code>
        <div className="viewer-actions">
          <button className="btn primary" onClick={async () => {
            try {
              if (navigator.share) await navigator.share({ text: msg });
              else { await navigator.clipboard.writeText(msg); setCopied(true); }
            } catch (_) {}
          }}>Send to {partner.name}</button>
          <button className="btn ghost" onClick={async () => { try { await navigator.clipboard.writeText(code); setCopied(true); } catch (_) {} }}>{copied ? "Copied ✓" : "Copy"}</button>
          <button className="btn ghost" onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}

function UnlockGate({ partner, onUnlock }) {
  const [v, setV] = useState("");
  const [bad, setBad] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="unlock-gate">
      <div className="code-sheet">
        <div className="lock-ico">🔒</div>
        <h3>Scribbles is locked on this device</h3>
        <p className="muted">Your doodles are end-to-end encrypted. Paste the unlock code (it's in your chat with {partner.name}) once, and this device will remember it.</p>
        <textarea className="code-input" rows={2} value={v} onChange={(e) => { setV(e.target.value); setBad(false); }} placeholder="Paste the unlock code" />
        {bad && <p className="err">That code doesn't match. Check you copied all of it.</p>}
        <div className="viewer-actions">
          <button className="btn ghost" onClick={async () => { try { setV(await navigator.clipboard.readText()); } catch (_) {} }}>Paste</button>
          <button className="btn primary" disabled={!v || busy} onClick={async () => { setBusy(true); const ok = await onUnlock(v); setBusy(false); setBad(!ok); }}>
            {busy ? "Checking…" : "Unlock"}
          </button>
        </div>
      </div>
    </div>
  );
}
