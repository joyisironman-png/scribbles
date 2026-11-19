export const dynamic = "force-dynamic";

// Which deploy is live, so open copies of the app can refresh themselves after an update.
export async function GET() {
  return Response.json(
    { build: process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || "dev" },
    { headers: { "cache-control": "no-store" } }
  );
}
