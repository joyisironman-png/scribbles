import { userFromKey, partnerOf, publicUser } from "./config";

export const json = (data, status = 200) =>
  Response.json(data, { status, headers: { "cache-control": "no-store" } });

export function auth(k) {
  const me = userFromKey(k);
  return me ? { me, partner: partnerOf(me.id) } : null;
}

export { publicUser };
