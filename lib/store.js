import { Redis } from "@upstash/redis";

// Works with either the Upstash env names or Vercel's KV integration names.
const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

// Every key is prefixed, so this can safely share a database with another app.
const P = "scribbles:";
const HISTORY_CAP = 300;

const redis = url && token ? new Redis({ url, token, automaticDeserialization: false }) : null;

// In-memory fallback for local testing only (no Upstash env set).
const mem = globalThis.__scribblesMem || (globalThis.__scribblesMem = { kv: new Map(), lists: new Map(), hashes: new Map() });

const db = redis
  ? {
      get: (k) => redis.get(P + k),
      set: (k, v, o) => (o ? redis.set(P + k, v, o) : redis.set(P + k, v)),
      del: (k) => redis.del(P + k),
      lpush: (k, v) => redis.lpush(P + k, v),
      ltrim: (k, a, b) => redis.ltrim(P + k, a, b),
      lrange: (k, a, b) => redis.lrange(P + k, a, b),
      hset: (k, f, v) => redis.hset(P + k, { [f]: v }),
      hdel: (k, f) => redis.hdel(P + k, f),
      hvals: (k) => redis.hvals(P + k),
    }
  : {
      get: async (k) => mem.kv.get(k) ?? null,
      set: async (k, v) => mem.kv.set(k, v),
      del: async (k) => mem.kv.delete(k),
      lpush: async (k, v) => { const l = mem.lists.get(k) || []; l.unshift(v); mem.lists.set(k, l); },
      ltrim: async (k, a, b) => { const l = mem.lists.get(k) || []; mem.lists.set(k, l.slice(a, b + 1)); },
      lrange: async (k, a, b) => (mem.lists.get(k) || []).slice(a, b === -1 ? undefined : b + 1),
      hset: async (k, f, v) => { const h = mem.hashes.get(k) || new Map(); h.set(f, v); mem.hashes.set(k, h); },
      hdel: async (k, f) => { mem.hashes.get(k)?.delete(f); },
      hvals: async (k) => [...(mem.hashes.get(k)?.values() || [])],
    };

const parse = (v) => (v == null ? null : typeof v === "string" ? JSON.parse(v) : v);

// Calendar day in India, e.g. "2026-11-19".
export const dayOf = (t = Date.now()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(t));

export async function saveDoodle({ from, to, image, bg }) {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const meta = { id, from, to, createdAt: Date.now(), seenAt: null, bg: bg || null };
  await db.set(`sent:${dayOf()}:${from}`, "1", { ex: 3 * 86400 });
  await db.set(`img:${id}`, image);
  await db.set(`doodle:${id}`, JSON.stringify(meta));
  await db.set(`latest:${to}`, id);
  await db.lpush("all", id);

  // Keep history bounded: drop doodles beyond the cap.
  const overflow = await db.lrange("all", HISTORY_CAP, -1);
  if (overflow?.length) {
    await db.ltrim("all", 0, HISTORY_CAP - 1);
    for (const old of overflow) {
      await db.del(`img:${old}`);
      await db.del(`doodle:${old}`);
    }
  }
  return meta;
}

export async function getDoodle(id) {
  return parse(await db.get(`doodle:${id}`));
}

export async function getImage(id) {
  return db.get(`img:${id}`);
}

export async function latestFor(userId) {
  const id = await db.get(`latest:${userId}`);
  return id ? getDoodle(id) : null;
}

export async function recent(limit = 60) {
  const ids = (await db.lrange("all", 0, limit - 1)) || [];
  const metas = await Promise.all(ids.map(getDoodle));
  return metas.filter(Boolean);
}

export async function markSeen(id, userId) {
  const d = await getDoodle(id);
  if (!d || d.to !== userId || d.seenAt) return d;
  d.seenAt = Date.now();
  await db.set(`doodle:${id}`, JSON.stringify(d));
  return d;
}

export async function addSub(userId, sub) {
  await db.hset(`subs:${userId}`, sub.endpoint, JSON.stringify(sub));
}

export async function getSubs(userId) {
  return ((await db.hvals(`subs:${userId}`)) || []).map(parse);
}

export async function removeSub(userId, endpoint) {
  await db.hdel(`subs:${userId}`, endpoint);
}

export async function sentOn(day, userId) {
  return Boolean(await db.get(`sent:${day}:${userId}`));
}

// Evening reminder preference (on unless turned off).
export async function remindOn(userId) {
  return (await db.get(`remind:${userId}`)) !== "off";
}
export async function setRemind(userId, on) {
  await db.set(`remind:${userId}`, on ? "on" : "off");
}
export async function remindedOn(day, userId) {
  return Boolean(await db.get(`reminded:${day}:${userId}`));
}
export async function markReminded(day, userId) {
  await db.set(`reminded:${day}:${userId}`, "1", { ex: 3 * 86400 });
}

export const usingRedis = Boolean(redis);
