import { auth, json } from "@/lib/api";
import { addSub, removeSub } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const a = auth(body.k);
  if (!a) return json({ error: "bad key" }, 401);
  const s = body.subscription;
  if (!s?.endpoint || !s?.keys?.p256dh || !s?.keys?.auth) return json({ error: "bad subscription" }, 400);
  if (body.remove) await removeSub(a.me.id, s.endpoint);
  else await addSub(a.me.id, { endpoint: s.endpoint, keys: { p256dh: s.keys.p256dh, auth: s.keys.auth } });
  return json({ ok: true });
}
