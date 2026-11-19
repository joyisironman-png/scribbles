import { auth, json } from "@/lib/api";
import { markSeen } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const a = auth(body.k);
  if (!a) return json({ error: "bad key" }, 401);
  return json({ doodle: await markSeen(String(body.id || ""), a.me.id) });
}
