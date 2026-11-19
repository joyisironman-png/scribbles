import { userFromKey, partnerOf, publicUser } from "@/lib/config";
import App from "./App";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { key } = await params;
  return { manifest: `/api/manifest/${encodeURIComponent(key)}` };
}

export default async function Page({ params }) {
  const { key } = await params;
  const me = userFromKey(key);
  if (!me) {
    return (
      <main className="landing">
        <div className="landing-mark">✎</div>
        <h1>Hmm.</h1>
        <p>This link doesn&apos;t look right. Ask for your personal Scribbles link again.</p>
      </main>
    );
  }
  return <App k={key} me={publicUser(me)} partner={publicUser(partnerOf(me.id))} />;
}
