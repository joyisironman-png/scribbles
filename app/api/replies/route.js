import { auth, json } from "@/lib/api";
import { addReply, reactReply } from "@/lib/store";
import { notify } from "@/lib/push";

export const dynamic = "force-dynamic";

// Reply to a doodle: { k, id, enc } (locked text) or { k, id, text } (only before encryption is on).
// React to a reply: { k, id, replyId, emoji }
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const a = auth(body.k);
  if (!a) return json({ error: "bad key" }, 401);
  const id = String(body.id || "");
  if (body.replyId) {
    const d = await reactReply(id, String(body.replyId), a.me.id, String(body.emoji || "").slice(0, 16));
    if (!d) return json({ error: "not found" }, 404);
    if (body.emoji) await notify(a.partner.id, { title: `${a.me.name} reacted ${body.emoji}`, body: "to your reply", url: "/" });
    return json({ doodle: d });
  }
  const enc = typeof body.enc === "string" && /^[A-Za-z0-9+/=]+$/.test(body.enc) && body.enc.length < 8000 ? body.enc : null;
  const text = !enc && typeof body.text === "string" ? body.text.slice(0, 1000) : null;
  if (!enc && !text) return json({ error: "empty reply" }, 400);
  const out = await addReply(id, a.me.id, enc ? { enc } : { text });
  if (!out) return json({ error: "not found" }, 404);
  await notify(a.partner.id, { title: `${a.me.name} replied`, body: enc ? "Open Scribbles to read it 🔒" : text.slice(0, 80), url: "/" });
  return json(out);
}
