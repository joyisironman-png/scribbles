import { timingSafeEqual } from "crypto";

// The two people who share Scribbles. Names can be changed with env vars.
export const USERS = {
  joy: { id: "joy", name: process.env.JOY_NAME || "Joy", keyEnv: "JOY_KEY" },
  vidya: { id: "vidya", name: process.env.VIDYA_NAME || "Vidya", keyEnv: "VIDYA_KEY" },
};

export function partnerOf(id) {
  return id === "joy" ? USERS.vidya : USERS.joy;
}

function same(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
}

// Each person has a private key that lives in their personal link (/u/<key>).
export function userFromKey(k) {
  if (!k) return null;
  for (const u of Object.values(USERS)) {
    const key = process.env[u.keyEnv];
    if (key && same(key, k)) return u;
  }
  return null;
}

export function publicUser(u) {
  return u ? { id: u.id, name: u.name } : null;
}
