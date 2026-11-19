import { auth, json } from "@/lib/api";
import { saveDoodle, recent } from "@/lib/store";
import { notify } from "@/lib/push";

export const dynamic = "force-dynamic";
const MAX_BYTES = 1_500_000;

// List recent doodles (both directions).
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  const a = auth(p.get("k"));
  if (!a) return json({ error: "bad key" }, 401);
  const limit = Math.min(Number(p.get("limit")) || 60, 300);
  return json({ doodles: await recent(limit) });
}

// Send a doodle to the other person.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const a = auth(body.k);
  if (!a) return json({ error: "bad key" }, 401);

  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(body.image || "");
  if (!m) return json({ error: "image must be a png/jpeg/webp data URL" }, 400);
  if (m[2].length > MAX_BYTES) return json({ error: "drawing too large" }, 413);

  const meta = await saveDoodle({ from: a.me.id, to: a.partner.id, image: body.image });
  await notify(a.partner.id, {
    title: `${a.me.name} sent you a doodle`,
    body: "Tap to see it ✏️",
    url: "/",
    id: meta.id,
  });
  return json({ doodle: meta });
}
