import { auth, json, publicUser } from "@/lib/api";
import { pushEnabled } from "@/lib/push";

export const dynamic = "force-dynamic";

export async function GET(req) {
  const a = auth(new URL(req.url).searchParams.get("k"));
  if (!a) return json({ error: "bad key" }, 401);
  return json({
    me: publicUser(a.me),
    partner: publicUser(a.partner),
    vapidPublicKey: pushEnabled() ? process.env.VAPID_PUBLIC_KEY : null,
  });
}
