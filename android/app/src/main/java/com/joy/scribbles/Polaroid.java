package com.joy.scribbles;

import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.Typeface;

/** Draws the doodle as a framed polaroid with tape, name and time. Always the same shape, so it never gets cropped. */
final class Polaroid {
    static final int W = 420, H = 480; // ~800 KB: small enough for the home-screen launcher

    private Polaroid() {}

    static Bitmap render(Bitmap doodle, String name, String time) {
        Bitmap out = Bitmap.createBitmap(W, H, Bitmap.Config.ARGB_8888);
        Canvas c = new Canvas(out);
        RectF card = new RectF(14, 16, W - 14, H - 22);

        // soft edge underneath
        Paint shadow = new Paint(Paint.ANTI_ALIAS_FLAG);
        shadow.setColor(Color.parseColor("#FFFDF8"));
        shadow.setShadowLayer(16, 0, 7, Color.argb(70, 74, 51, 32));
        c.drawRoundRect(card, 26, 26, shadow);

        Paint edge = new Paint(Paint.ANTI_ALIAS_FLAG);
        edge.setStyle(Paint.Style.STROKE);
        edge.setStrokeWidth(1.5f);
        edge.setColor(Color.argb(22, 0, 0, 0));
        c.drawRoundRect(card, 26, 26, edge);

        // the doodle, rounded
        float pad = 14;
        float size = card.width() - pad * 2;
        RectF pic = new RectF(card.left + pad, card.top + pad, card.left + pad + size, card.top + pad + size);
        int save = c.save();
        Path clip = new Path();
        clip.addRoundRect(pic, 16, 16, Path.Direction.CW);
        c.clipPath(clip);
        Paint img = new Paint(Paint.FILTER_BITMAP_FLAG | Paint.ANTI_ALIAS_FLAG);
        c.drawBitmap(doodle, new Rect(0, 0, doodle.getWidth(), doodle.getHeight()), pic, img);
        c.restoreToCount(save);

        // washi tape
        float cx = pic.centerX(), ty = card.top - 6;
        Path tape = new Path();
        tape.moveTo(cx - 62, ty);
        tape.lineTo(cx + 66, ty + 8);
        tape.lineTo(cx + 62, ty + 38);
        tape.lineTo(cx - 66, ty + 30);
        tape.close();
        Paint tp = new Paint(Paint.ANTI_ALIAS_FLAG);
        tp.setColor(Color.argb(165, 242, 201, 76));
        c.drawPath(tape, tp);
        Paint stripe = new Paint(Paint.ANTI_ALIAS_FLAG);
        stripe.setColor(Color.argb(50, 255, 255, 255));
        stripe.setStrokeWidth(3);
        for (int i = 0; i < 8; i++) {
            float x = cx - 52 + i * 15;
            c.drawLine(x, ty + 3, x + 3, ty + 33, stripe);
        }

        // caption
        float base = card.bottom - 22;
        Paint np = new Paint(Paint.ANTI_ALIAS_FLAG);
        np.setTypeface(Typeface.create(Typeface.SERIF, Typeface.BOLD_ITALIC));
        np.setTextSize(28);
        np.setColor(Color.parseColor("#1F1B18"));
        c.drawText(name == null ? "" : name, pic.left + 4, base, np);
        Paint tpaint = new Paint(Paint.ANTI_ALIAS_FLAG);
        tpaint.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.NORMAL));
        tpaint.setTextSize(19);
        tpaint.setColor(Color.parseColor("#7A6E62"));
        tpaint.setTextAlign(Paint.Align.RIGHT);
        c.drawText(time == null ? "" : time, pic.right - 4, base, tpaint);
        return out;
    }
}
