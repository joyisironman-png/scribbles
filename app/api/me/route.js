import { auth, json, publicUser } from "@/lib/api";
import { pushEnabled } from "@/lib/push";
import { remindOn, setRemind, getE2E } from "@/lib/store";

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
  });
}

// Turn the evening reminder on or off: { k, remind: true|false }
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const a = auth(body.k);
  if (!a) return json({ error: "bad key" }, 401);
  await setRemind(a.me.id, Boolean(body.remind));
  return json({ remind: Boolean(body.remind) });
}
