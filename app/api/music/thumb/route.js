export const dynamic = "force-dynamic";

// Same-origin copy of the video thumbnail, so it can be drawn into the picture.
export async function GET(req) {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!/^[\w-]{11}$/.test(id)) return new Response("bad id", { status: 400 });
  for (const q of ["maxresdefault", "hqdefault"]) {
    const r = await fetch(`https://i.ytimg.com/vi/${id}/${q}.jpg`).catch(() => null);
    if (r?.ok) {
      return new Response(await r.arrayBuffer(), {
        headers: { "content-type": "image/jpeg", "cache-control": "public, max-age=604800" },
      });
    }
  }
  return new Response("not found", { status: 404 });
}
