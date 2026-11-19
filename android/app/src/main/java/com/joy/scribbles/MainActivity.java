package com.joy.scribbles;

import android.app.Activity;
import android.appwidget.AppWidgetManager;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ComponentName;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;

public class MainActivity extends Activity {
    private EditText linkField;
    private TextView status;

    @Override
    protected void onCreate(Bundle saved) {
        super.onCreate(saved);
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

        addWidget.setOnClickListener(v -> {
            AppWidgetManager mgr = getSystemService(AppWidgetManager.class);
            if (mgr != null && mgr.isRequestPinAppWidgetSupported()) {
                mgr.requestPinAppWidget(new ComponentName(this, ScribbleWidget.class), null, null);
            } else {
                setStatus("Long-press your home screen → Widgets → Scribbles.");
            }
        });

        open.setOnClickListener(v -> {
            String link = Store.link(this);
            if (link == null) { setStatus("Add your link first."); return; }
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(link)));
        });

        refresh.setOnClickListener(v -> refreshNow());

        // Allow opening the app via a shared link too.
        Intent in = getIntent();
        if (in != null && Intent.ACTION_SEND.equals(in.getAction())) {
            String shared = in.getStringExtra(Intent.EXTRA_TEXT);
            if (shared != null) linkField.setText(shared);
        }

        if (Store.link(this) != null) refreshNow();
        else setStatus("Paste the personal Scribbles link you open the app with.");
    }

    private void connect() {
        String text = linkField.getText().toString().trim();
        if (Store.parseLink(text) == null) {
            setStatus("That doesn't look like a Scribbles link. It should end in /u/ followed by your code.");
            return;
        }
        Store.saveLink(this, text);
        setStatus("Checking your link…");
        new Thread(() -> {
            try {
                String me = Store.whoAmI(this);
                Store.fetch(this);
                ScribbleWidget.renderAll(this);
                RefreshJob.schedulePeriodic(this);
                runOnUiThread(() -> setStatus("Connected as " + me + " ✓  Now add the widget to your home screen."));
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
                ScribbleWidget.renderAll(this);
                String msg = Store.hasDoodle(this)
                        ? "Up to date. Latest doodle is from " + Store.fromName(this) + "."
                        : "Connected. Nothing received yet.";
                runOnUiThread(() -> setStatus(msg));
            } catch (Exception e) {
                runOnUiThread(() -> setStatus("Couldn't refresh: " + e.getMessage()));
            }
        }).start();
    }

    private void setStatus(String s) {
        status.setText(s);
        status.setVisibility(View.VISIBLE);
    }
}
