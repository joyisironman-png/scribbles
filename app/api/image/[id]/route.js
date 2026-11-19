import { auth, json } from "@/lib/api";
import { getDoodle, getImage, replaceLocked } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const { id } = await params;
  const a = auth(new URL(req.url).searchParams.get("k"));
  if (!a) return json({ error: "bad key" }, 401);
  const d = await getDoodle(id);
  if (!d || (d.from !== a.me.id && d.to !== a.me.id)) return json({ error: "not found" }, 404);
  const dataUrl = await getImage(id);
  if (!dataUrl) return json({ error: "not found" }, 404);
  // Locked pictures go out as scrambled bytes; only your devices can turn them back into a picture.
  const locked = dataUrl.startsWith("e2e:");
  const [, mime, b64] = locked ? [null, "application/octet-stream", dataUrl.slice(4)] : /^data:([^;]+);base64,(.*)$/.exec(dataUrl) || [];
  return new Response(Buffer.from(b64, "base64"), {
    headers: { "content-type": mime, "cache-control": "private, no-cache", "x-e2e": locked ? "1" : "0" },
  });
}

// Replace an old plain picture with its locked copy: { k, image: "e2e:...", music: { enc } }
export async function POST(req, { params }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const a = auth(body.k);
  if (!a) return json({ error: "bad key" }, 401);
  const img = String(body.image || "");
  if (!/^e2e:[A-Za-z0-9+/=]+$/.test(img) || img.length > 1_500_000) return json({ error: "expected a locked picture" }, 400);
  const music = typeof body.music?.enc === "string" && /^[A-Za-z0-9+/=]+$/.test(body.music.enc) ? { enc: body.music.enc } : null;
  const d = await replaceLocked(id, a.me.id, img, music);
  return d ? json({ doodle: d }) : json({ error: "not found" }, 404);
}
