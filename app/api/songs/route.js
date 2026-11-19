import { auth, json } from "@/lib/api";
import { addSong, listSongs } from "@/lib/store";

export const dynamic = "force-dynamic";

// Saved songs. Each entry's details are locked on the phone; the server sees only who and when.
export async function GET(req) {
  if (!auth(new URL(req.url).searchParams.get("k"))) return json({ error: "bad key" }, 401);
  return json({ songs: await listSongs() });
}

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const a = auth(body.k);
  if (!a) return json({ error: "bad key" }, 401);
  const enc = String(body.enc || "");
  if (!/^[A-Za-z0-9+/=]+$/.test(enc) || enc.length > 6000) return json({ error: "expected locked song details" }, 400);
  return json({ song: await addSong(a.me.id, enc) });
}
