import { USERS, partnerOf } from "@/lib/config";
import { json } from "@/lib/api";
import { dayOf, sentOn, remindOn, remindedOn, markReminded } from "@/lib/store";
import { notify } from "@/lib/push";

export const dynamic = "force-dynamic";

// Runs once each evening (see vercel.json). One gentle ping, only to
// whoever hasn't sent a doodle today, and never if they've turned it off.
export async function GET(req) {
  const secret = process.env.CRON_SECRET;
  const ua = req.headers.get("user-agent") || "";
  const ok = secret ? req.headers.get("authorization") === `Bearer ${secret}` : ua.includes("vercel-cron");
  if (!ok) return json({ error: "cron only" }, 401);

  const today = dayOf();
  const sent = {};
  for (const u of Object.values(USERS)) {
    const p = partnerOf(u.id);
    if ((await sentOn(today, u.id)) || (await remindedOn(today, u.id)) || !(await remindOn(u.id))) continue;
    const theyDrew = await sentOn(today, p.id);
    await notify(u.id, theyDrew
      ? { title: `${p.name} drew you something today`, body: "Send one back? Even a squiggle counts.", url: "/" }
      : { title: `A little doodle for ${p.name}?`, body: "Nothing sent today yet. Ten seconds is enough.", url: "/" });
    await markReminded(today, u.id);
    sent[u.id] = theyDrew ? "reply" : "nudge";
  }
  return json({ ok: true, today, sent });
}
