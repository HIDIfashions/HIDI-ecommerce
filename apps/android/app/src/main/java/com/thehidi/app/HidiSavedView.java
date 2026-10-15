package com.thehidi.app;

import android.app.Activity;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;
import java.util.Set;

final class HidiSavedView extends ScrollView {
    interface Navigator {
        void openBag();
        void openShop();
        void openProduct(HidiCatalog.Product product);
    }

    private final Activity activity;
    private final Navigator navigator;
    private final RemoteImageLoader images;
    private final HidiCatalog catalog;
    private final HidiAppStore store;
    private final LinearLayout root;
    private final LinearLayout grid;
    private List<HidiCatalog.Product> all = new ArrayList<>();

    HidiSavedView(
            Activity activity,
            Navigator navigator,
            RemoteImageLoader images,
            HidiCatalog catalog,
            HidiAppStore store
    ) {
        super(activity);
        this.activity = activity;
        this.navigator = navigator;
        this.images = images;
        this.catalog = catalog;
        this.store = store;

        setFillViewport(true);
        setBackgroundColor(HidiUi.CANVAS);
        setVerticalScrollBarEnabled(false);
        setOverScrollMode(OVER_SCROLL_NEVER);

        root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(0, 0, 0, HidiUi.dp(activity, 24));
        addView(root, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        ImageButton bag = HidiUi.iconButton(activity, R.drawable.ic_bag, "Bag");
        bag.setOnClickListener(v -> navigator.openBag());
        root.addView(HidiUi.topBar(activity, "Saved", "YOUR EDIT", null, bag));

        LinearLayout intro = new LinearLayout(activity);
        intro.setOrientation(LinearLayout.VERTICAL);
        intro.setPadding(HidiUi.dp(activity, 22), HidiUi.dp(activity, 16), HidiUi.dp(activity, 22), HidiUi.dp(activity, 20));

        TextView title = HidiUi.serif(activity, "Keep only what\nyou really love.", 30, HidiUi.INK);
        intro.addView(title);
        TextView subtitle = HidiUi.text(activity, "Your private shortlist, always one tap away.", 12, HidiUi.MUTED, Typeface.NORMAL);
        subtitle.setPadding(0, HidiUi.dp(activity, 8), 0, 0);
        intro.addView(subtitle);
        root.addView(intro);

        grid = new LinearLayout(activity);
        grid.setOrientation(LinearLayout.VERTICAL);
        grid.setPadding(HidiUi.dp(activity, 18), 0, HidiUi.dp(activity, 18), 0);
        root.addView(grid);

        catalog.products(products -> {
            all = products;
            render();
        });
    }

    private void render() {
        grid.removeAllViews();
        Set<String> saved = store.saved();

        List<HidiCatalog.Product> selected = new ArrayList<>();
        for (HidiCatalog.Product product : all) {
            if (saved.contains(product.slug)) selected.add(product);
        }

        if (selected.isEmpty()) {
            LinearLayout empty = new LinearLayout(activity);
            empty.setOrientation(LinearLayout.VERTICAL);
            empty.setGravity(Gravity.CENTER);
            empty.setPadding(HidiUi.dp(activity, 24), HidiUi.dp(activity, 48), HidiUi.dp(activity, 24), HidiUi.dp(activity, 48));
            empty.setBackground(HidiUi.bordered(HidiUi.SURFACE, 26, HidiUi.LINE, activity));

            TextView heart = HidiUi.text(activity, "♡", 34, HidiUi.WINE, Typeface.NORMAL);
            heart.setGravity(Gravity.CENTER);
            empty.addView(heart);

            TextView title = HidiUi.serif(activity, "Nothing saved yet.", 23, HidiUi.INK);
            title.setGravity(Gravity.CENTER);
            title.setPadding(0, HidiUi.dp(activity, 12), 0, HidiUi.dp(activity, 8));
            empty.addView(title);

            TextView copy = HidiUi.text(activity, "Tap the heart on any piece to build your own HIDI edit.", 12, HidiUi.MUTED, Typeface.NORMAL);
            copy.setGravity(Gravity.CENTER);
            copy.setMaxWidth(HidiUi.dp(activity, 260));
            empty.addView(copy);

            TextView cta = HidiUi.chip(activity, "Browse the collection", true);
            LinearLayout.LayoutParams ctaParams = HidiUi.wrap();
            ctaParams.topMargin = HidiUi.dp(activity, 20);
            empty.addView(cta, ctaParams);
            cta.setOnClickListener(v -> navigator.openShop());

            grid.addView(empty);
            return;
        }

        int widthDp = Math.round(activity.getResources().getDisplayMetrics().widthPixels
                / activity.getResources().getDisplayMetrics().density);
        int cardWidth = Math.max(148, (widthDp - 48) / 2);

        for (int i = 0; i < selected.size(); i += 2) {
            LinearLayout row = new LinearLayout(activity);
            row.setOrientation(LinearLayout.HORIZONTAL);

            View left = card(selected.get(i), cardWidth);
            LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) left.getLayoutParams();
            lp.setMargins(0, 0, HidiUi.dp(activity, 12), HidiUi.dp(activity, 18));
            left.setLayoutParams(lp);
            row.addView(left);

            if (i + 1 < selected.size()) {
                View right = card(selected.get(i + 1), cardWidth);
                LinearLayout.LayoutParams rp = (LinearLayout.LayoutParams) right.getLayoutParams();
                rp.setMargins(0, 0, 0, HidiUi.dp(activity, 18));
                right.setLayoutParams(rp);
                row.addView(right);
            }

            grid.addView(row);
        }
    }

    private View card(HidiCatalog.Product product, int width) {
        return HidiProductCard.create(
                activity,
                product,
                images,
                store,
                new HidiProductCard.Listener() {
                    @Override public void open(HidiCatalog.Product selected) { navigator.openProduct(selected); }
                    @Override public void savedChanged() { render(); }
                },
                width
        );
    }
}
