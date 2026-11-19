package com.joy.scribbles;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Saved settings + the latest doodle, and the network calls to fetch it. */
final class Store {
    private static final String PREFS = "scribbles";
    private static final Pattern LINK = Pattern.compile("^(https?://[^/]+)/u/([^/?#\\s]+)");
    static final int IMAGE_PX = 600; // matches a 2x2 widget on a phone screen

    private Store() {}

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Returns {base, key} or null if the link doesn't look like a Scribbles link. */
    static String[] parseLink(String link) {
        if (link == null) return null;
        Matcher m = LINK.matcher(link.trim());
        return m.find() ? new String[]{m.group(1), m.group(2)} : null;
    }

    static String link(Context c) { return prefs(c).getString("link", null); }
    static String base(Context c) { return prefs(c).getString("base", null); }
    static String key(Context c) { return prefs(c).getString("key", null); }
    static String fromName(Context c) { return prefs(c).getString("fromName", null); }
    static long createdAt(Context c) { return prefs(c).getLong("createdAt", 0); }
    static boolean hasDoodle(Context c) { return prefs(c).getBoolean("has", false) && imageFile(c).exists(); }

    static File imageFile(Context c) { return new File(c.getFilesDir(), "latest.png"); }

    static void saveLink(Context c, String link) {
        String[] p = parseLink(link);
        if (p == null) return;
        prefs(c).edit()
                .putString("link", p[0] + "/u/" + p[1])
                .putString("base", p[0])
                .putString("key", p[1])
                .remove("lastId").putBoolean("has", false)
                .apply();
        imageFile(c).delete();
    }

    /** Checks the link with the server. Returns "Joy" (your name) or throws. */
    static String whoAmI(Context c) throws Exception {
        JSONObject j = new JSONObject(get(base(c) + "/api/me?k=" + key(c)));
        return j.getJSONObject("me").getString("name");
    }

    /** Fetches the latest doodle sent to you. Returns true if something changed. */
    static boolean fetch(Context c) throws Exception {
        if (base(c) == null) return false;
        JSONObject j = new JSONObject(get(base(c) + "/api/widget?format=json&k=" + key(c) + "&t=" + System.currentTimeMillis()));
        SharedPreferences p = prefs(c);
        boolean has = j.optBoolean("has", false);
        String id = has ? j.getString("id") : null;
        String fromName = j.optString("fromName", "");
        if (!has) {
            p.edit().putBoolean("has", false).putString("fromName", fromName).apply();
            return true;
        }
        if (id.equals(p.getString("lastId", null)) && imageFile(c).exists()) return false;

        byte[] bytes = getBytes(j.getString("image"));
        BitmapFactory.Options bounds = new BitmapFactory.Options();
        bounds.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, bounds);
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inSampleSize = 1;
        while (bounds.outWidth / (opts.inSampleSize * 2) >= IMAGE_PX) opts.inSampleSize *= 2;
        Bitmap raw = BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
        if (raw == null) throw new IOException("Couldn't read image");
        Bitmap scaled = raw.getWidth() > IMAGE_PX ? Bitmap.createScaledBitmap(raw, IMAGE_PX, IMAGE_PX, true) : raw;

        File tmp = new File(c.getFilesDir(), "latest.tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            scaled.compress(Bitmap.CompressFormat.PNG, 100, out);
        }
        if (!tmp.renameTo(imageFile(c))) throw new IOException("Couldn't save image");

        p.edit()
                .putBoolean("has", true)
                .putString("lastId", id)
                .putString("fromName", fromName)
                .putLong("createdAt", j.optLong("createdAt", System.currentTimeMillis()))
                .apply();
        return true;
    }

    /** Loads the saved doodle in a widget-friendly format (small enough for the launcher). */
    static Bitmap loadBitmap(Context c) {
        BitmapFactory.Options o = new BitmapFactory.Options();
        o.inPreferredConfig = Bitmap.Config.RGB_565;
        return BitmapFactory.decodeFile(imageFile(c).getAbsolutePath(), o);
    }

    private static String get(String url) throws IOException {
        return new String(getBytes(url), StandardCharsets.UTF_8);
    }

    private static byte[] getBytes(String url) throws IOException {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(20000);
        conn.setUseCaches(false);
        try {
            int code = conn.getResponseCode();
            if (code == 401) throw new IOException("That link isn't valid");
            if (code >= 400) throw new IOException("Server error " + code);
            try (InputStream in = conn.getInputStream()) {
                ByteArrayOutputStream buf = new ByteArrayOutputStream();
                byte[] chunk = new byte[16384];
                int n;
                while ((n = in.read(chunk)) != -1) buf.write(chunk, 0, n);
                return buf.toByteArray();
            }
        } finally {
            conn.disconnect();
        }
    }
}
