# ✎ Scribbles

A private, free drawing widget for two people: Joy (Android) and Vidya (iPhone).
You draw in the web app, and the drawing appears on the other person's home-screen widget.

| Piece | What it is | Cost |
|---|---|---|
| **Web app** (this repo, on Vercel) | Drawing canvas, history wall, seen receipts, push pings | Free |
| **iPhone widget** (`scriptable/Scribbles.js`) | Runs inside the free *Scriptable* app | Free |
| **Android widget** (`android/`) | Tiny native app, built automatically by GitHub Actions | Free |
| **Storage** | Upstash Redis (can share the Side by Side database; all keys start with `scribbles:`) | Free |

---

## 1 · Deploy the web app (Vercel)

1. Vercel → **Add New → Project** → import this `scribbles` repo. Leave every build setting at its default.
2. Before deploying, open **Environment Variables** and paste in every line from `scribbles-vercel-env.txt`, the private file you were given separately.
   Copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` from the Side by Side project.
3. Deploy. Your two personal links are `https://<your-app>.vercel.app/u/<JOY_KEY>` and `.../u/<VIDYA_KEY>`.

> 🔒 Anyone with a link can draw as that person, so only send each link to its owner.

## 2 · Vidya's iPhone

1. Open **her link in Safari**, then tap **Share → Add to Home Screen**. Open Scribbles from that icon and tap **Turn on** to get pings when Joy draws something.
2. Install **Scriptable** (free) from the App Store.
3. In Scriptable, tap **+**, paste in all of `scriptable/Scribbles.js`, put her personal link in `MY_LINK` at the top, and name the script **Scribbles**.
4. Long-press the home screen → **+** → **Scriptable** → pick the **small or large square** size → add it.
   Long-press the widget → **Edit Widget** → **Script: Scribbles** and **When Interacting: Open URL**.

Tapping the widget opens Scribbles so she can draw back. iOS decides when the widget refreshes, which is usually every few minutes; the notification always arrives instantly.

## 3 · Joy's OnePlus

1. In this repo, go to **Actions → Build Android widget**. It runs automatically after a push to `android/`, or you can tap **Run workflow**.
2. When it finishes, open **Releases** on your phone and download **Scribbles.apk**. Install it, allowing installs from your browser when asked.
3. Open the app, paste **your** personal link, tap **Connect**, then **Add widget to home screen**.
4. For the drawing side, open your link in Chrome → ⋮ → **Add to Home screen**, then tap **Turn on** for pings.

The widget checks about every 15 minutes, and immediately when you tap ↻ on it.
OnePlus battery saving can pause it. If that happens, go to **Settings → Apps → Scribbles → Battery → Allow background activity**.

---

### How it works
- `POST /api/doodles` saves a 900×900 PNG and sends a web push to the other person.
- `GET /api/widget?k=KEY&format=json|png` returns the latest doodle sent **to** you. Both widgets use this.
- `/u/<key>` is the app. Each person's link also gets its own home-screen manifest.
- The 300 most recent doodles are kept, and older ones are deleted automatically.

### Local development
```bash
npm install
JOY_KEY=joy VIDYA_KEY=vidya npm run dev   # uses in-memory storage when Upstash isn't set
# open http://localhost:3000/u/joy and http://localhost:3000/u/vidya
```
