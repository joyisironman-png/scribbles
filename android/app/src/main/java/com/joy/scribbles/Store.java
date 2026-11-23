package com.joy.scribbles;

import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;

import org.json.JSONObject;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

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
                .remove("lastId").remove("notifiedId").putBoolean("firstSync", true).putBoolean("has", false)
                .apply();
        imageFile(c).delete();
    }

    /** Checks the link with the server. Returns "Joy" (your name) or throws. */
    static String whoAmI(Context c) throws Exception {
        JSONObject j = new JSONObject(get(base(c) + "/api/me?k=" + key(c)));
        return j.getJSONObject("me").getString("name");
    }

    /** Fetches the latest doodle sent to you. Notifies about new ones and the evening reminder. */
    static boolean fetch(Context c) throws Exception {
        if (base(c) == null) return false;
        JSONObject j = new JSONObject(get(base(c) + "/api/widget?format=json&k=" + key(c) + "&t=" + System.currentTimeMillis()));
        SharedPreferences p = prefs(c);
        boolean has = j.optBoolean("has", false);
        String fromName = j.optString("fromName", "");
        p.edit().putString("fromName", fromName).apply();
        saveTheme(c, j.optJSONObject("theme"));
        maybeRemind(c, j, fromName);

        if (!has) {
            p.edit().putBoolean("has", false).apply();
            return true;
        }
        String id = j.getString("id");
        if (id.equals(p.getString("lastId", null)) && imageFile(c).exists()) return false;

        byte[] bytes = getBytes(j.getString("image"));
        if (j.optBoolean("e2e", false)) bytes = unlock(c, bytes);
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

        // Notify only about doodles that arrive after the first sync, and only once each.
        String notified = p.getString("notifiedId", null);
        boolean firstSync = p.getBoolean("firstSync", true);
        if (!firstSync && !id.equals(notified) && !MainActivity.visible) Notifier.doodle(c, fromName, scaled);

        p.edit()
                .putBoolean("has", true)
                .putString("lastId", id)
                .putString("notifiedId", id)
                .putBoolean("firstSync", false)
                .putLong("createdAt", j.optLong("createdAt", System.currentTimeMillis()))
                .apply();
        return true;
    }

    /** Theme colours picked in Scribbles (the widget follows them). */
    private static void saveTheme(Context c, JSONObject t) {
        if (t == null) return;
        prefs(c).edit()
                .putString("thPaper", t.optString("paper", "#F6EFE3"))
                .putString("thCard", t.optString("card", "#FFFDF8"))
                .putString("thInk", t.optString("ink", "#1F1B18"))
                .putString("thSoft", t.optString("soft", "#7A6E62"))
                .putString("thTape", t.optString("tape", "#F2C94C"))
                .putBoolean("thDark", t.optBoolean("dark", false))
                .apply();
    }

    static int color(Context c, String key, String fallback) {
        try { return android.graphics.Color.parseColor(prefs(c).getString(key, fallback)); }
        catch (Exception e) { return android.graphics.Color.parseColor(fallback); }
    }

    static boolean dark(Context c) { return prefs(c).getBoolean("thDark", false); }

    /** End-to-end key (from the Scribbles app on this phone). Never sent anywhere. */
    static void setKey(Context c, String code) {
        prefs(c).edit().putString("e2eKey", code).apply();
    }

    /** blob = 12-byte IV | ciphertext | 16-byte tag (AES-256-GCM). */
    static byte[] unlock(Context c, byte[] blob) throws Exception {
        String code = prefs(c).getString("e2eKey", null);
        if (code == null) throw new IOException("Locked. Open Scribbles once to unlock");
        byte[] key = android.util.Base64.decode(code, android.util.Base64.URL_SAFE | android.util.Base64.NO_PADDING | android.util.Base64.NO_WRAP);
        Cipher ci = Cipher.getInstance("AES/GCM/NoPadding");
        ci.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, blob, 0, 12));
        return ci.doFinal(blob, 12, blob.length - 12);
    }

    /** Called when the app is opened, so the doodle already on screen doesn't also ping. */
    static void markCurrentAsSeen(Context c) {
        SharedPreferences p = prefs(c);
        String id = p.getString("lastId", null);
        if (id != null) p.edit().putString("notifiedId", id).apply();
    }

    /** 8 pm–11 pm India time: one gentle ping if you haven't sent anything today. */
    private static void maybeRemind(Context c, JSONObject j, String partner) {
        if (!j.optBoolean("remind", true) || j.optBoolean("sentToday", false)) return;
        java.util.Calendar now = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("Asia/Kolkata"));
        int hour = now.get(java.util.Calendar.HOUR_OF_DAY);
        if (hour < 20 || hour >= 23) return;
        String today = j.optString("today", "");
        SharedPreferences p = prefs(c);
        if (today.isEmpty() || today.equals(p.getString("remindedDay", null))) return;
        p.edit().putString("remindedDay", today).apply();
        Notifier.reminder(c, partner.isEmpty() ? "them" : partner, j.optBoolean("theyDrewToday", false));
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
