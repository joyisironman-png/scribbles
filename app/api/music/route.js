import { auth, json } from "@/lib/api";

export const dynamic = "force-dynamic";

// Works for youtube.com, music.youtube.com, youtu.be and Shorts links.
export function videoId(url) {
  try {
    const u = new URL(String(url).trim());
    if (u.hostname.endsWith("youtu.be")) return u.pathname.slice(1, 12);
    if (u.hostname.endsWith("youtube.com")) {
      if (u.searchParams.get("v")) return u.searchParams.get("v").slice(0, 11);
      const m = u.pathname.match(/\/(shorts|embed|live)\/([\w-]{11})/);
      if (m) return m[2];
    }
  } catch (_) {}
  return null;
}

// ?k=KEY&url=<YouTube link>  ->  { id, title, author }
export async function GET(req) {
  const p = new URL(req.url).searchParams;
  if (!auth(p.get("k"))) return json({ error: "bad key" }, 401);
  const id = videoId(p.get("url"));
  if (!id || !/^[\w-]{11}$/.test(id)) return json({ error: "That doesn't look like a YouTube or YouTube Music link." }, 400);
  let title = "", author = "";
  try {
    const r = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent("https://www.youtube.com/watch?v=" + id)}`);
    if (r.ok) {
      const j = await r.json();
      title = j.title || "";
      author = (j.author_name || "").replace(/ - Topic$/, "");
    }
  } catch (_) {}
  return json({ id, title: title || "A song for you", author });
}
