import { auth, json } from "@/lib/api";
import { getDoodle, getImage } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET(req, { params }) {
  const { id } = await params;
  const a = auth(new URL(req.url).searchParams.get("k"));
  if (!a) return json({ error: "bad key" }, 401);
  const d = await getDoodle(id);
  if (!d || (d.from !== a.me.id && d.to !== a.me.id)) return json({ error: "not found" }, 404);
  const dataUrl = await getImage(id);
  if (!dataUrl) return json({ error: "not found" }, 404);
  const [, mime, b64] = /^data:([^;]+);base64,(.*)$/.exec(dataUrl) || [];
  return new Response(Buffer.from(b64, "base64"), {
    headers: { "content-type": mime, "cache-control": "private, max-age=31536000, immutable" },
  });
}
