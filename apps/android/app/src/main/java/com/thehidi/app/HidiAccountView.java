package com.thehidi.app;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

final class HidiAccountView extends ScrollView {
    interface Navigator {
        void openBag();
        void openCommerce(String path);
    }

    private final Activity activity;
    private final Navigator navigator;
    private final LinearLayout root;

    HidiAccountView(Activity activity, Navigator navigator) {
        super(activity);
        this.activity = activity;
        this.navigator = navigator;

        setFillViewport(true);
        setBackgroundColor(HidiUi.CANVAS);
        setVerticalScrollBarEnabled(false);
        setOverScrollMode(OVER_SCROLL_NEVER);

        root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(0, 0, 0, HidiUi.dp(activity, 26));
        addView(root, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        ImageButton bag = HidiUi.iconButton(activity, R.drawable.ic_bag, "Bag");
        bag.setOnClickListener(v -> navigator.openBag());
        root.addView(HidiUi.topBar(activity, "You", "YOUR HIDI", null, bag));

        addIdentityCard();
        addSection("Your shopping", new Row[]{
                new Row("Orders", "Track, review and revisit your purchases", "/account"),
                new Row("Returns & exchanges", "Manage eligible requests", "/account"),
                new Row("Saved addresses", "Keep checkout fast", "/account")
        });
        addSection("HIDI benefits", new Row[]{
                new Row("Wallet & refunds", "View HIDI wallet activity", "/account"),
                new Row("Rewards", "See earned and upcoming rewards", "/account"),
                new Row("Preferences", "Tune your HIDI experience", "/account")
        });
        addSection("Help", new Row[]{
                new Row("Shipping & delivery", "How HIDI gets to you", "/shipping"),
                new Row("About HIDI", "Our point of view", "/about")
        });
    }

    private void addIdentityCard() {
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(HidiUi.dp(activity, 22), HidiUi.dp(activity, 22), HidiUi.dp(activity, 22), HidiUi.dp(activity, 22));
        card.setBackground(HidiUi.rounded(HidiUi.WINE, 28, activity));

        TextView small = HidiUi.text(activity, "PRIVATE CLIENT", 9, HidiUi.GOLD, Typeface.BOLD);
        small.setLetterSpacing(0.13f);
        card.addView(small);

        TextView title = HidiUi.serif(activity, "Your HIDI,\nin one quiet place.", 27, Color.WHITE);
        title.setPadding(0, HidiUi.dp(activity, 8), 0, HidiUi.dp(activity, 10));
        card.addView(title);

        TextView copy = HidiUi.text(activity, "Sign in for orders, wallet, rewards and returns.", 12, 0xFFE8DCDD, Typeface.NORMAL);
        card.addView(copy);

        TextView signIn = HidiUi.text(activity, "SIGN IN / CONTINUE  →", 10, Color.WHITE, Typeface.BOLD);
        signIn.setLetterSpacing(0.08f);
        signIn.setPadding(0, HidiUi.dp(activity, 18), 0, 0);
        signIn.setOnClickListener(v -> navigator.openCommerce("/account"));
        card.addView(signIn);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(HidiUi.dp(activity, 18), HidiUi.dp(activity, 16), HidiUi.dp(activity, 18), HidiUi.dp(activity, 26));
        root.addView(card, params);
    }

    private void addSection(String title, Row[] rows) {
        TextView label = HidiUi.overline(activity, title);
        label.setPadding(HidiUi.dp(activity, 22), HidiUi.dp(activity, 18), HidiUi.dp(activity, 22), HidiUi.dp(activity, 10));
        root.addView(label);

        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(HidiUi.bordered(HidiUi.SURFACE, 24, HidiUi.LINE, activity));

        for (int i = 0; i < rows.length; i++) {
            Row item = rows[i];
            card.addView(row(item));
            if (i < rows.length - 1) card.addView(HidiUi.divider(activity));
        }

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(HidiUi.dp(activity, 18), 0, HidiUi.dp(activity, 18), HidiUi.dp(activity, 10));
        root.addView(card, params);
    }

    private View row(Row item) {
        LinearLayout row = new LinearLayout(activity);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(HidiUi.dp(activity, 18), HidiUi.dp(activity, 16), HidiUi.dp(activity, 16), HidiUi.dp(activity, 16));

        LinearLayout copy = new LinearLayout(activity);
        copy.setOrientation(LinearLayout.VERTICAL);

        TextView title = HidiUi.text(activity, item.title, 13, HidiUi.INK, Typeface.BOLD);
        copy.addView(title);

        TextView detail = HidiUi.text(activity, item.detail, 11, HidiUi.MUTED, Typeface.NORMAL);
        detail.setPadding(0, HidiUi.dp(activity, 4), 0, 0);
        copy.addView(detail);

        row.addView(copy, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView arrow = HidiUi.text(activity, "›", 24, HidiUi.MUTED, Typeface.NORMAL);
        row.addView(arrow);

        row.setOnClickListener(v -> navigator.openCommerce(item.path));
        HidiUi.press(row);
        return row;
    }

    private static final class Row {
        final String title;
        final String detail;
        final String path;

        Row(String title, String detail, String path) {
            this.title = title;
            this.detail = detail;
            this.path = path;
        }
    }
}
