package com.joy.scribbles;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;

/** Native Android notifications: new doodles (with the picture) and the evening reminder. */
final class Notifier {
    private static final String DOODLES = "doodles";
    private static final String REMINDERS = "reminders";

    private Notifier() {}

    static void ensureChannels(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel d = new NotificationChannel(DOODLES, "New doodles", NotificationManager.IMPORTANCE_HIGH);
        d.setDescription("When someone sends you a doodle");
        nm.createNotificationChannel(d);
        NotificationChannel r = new NotificationChannel(REMINDERS, "Evening reminder", NotificationManager.IMPORTANCE_DEFAULT);
        r.setDescription("One gentle ping at 8 pm on days you haven't sent anything");
        nm.createNotificationChannel(r);
    }

    private static PendingIntent openApp(Context c) {
        Intent i = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, 10, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    static void doodle(Context c, String fromName, Bitmap picture) {
        ensureChannels(c);
        Notification.Builder b = new Notification.Builder(c, DOODLES)
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(fromName + " sent you a doodle")
                .setContentText("Tap to see it and draw back")
                .setContentIntent(openApp(c))
                .setAutoCancel(true);
        if (picture != null) {
            b.setLargeIcon(picture);
            b.setStyle(new Notification.BigPictureStyle().bigPicture(picture).setSummaryText("Tap to draw back"));
        }
        post(c, 1, b.build());
    }

    static void reminder(Context c, String partner, boolean theyDrew) {
        ensureChannels(c);
        String title = theyDrew ? partner + " drew you something today" : "A little doodle for " + partner + "?";
        String body = theyDrew ? "Send one back? Even a squiggle counts." : "Nothing sent today yet. Ten seconds is enough.";
        post(c, 2, new Notification.Builder(c, REMINDERS)
                .setSmallIcon(R.drawable.ic_notify)
                .setContentTitle(title)
                .setContentText(body)
                .setContentIntent(openApp(c))
                .setAutoCancel(true)
                .build());
    }

    private static void post(Context c, int id, Notification n) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        if (nm == null) return;
        try {
            nm.notify(id, n);
        } catch (SecurityException ignored) {
            // Notifications not allowed yet.
        }
    }
}
