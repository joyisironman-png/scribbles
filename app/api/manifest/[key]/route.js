import { userFromKey } from "@/lib/config";

export const dynamic = "force-dynamic";

// Per-person manifest so "Add to Home Screen" opens straight into your own link.
export async function GET(req, { params }) {
  const { key } = await params;
  const me = userFromKey(key);
  if (!me) return new Response("not found", { status: 404 });
  const start = `/u/${encodeURIComponent(key)}`;
  return Response.json(
    {
      name: "Scribbles",
      short_name: "Scribbles",
      id: start,
      start_url: start,
      scope: "/",
      display: "standalone",
      background_color: "#FBF6EC",
      theme_color: "#FBF6EC",
      icons: [
        { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ],
    },
    { headers: { "content-type": "application/manifest+json" } }
  );
}
