import { readFileSync } from "fs";
import path from "path";

export const dynamic = "force-dynamic";

// The widget design, fetched fresh by the iPhone loader script on every run.
export async function GET() {
  const src = readFileSync(path.join(process.cwd(), "scriptable", "widget.js"), "utf8");
  return new Response(src, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
