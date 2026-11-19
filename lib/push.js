import webpush from "web-push";
import { getSubs, removeSub } from "./store";

const pub = process.env.VAPID_PUBLIC_KEY;
const priv = process.env.VAPID_PRIVATE_KEY;
let ready = false;
if (pub && priv) {
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:scribbles@example.com", pub, priv);
  ready = true;
}

export const pushEnabled = () => ready;

export async function notify(userId, payload) {
  if (!ready) return;
  const subs = await getSubs(userId);
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(s, JSON.stringify(payload), { TTL: 60 * 60 * 24, urgency: "high" });
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await removeSub(userId, s.endpoint);
      }
    })
  );
}
