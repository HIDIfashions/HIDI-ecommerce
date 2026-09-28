package com.thehidi.app;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.TextView;

final class HidiUi {
    static final int CANVAS = Color.rgb(247, 243, 238);
    static final int SURFACE = Color.rgb(255, 253, 250);
    static final int SURFACE_MUTED = Color.rgb(238, 233, 226);
    static final int INK = Color.rgb(34, 28, 27);
    static final int MUTED = Color.rgb(116, 106, 101);
    static final int WINE = Color.rgb(93, 37, 45);
    static final int GOLD = Color.rgb(182, 140, 72);
    static final int SAGE = Color.rgb(212, 218, 205);
    static final int LINE = Color.rgb(226, 218, 210);

    private HidiUi() {}

    static int dp(Activity a, int value) {
        return Math.round(value * a.getResources().getDisplayMetrics().density);
    }

    static TextView text(Activity a, String value, int sp, int color, int style) {
        TextView view = new TextView(a);
        view.setText(value);
        view.setTextSize(sp);
        view.setTextColor(color);
        view.setTypeface(Typeface.create("sans", style));
        view.setIncludeFontPadding(false);
        return view;
    }

    static TextView serif(Activity a, String value, int sp, int color) {
        TextView view = text(a, value, sp, color, Typeface.NORMAL);
        view.setTypeface(Typeface.create("serif", Typeface.NORMAL));
        return view;
    }

    static TextView overline(Activity a, String value) {
        TextView view = text(a, value.toUpperCase(), 9, GOLD, Typeface.BOLD);
        view.setLetterSpacing(0.13f);
        return view;
    }

    static GradientDrawable rounded(int fill, int radiusDp, Activity a) {
        GradientDrawable d = new GradientDrawable();
        d.setColor(fill);
        d.setCornerRadius(dp(a, radiusDp));
        return d;
    }

    static GradientDrawable bordered(int fill, int radiusDp, int stroke, Activity a) {
        GradientDrawable d = rounded(fill, radiusDp, a);
        d.setStroke(dp(a, 1), stroke);
        return d;
    }

    static TextView chip(Activity a, String label, boolean active) {
        TextView chip = text(a, label, 11, active ? Color.WHITE : INK, Typeface.BOLD);
        chip.setGravity(Gravity.CENTER);
        chip.setPadding(dp(a, 16), dp(a, 10), dp(a, 16), dp(a, 10));
        chip.setBackground(active
                ? rounded(INK, 99, a)
                : bordered(SURFACE, 99, LINE, a));
        press(chip);
        return chip;
    }

    static ImageButton iconButton(Activity a, int icon, String description) {
        ImageButton button = new ImageButton(a);
        button.setImageResource(icon);
        button.setColorFilter(INK);
        button.setContentDescription(description);
        button.setBackground(rounded(SURFACE, 18, a));
        button.setPadding(dp(a, 11), dp(a, 11), dp(a, 11), dp(a, 11));
        button.setElevation(dp(a, 1));
        press(button);
        return button;
    }

    static LinearLayout topBar(
            Activity a,
            String title,
            String eyebrow,
            View left,
            View right
    ) {
        LinearLayout bar = new LinearLayout(a);
        bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(dp(a, 18), dp(a, 10), dp(a, 18), dp(a, 10));

        if (left != null) {
            bar.addView(left, new LinearLayout.LayoutParams(dp(a, 46), dp(a, 46)));
        } else {
            View spacer = new View(a);
            bar.addView(spacer, new LinearLayout.LayoutParams(dp(a, 46), dp(a, 46)));
        }

        LinearLayout center = new LinearLayout(a);
        center.setOrientation(LinearLayout.VERTICAL);
        center.setGravity(Gravity.CENTER);

        if (eyebrow != null && !eyebrow.isEmpty()) {
            TextView over = overline(a, eyebrow);
            over.setGravity(Gravity.CENTER);
            center.addView(over);
        }

        TextView heading = text(a, title, 18, INK, Typeface.BOLD);
        heading.setGravity(Gravity.CENTER);
        heading.setLetterSpacing(0.01f);
        center.addView(heading);

        bar.addView(center, new LinearLayout.LayoutParams(0, dp(a, 52), 1f));

        if (right != null) {
            bar.addView(right, new LinearLayout.LayoutParams(dp(a, 46), dp(a, 46)));
        } else {
            View spacer = new View(a);
            bar.addView(spacer, new LinearLayout.LayoutParams(dp(a, 46), dp(a, 46)));
        }

        return bar;
    }

    static FrameLayout.LayoutParams match() {
        return new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
        );
    }

    static LinearLayout.LayoutParams wrap() {
        return new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
    }

    static View divider(Activity a) {
        View line = new View(a);
        line.setBackgroundColor(LINE);
        line.setLayoutParams(new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(a, 1)
        ));
        return line;
    }

    static void press(View view) {
        view.setOnTouchListener((v, event) -> {
            if (event.getActionMasked() == MotionEvent.ACTION_DOWN) {
                v.animate().scaleX(0.985f).scaleY(0.985f).alpha(0.86f).setDuration(70).start();
            } else if (event.getActionMasked() == MotionEvent.ACTION_UP
                    || event.getActionMasked() == MotionEvent.ACTION_CANCEL) {
                v.animate().scaleX(1f).scaleY(1f).alpha(1f).setDuration(110).start();
            }
            return false;
        });
    }
}
