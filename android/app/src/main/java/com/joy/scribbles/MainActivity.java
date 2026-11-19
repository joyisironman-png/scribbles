package com.joy.scribbles;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.OutputStream;

/** The whole Scribbles app: drawing + album (web view), notifications and the widget. */
public class MainActivity extends Activity {
    static volatile boolean visible = false;
    private static final String NOTIF_PERM = "android.permission.POST_NOTIFICATIONS";

    private WebView web;
    private EditText linkField;
    private TextView status;
    private ValueCallback<Uri[]> fileCallback;
    private Uri cameraUri;
    private static final int PICK_PHOTO = 42;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
        Notifier.ensureChannels(this);
        if (Store.link(this) != null) showWeb();
        else showSetup();
    }

    @Override
    protected void onResume() {
        super.onResume();
        visible = true;
        // Pull the latest doodle for the widget; you're looking at the app, so no ping for it.
        new Thread(() -> {
            try {
                Store.fetch(getApplicationContext());
                Store.markCurrentAsSeen(getApplicationContext());
            } catch (Exception ignored) {
            }
            ScribbleWidget.renderAll(getApplicationContext());
        }).start();
        RefreshJob.schedulePeriodic(this);
        if (web != null) web.evaluateJavascript("window.dispatchEvent(new Event('scribbles-refresh'))", null);
    }

    @Override
    protected void onPause() {
        super.onPause();
        visible = false;
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.getVisibility() == View.VISIBLE && web.canGoBack()) web.goBack();
        else if (web == null && Store.link(this) != null) showWeb();
        else super.onBackPressed();
    }

    /* ───────────── the app itself ───────────── */

    private void showWeb() {
        if (web == null) {
            web = new WebView(this);
            WebSettings s = web.getSettings();
            s.setJavaScriptEnabled(true);
            s.setDomStorageEnabled(true);
            s.setMediaPlaybackRequiresUserGesture(false);
            s.setUserAgentString(s.getUserAgentString() + " ScribblesAndroid/1");
            web.setOverScrollMode(View.OVER_SCROLL_NEVER);
            web.setBackgroundColor(Color.parseColor("#FBF6EC"));
            web.addJavascriptInterface(new Bridge(), "ScribblesAndroid");
            web.setWebViewClient(new WebViewClient() {
                @Override
                public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                    Uri u = req.getUrl();
                    String base = Store.base(MainActivity.this);
                    if (base != null && u.toString().startsWith(base)) return false;
                    try {
                        startActivity(new Intent(Intent.ACTION_VIEW, u));
                    } catch (Exception ignored) {
                    }
                    return true;
                }
            });
            web.setWebChromeClient(new WebChromeClient() {
                // Photo buttons on the page: gallery, files, or the camera.
                @Override
                public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb, FileChooserParams params) {
                    if (fileCallback != null) fileCallback.onReceiveValue(null);
                    fileCallback = cb;
                    Intent camera = cameraIntent();
                    Intent pick = new Intent(Intent.ACTION_GET_CONTENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*");
                    Intent chooser;
                    if (params.isCaptureEnabled() && camera != null) {
                        chooser = camera;
                    } else {
                        chooser = Intent.createChooser(pick, "Add a photo");
                        if (camera != null) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
                    }
                    try {
                        startActivityForResult(chooser, PICK_PHOTO);
                    } catch (Exception e) {
                        fileCallback = null;
                        cb.onReceiveValue(null);
                        return false;
                    }
                    return true;
                }
            });
            web.loadUrl(Store.link(this));
        }
        FrameLayout root = new FrameLayout(this);
        root.setFitsSystemWindows(true);
        root.setBackgroundColor(Color.parseColor("#FBF6EC"));
        if (web.getParent() != null) ((FrameLayout) web.getParent()).removeView(web);
        root.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(root);
        askForNotifications();
    }

    /** Camera intent that saves the shot into Pictures/Scribbles. */
    private Intent cameraIntent() {
        if (Build.VERSION.SDK_INT < 29) return null;
        try {
            ContentValues v = new ContentValues();
            v.put(MediaStore.Images.Media.DISPLAY_NAME, "scribbles-photo-" + System.currentTimeMillis() + ".jpg");
            v.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
            v.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Scribbles");
            cameraUri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
            if (cameraUri == null) return null;
            return new Intent(MediaStore.ACTION_IMAGE_CAPTURE)
                    .putExtra(MediaStore.EXTRA_OUTPUT, cameraUri)
                    .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        } catch (Exception e) {
            cameraUri = null;
            return null;
        }
    }

    @Override
    protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request != PICK_PHOTO || fileCallback == null) return;
        Uri[] picked = null;
        if (result == RESULT_OK) {
            if (data != null && data.getData() != null) picked = new Uri[]{data.getData()};
            else if (cameraUri != null) picked = new Uri[]{cameraUri};
        }
        // Clean up the empty camera slot if the camera wasn't used.
        if (cameraUri != null && (picked == null || picked[0] != cameraUri)) {
            try { getContentResolver().delete(cameraUri, null, null); } catch (Exception ignored) {}
        }
        cameraUri = null;
        fileCallback.onReceiveValue(picked);
        fileCallback = null;
    }

    private void askForNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(NOTIF_PERM) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{NOTIF_PERM}, 7);
        }
    }

    private boolean notificationsAllowed() {
        return Build.VERSION.SDK_INT < 33 || checkSelfPermission(NOTIF_PERM) == PackageManager.PERMISSION_GRANTED;
    }

    private void pinWidget() {
        AppWidgetManager mgr = getSystemService(AppWidgetManager.class);
        if (mgr != null && mgr.isRequestPinAppWidgetSupported()) {
            mgr.requestPinAppWidget(new ComponentName(this, ScribbleWidget.class), null, null);
        } else {
            Toast.makeText(this, "Long-press your home screen → Widgets → Scribbles", Toast.LENGTH_LONG).show();
        }
    }

    /** Lets the web page use phone features. */
    private class Bridge {
        @JavascriptInterface
        public boolean notificationsOn() {
            return notificationsAllowed();
        }

        @JavascriptInterface
        public void enableNotifications() {
            runOnUiThread(() -> {
                if (notificationsAllowed()) {
                    Toast.makeText(MainActivity.this, "Notifications are on", Toast.LENGTH_SHORT).show();
                } else if (Build.VERSION.SDK_INT >= 33 && !shouldShowRequestPermissionRationale(NOTIF_PERM)
                        && getSharedPreferences("scribbles", MODE_PRIVATE).getBoolean("askedNotif", false)) {
                    // Android won't ask again: open this app's notification settings instead.
                    startActivity(new Intent("android.settings.APP_NOTIFICATION_SETTINGS")
                            .putExtra("android.provider.extra.APP_PACKAGE", getPackageName()));
                } else {
                    getSharedPreferences("scribbles", MODE_PRIVATE).edit().putBoolean("askedNotif", true).apply();
                    askForNotifications();
                }
            });
        }

        @JavascriptInterface
        public void addWidget() {
            runOnUiThread(MainActivity.this::pinWidget);
        }

        @JavascriptInterface
        public void openSettings() {
            runOnUiThread(MainActivity.this::showSetup);
        }

        @JavascriptInterface
        public void saveImage(String dataUrl) {
            try {
                if (Build.VERSION.SDK_INT < 29) throw new IllegalStateException("Needs Android 10+");
                byte[] bytes = Base64.decode(dataUrl.substring(dataUrl.indexOf(',') + 1), Base64.DEFAULT);
                ContentValues v = new ContentValues();
                v.put(MediaStore.Images.Media.DISPLAY_NAME, "scribble-" + System.currentTimeMillis() + ".png");
                v.put(MediaStore.Images.Media.MIME_TYPE, "image/png");
                v.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/Scribbles");
                Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                if (uri == null) throw new IllegalStateException("No storage");
                try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                    if (out == null) throw new IllegalStateException("No storage");
                    out.write(bytes);
                }
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Saved to Pictures/Scribbles", Toast.LENGTH_SHORT).show());
            } catch (Exception e) {
                runOnUiThread(() -> Toast.makeText(MainActivity.this, "Couldn't save: " + e.getMessage(), Toast.LENGTH_SHORT).show());
            }
        }
    }

    /* ───────────── setup / settings screen ───────────── */

    private void showSetup() {
        setContentView(R.layout.activity_main);
        linkField = findViewById(R.id.link);
        status = findViewById(R.id.status);
        Button save = findViewById(R.id.save);
        Button paste = findViewById(R.id.paste);
        Button addWidget = findViewById(R.id.add_widget);
        Button open = findViewById(R.id.open);
        Button refresh = findViewById(R.id.refresh_now);

        if (Store.link(this) != null) linkField.setText(Store.link(this));

        paste.setOnClickListener(v -> {
            ClipboardManager cm = getSystemService(ClipboardManager.class);
            ClipData clip = cm != null ? cm.getPrimaryClip() : null;
            if (clip != null && clip.getItemCount() > 0) {
                CharSequence t = clip.getItemAt(0).coerceToText(this);
                if (t != null) linkField.setText(t.toString().trim());
            }
        });
        save.setOnClickListener(v -> connect());
        addWidget.setOnClickListener(v -> pinWidget());
        open.setOnClickListener(v -> {
            if (Store.link(this) == null) { setStatus("Add your link first."); return; }
            showWeb();
        });
        refresh.setOnClickListener(v -> refreshNow());

        if (Store.link(this) == null) setStatus("Paste the personal Scribbles link you were given.");
    }

    private void connect() {
        String text = linkField.getText().toString().trim();
        if (Store.parseLink(text) == null) {
            setStatus("That doesn't look like a Scribbles link. It should end in /u/ followed by your code.");
            return;
        }
        boolean changed = !text.equals(Store.link(this));
        Store.saveLink(this, text);
        if (changed && web != null) { web.destroy(); web = null; }
        setStatus("Checking your link…");
        new Thread(() -> {
            try {
                String me = Store.whoAmI(this);
                Store.fetch(this);
                ScribbleWidget.renderAll(this);
                RefreshJob.schedulePeriodic(this);
                runOnUiThread(() -> {
                    Toast.makeText(this, "Connected as " + me + " ✓", Toast.LENGTH_SHORT).show();
                    showWeb();
                });
            } catch (Exception e) {
                runOnUiThread(() -> setStatus("Couldn't connect: " + e.getMessage()));
            }
        }).start();
    }

    private void refreshNow() {
        setStatus("Refreshing…");
        new Thread(() -> {
            try {
                Store.fetch(this);
                Store.markCurrentAsSeen(this);
                ScribbleWidget.renderAll(this);
                String msg = Store.hasDoodle(this)
                        ? "Widget is up to date. Latest doodle is from " + Store.fromName(this) + "."
                        : "Connected. Nothing received yet.";
                runOnUiThread(() -> setStatus(msg));
            } catch (Exception e) {
                runOnUiThread(() -> setStatus("Couldn't refresh: " + e.getMessage()));
            }
        }).start();
    }

    private void setStatus(String s) {
        if (status == null) return;
        status.setText(s);
        status.setVisibility(View.VISIBLE);
    }
}
