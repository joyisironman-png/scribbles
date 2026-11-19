package com.joy.scribbles;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.text.format.DateUtils;
import android.view.View;
import android.widget.RemoteViews;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

public class ScribbleWidget extends AppWidgetProvider {
    static final String ACTION_REFRESH = "com.joy.scribbles.REFRESH";

    @Override
    public void onUpdate(Context c, AppWidgetManager mgr, int[] ids) {
        renderAll(c);
        RefreshJob.schedulePeriodic(c);
        RefreshJob.runNow(c);
    }

    @Override
    public void onEnabled(Context c) {
        RefreshJob.schedulePeriodic(c);
    }

    @Override
    public void onDisabled(Context c) {
        RefreshJob.cancelAll(c);
    }

    @Override
    public void onReceive(Context c, Intent intent) {
        super.onReceive(c, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            RefreshJob.runNow(c);
        }
    }

    static void renderAll(Context c) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(c);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(c, ScribbleWidget.class));
        if (ids == null || ids.length == 0) return;
        mgr.updateAppWidget(ids, build(c));
    }

    private static RemoteViews build(Context c) {
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget);
        String link = Store.link(c);

        // Tap the drawing -> open the Scribbles app to draw back.
        Intent open = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        v.setOnClickPendingIntent(R.id.root, PendingIntent.getActivity(c, 1, open,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));

        Intent refresh = new Intent(c, ScribbleWidget.class).setAction(ACTION_REFRESH);
        v.setOnClickPendingIntent(R.id.refresh, PendingIntent.getBroadcast(c, 2, refresh,
                PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));

        Bitmap bmp = Store.hasDoodle(c) ? Store.loadBitmap(c) : null;
        if (bmp != null) {
            v.setImageViewBitmap(R.id.image, Polaroid.render(bmp, Store.fromName(c), time(Store.createdAt(c))));
            v.setViewVisibility(R.id.image, View.VISIBLE);
            v.setViewVisibility(R.id.empty, View.GONE);
            v.setViewVisibility(R.id.caption, View.GONE);
        } else {
            v.setViewVisibility(R.id.image, View.GONE);
            v.setViewVisibility(R.id.empty, View.VISIBLE);
            v.setViewVisibility(R.id.caption, View.GONE);
            String who = Store.fromName(c);
            v.setTextViewText(R.id.empty_title, link == null ? "Add your link" : "Nothing yet");
            v.setTextViewText(R.id.empty_text, link == null
                    ? "Open the Scribbles app and paste your personal link."
                    : "When " + (who == null || who.isEmpty() ? "they" : who) + " draws something, it lands here.");
        }
        return v;
    }

    private static String time(long ts) {
        if (ts <= 0) return "";
        String pattern = DateUtils.isToday(ts) ? "h:mm a" : "EEE h:mm a";
        return new SimpleDateFormat(pattern, Locale.getDefault()).format(new Date(ts)).toLowerCase(Locale.getDefault());
    }
}
