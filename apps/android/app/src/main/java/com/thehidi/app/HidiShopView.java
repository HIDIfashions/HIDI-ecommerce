package com.thehidi.app;

import android.app.Activity;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.HorizontalScrollView;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

final class HidiShopView extends ScrollView {
    interface Navigator {
        void openSearch();
        void openBag();
        void openProduct(HidiCatalog.Product product);
    }

    private final Activity activity;
    private final Navigator navigator;
    private final RemoteImageLoader images;
    private final HidiCatalog catalog;
    private final HidiAppStore store;
    private final LinearLayout root;
    private final LinearLayout grid;
    private final LinearLayout filters;
    private List<HidiCatalog.Product> all = new ArrayList<>();
    private String activeFilter;

    HidiShopView(
            Activity activity,
            String initialFilter,
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
        this.activeFilter = normalize(initialFilter);

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

        addTop();
        addIntro();

        filters = new LinearLayout(activity);
        filters.setOrientation(LinearLayout.HORIZONTAL);
        filters.setPadding(HidiUi.dp(activity, 18), 0, HidiUi.dp(activity, 18), 0);
        HorizontalScrollView filterScroll = new HorizontalScrollView(activity);
        filterScroll.setHorizontalScrollBarEnabled(false);
        filterScroll.setOverScrollMode(OVER_SCROLL_NEVER);
        filterScroll.addView(filters);
        root.addView(filterScroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                HidiUi.dp(activity, 54)
        ));
        renderFilters();

        TextView count = HidiUi.text(activity, "Curating your edit…", 11, HidiUi.MUTED, Typeface.NORMAL);
        count.setTag("count");
        count.setPadding(HidiUi.dp(activity, 22), HidiUi.dp(activity, 18), HidiUi.dp(activity, 22), HidiUi.dp(activity, 12));
        root.addView(count);

        grid = new LinearLayout(activity);
        grid.setOrientation(LinearLayout.VERTICAL);
        grid.setPadding(HidiUi.dp(activity, 18), 0, HidiUi.dp(activity, 18), 0);
        root.addView(grid);

        catalog.products(products -> {
            all = products;
            renderGrid();
        });
    }

    private void addTop() {
        ImageButton search = HidiUi.iconButton(activity, R.drawable.ic_search, "Search");
        search.setOnClickListener(v -> navigator.openSearch());
        ImageButton bag = HidiUi.iconButton(activity, R.drawable.ic_bag, "Bag");
        bag.setOnClickListener(v -> navigator.openBag());
        root.addView(HidiUi.topBar(activity, "Shop", "HIDI APP", search, bag));
    }

    private void addIntro() {
        LinearLayout block = new LinearLayout(activity);
        block.setOrientation(LinearLayout.VERTICAL);
        block.setPadding(HidiUi.dp(activity, 22), HidiUi.dp(activity, 14), HidiUi.dp(activity, 22), HidiUi.dp(activity, 20));

        TextView title = HidiUi.serif(activity, "Find the piece\nthat fits the day.", 30, HidiUi.INK);
        title.setLineSpacing(0f, 0.96f);
        block.addView(title);

        TextView sub = HidiUi.text(
                activity,
                "A focused edit, not an endless catalogue.",
                12,
                HidiUi.MUTED,
                Typeface.NORMAL
        );
        sub.setPadding(0, HidiUi.dp(activity, 8), 0, 0);
        block.addView(sub);

        root.addView(block);
    }

    private void renderFilters() {
        filters.removeAllViews();
        addFilter("All", "all");
        addFilter("New", "new-arrivals");
        addFilter("Work", "work-edit");
        addFilter("Everyday", "everyday");
        addFilter("Occasion", "occasion");
    }

    private void addFilter(String label, String key) {
        boolean active = activeFilter.equals(key);
        TextView chip = HidiUi.chip(activity, label, active);
        LinearLayout.LayoutParams params = HidiUi.wrap();
        params.setMargins(0, 0, HidiUi.dp(activity, 9), 0);
        chip.setLayoutParams(params);
        chip.setOnClickListener(v -> {
            activeFilter = key;
            renderFilters();
            renderGrid();
            smoothScrollTo(0, 0);
        });
        filters.addView(chip);
    }

    private void renderGrid() {
        grid.removeAllViews();
        List<HidiCatalog.Product> products = filtered();

        View countView = root.findViewWithTag("count");
        if (countView instanceof TextView) {
            ((TextView) countView).setText(products.size() + (products.size() == 1 ? " style" : " styles"));
        }

        if (products.isEmpty()) {
            TextView empty = HidiUi.text(activity, "No pieces in this edit yet.", 14, HidiUi.MUTED, Typeface.NORMAL);
            empty.setGravity(Gravity.CENTER);
            empty.setPadding(0, HidiUi.dp(activity, 50), 0, HidiUi.dp(activity, 50));
            grid.addView(empty);
            return;
        }

        int widthDp = Math.round(activity.getResources().getDisplayMetrics().widthPixels
                / activity.getResources().getDisplayMetrics().density);
        int cardWidth = Math.max(148, (widthDp - 48) / 2);

        for (int i = 0; i < products.size(); i += 2) {
            LinearLayout row = new LinearLayout(activity);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.TOP);

            HidiCatalog.Product left = products.get(i);
            View leftCard = card(left, cardWidth);
            LinearLayout.LayoutParams leftParams = (LinearLayout.LayoutParams) leftCard.getLayoutParams();
            leftParams.setMargins(0, 0, HidiUi.dp(activity, 12), HidiUi.dp(activity, 18));
            leftCard.setLayoutParams(leftParams);
            row.addView(leftCard);

            if (i + 1 < products.size()) {
                View rightCard = card(products.get(i + 1), cardWidth);
                LinearLayout.LayoutParams rightParams = (LinearLayout.LayoutParams) rightCard.getLayoutParams();
                rightParams.setMargins(0, 0, 0, HidiUi.dp(activity, 18));
                rightCard.setLayoutParams(rightParams);
                row.addView(rightCard);
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
                    @Override
                    public void open(HidiCatalog.Product selected) {
                        navigator.openProduct(selected);
                    }

                    @Override
                    public void savedChanged() {
                        // Keep the current grid stable; the card updates its heart immediately.
                    }
                },
                width
        );
    }

    private List<HidiCatalog.Product> filtered() {
        if (activeFilter.equals("all")) return all;

        List<HidiCatalog.Product> result = new ArrayList<>();
        for (HidiCatalog.Product product : all) {
            if (product.collections.contains(activeFilter)
                    || product.category.equals(activeFilter)
                    || (activeFilter.equals("new-arrivals") && product.inStock)) {
                result.add(product);
            }
        }
        return result;
    }

    private String normalize(String value) {
        if (value == null || value.trim().isEmpty()) return "all";
        return value.trim().toLowerCase(java.util.Locale.ROOT);
    }
}
