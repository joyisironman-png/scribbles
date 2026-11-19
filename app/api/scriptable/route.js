import { readFileSync } from "fs";
import path from "path";
import { userFromKey } from "@/lib/config";

export const dynamic = "force-dynamic";

// The iPhone widget script, with this person's link already filled in.
export async function GET(req) {
  const u = new URL(req.url);
  const k = u.searchParams.get("k");
  if (!userFromKey(k)) return new Response("bad key", { status: 401 });
  const src = readFileSync(path.join(process.cwd(), "scriptable", "Scribbles.js"), "utf8");
  const link = `${u.origin}/u/${k}`;
  return new Response(src.replace("PASTE-YOUR-PERSONAL-LINK-HERE", link), {
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}
