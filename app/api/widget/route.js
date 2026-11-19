import { auth, json } from "@/lib/api";
import { latestFor, getImage, dayOf, sentOn, remindOn } from "@/lib/store";

export const dynamic = "force-dynamic";

// Used by the home-screen widgets: the latest doodle sent TO this person.
//   ?k=KEY&format=json  -> metadata + image URL
//   ?k=KEY&format=png   -> the image itself
export async function GET(req) {
  const u = new URL(req.url);
  const k = u.searchParams.get("k");
  const a = auth(k);
  if (!a) return json({ error: "bad key" }, 401);

  const d = await latestFor(a.me.id);
  const origin = u.origin;
  if (u.searchParams.get("format") === "png") {
    if (!d) return json({ has: false }, 404);
    const stored = (await getImage(d.id)) || "";
    const [, mime, b64] = stored.startsWith("e2e:") ? [null, "application/octet-stream", stored.slice(4)] : /^data:([^;]+);base64,(.*)$/.exec(stored) || [];
    if (!b64) return json({ has: false }, 404);
    return new Response(Buffer.from(b64, "base64"), { headers: { "content-type": mime, "cache-control": "no-store" } });
  }
  return json({
    has: Boolean(d),
    id: d?.id ?? null,
    fromName: a.partner.name,
    createdAt: d?.createdAt ?? null,
    bg: d?.bg ?? null,
    e2e: Boolean(d?.e2e),
    image: d ? `${origin}/api/image/${d.id}?k=${encodeURIComponent(k)}` : null,
    app: `${origin}/u/${encodeURIComponent(k)}`,
    // Used by the Android app for its own 8 pm reminder.
    today: dayOf(),
    sentToday: await sentOn(dayOf(), a.me.id),
    theyDrewToday: await sentOn(dayOf(), a.partner.id),
    remind: await remindOn(a.me.id),
  });
}
