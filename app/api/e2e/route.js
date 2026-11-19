import { auth, json } from "@/lib/api";
import { getE2E, setE2E } from "@/lib/store";

export const dynamic = "force-dynamic";

// Switch on end-to-end encryption: { k, fp }. The server keeps only the key's fingerprint.
export async function POST(req) {
  const body = await req.json().catch(() => ({}));
  const a = auth(body.k);
  if (!a) return json({ error: "bad key" }, 401);
  const fp = String(body.fp || "");
  if (!/^[A-Za-z0-9_-]{16}$/.test(fp)) return json({ error: "bad fingerprint" }, 400);
  const cur = await getE2E();
  if (cur?.fp && cur.fp !== fp && !body.replace) return json({ error: "already set up with a different code", e2e: cur }, 409);
  const v = { fp, by: a.me.id, at: Date.now() };
  await setE2E(v);
  return json({ e2e: v });
}
