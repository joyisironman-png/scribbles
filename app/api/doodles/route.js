import { auth, json } from "@/lib/api";
import { saveDoodle, recent, getDoodle, addReply } from "@/lib/store";
import { notify } from "@/lib/push";

export const dynamic = "force-dynamic";
const MAX_BYTES = 1_500_000;

// List recent doodles (both directions).
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const a = auth(p.get("k"));
  if (!a) return json({ error: "bad key" }, 401);
  const limit = Math.min(Number(p.get("limit")) || 300, 300);
  return json({ doodles: await recent(limit) });
}

// Send a doodle to the other person.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const a = auth(body.k);
  if (!a) return json({ error: "bad key" }, 401);

  // Either a locked picture ("e2e:..."), or a plain one from before encryption was switched on.
  const img = String(body.image || "");
  const ok = /^e2e:[A-Za-z0-9+/=]+$/.test(img) || /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(img);
  if (!ok) return json({ error: "unexpected picture format" }, 400);
  if (img.length > MAX_BYTES) return json({ error: "drawing too large" }, 413);

  const bg = /^#[0-9A-Fa-f]{6}$/.test(body.bg || "") ? body.bg : null;
  // Optional song attached as a record sticker: where it sits on the picture, and what it is.
  const mu = body.music;
  const music =
    mu && typeof mu.enc === "string" && mu.enc.length < 6000 && /^[A-Za-z0-9+/=]+$/.test(mu.enc)
      ? { enc: mu.enc }
      : mu && /^[\w-]{11}$/.test(mu.id || "")
      ? {
          id: mu.id,
          title: String(mu.title || "").slice(0, 120),
          author: String(mu.author || "").slice(0, 80),
          x: Number(mu.x) || 450, y: Number(mu.y) || 450, r: Math.max(20, Math.min(450, Number(mu.r) || 90)),
        }
      : null;
  // A picture sent as a reply to another doodle shows up in that doodle's thread too.
  let replyTo = null;
  if (body.replyTo) {
    const t = await getDoodle(String(body.replyTo));
    if (t && (t.from === a.me.id || t.to === a.me.id)) replyTo = t.id;
  }
  const meta = await saveDoodle({ from: a.me.id, to: a.partner.id, image: img, bg, music, replyTo });
  if (replyTo) await addReply(replyTo, a.me.id, { kind: "doodle", doodleId: meta.id });
  await notify(a.partner.id, {
    title: replyTo ? `${a.me.name} replied with a doodle` : music ? `${a.me.name} sent you a doodle with a song ♫` : `${a.me.name} sent you a doodle`,
    body: "Tap to see it ✏️",
    url: "/",
    id: meta.id,
  });
  return json({ doodle: meta });
}
