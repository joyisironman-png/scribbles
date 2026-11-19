import { auth, json } from "@/lib/api";
import { react } from "@/lib/store";
import { notify } from "@/lib/push";

export const dynamic = "force-dynamic";

// { k, id, emoji }  (emoji "" removes your reaction)
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const a = auth(body.k);
  if (!a) return json({ error: "bad key" }, 401);
  const emoji = String(body.emoji || "").slice(0, 16);
  const d = await react(String(body.id || ""), a.me.id, emoji);
  if (!d) return json({ error: "not found" }, 404);
  if (emoji) await notify(a.partner.id, { title: `${a.me.name} reacted ${emoji}`, body: d.from === a.partner.id ? "to your doodle" : "to a doodle", url: "/" });
  return json({ doodle: d });
}
