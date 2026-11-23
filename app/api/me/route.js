import { auth, json, publicUser } from "@/lib/api";
import { pushEnabled } from "@/lib/push";
import { remindOn, setRemind, getE2E, getTheme, setTheme } from "@/lib/store";
import { THEMES } from "@/lib/themes";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const a = auth(new URL(req.url).searchParams.get("k"));
  if (!a) return json({ error: "bad key" }, 401);
  return json({
    me: publicUser(a.me),
    partner: publicUser(a.partner),
    vapidPublicKey: pushEnabled() ? process.env.VAPID_PUBLIC_KEY : null,
    remind: await remindOn(a.me.id),
    e2e: await getE2E(),
    theme: await getTheme(a.me.id),
  });
}

// Turn the evening reminder on or off: { k, remind: true|false }
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const a = auth(body.k);
  if (!a) return json({ error: "bad key" }, 401);
  // { k, remind } and/or { k, theme }
  if ("remind" in body) await setRemind(a.me.id, Boolean(body.remind));
  if (body.theme && THEMES.some((t) => t.id === body.theme)) await setTheme(a.me.id, body.theme);
  return json({ ok: true });
}
