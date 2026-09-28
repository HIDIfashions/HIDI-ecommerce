package com.thehidi.app;

import android.app.Activity;
import android.graphics.Typeface;
import android.text.Editable;
import android.text.TextWatcher;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

final class HidiSearchView extends ScrollView {
    interface Navigator {
        void openBag();
        void openProduct(HidiCatalog.Product product);
        void openShop(String filter);
    }

    private final Activity activity;
    private final Navigator navigator;
    private final RemoteImageLoader images;
    private final HidiCatalog catalog;
    private final HidiAppStore store;
    private final LinearLayout root;
    private final LinearLayout results;
    private final TextView resultLabel;
    private final EditText query;
    private List<HidiCatalog.Product> all = new ArrayList<>();

    HidiSearchView(
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
        root.addView(HidiUi.topBar(activity, "Search", "FIND YOUR HIDI", null, bag));

        LinearLayout fieldWrap = new LinearLayout(activity);
        fieldWrap.setGravity(Gravity.CENTER_VERTICAL);
        fieldWrap.setPadding(HidiUi.dp(activity, 16), 0, HidiUi.dp(activity, 8), 0);
        fieldWrap.setBackground(HidiUi.bordered(HidiUi.SURFACE, 22, HidiUi.LINE, activity));

        ImageButton icon = HidiUi.iconButton(activity, R.drawable.ic_search, "Search");
        icon.setBackgroundColor(android.graphics.Color.TRANSPARENT);
        icon.setEnabled(false);
        fieldWrap.addView(icon, new LinearLayout.LayoutParams(HidiUi.dp(activity, 42), HidiUi.dp(activity, 52)));

        query = new EditText(activity);
        query.setHint("Search styles, colour or mood");
        query.setTextSize(14);
        query.setTextColor(HidiUi.INK);
        query.setHintTextColor(HidiUi.MUTED);
        query.setSingleLine(true);
        query.setImeOptions(EditorInfo.IME_ACTION_SEARCH);
        query.setBackgroundColor(android.graphics.Color.TRANSPARENT);
        query.setPadding(HidiUi.dp(activity, 6), 0, HidiUi.dp(activity, 10), 0);
        fieldWrap.addView(query, new LinearLayout.LayoutParams(
                0,
                HidiUi.dp(activity, 58),
                1f
        ));

        LinearLayout.LayoutParams fieldParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                HidiUi.dp(activity, 58)
        );
        fieldParams.setMargins(HidiUi.dp(activity, 18), HidiUi.dp(activity, 12), HidiUi.dp(activity, 18), 0);
        root.addView(fieldWrap, fieldParams);

        TextView discover = HidiUi.overline(activity, "Browse by mood");
        discover.setPadding(HidiUi.dp(activity, 22), HidiUi.dp(activity, 24), HidiUi.dp(activity, 22), HidiUi.dp(activity, 10));
        root.addView(discover);

        LinearLayout quicks = new LinearLayout(activity);
        quicks.setOrientation(LinearLayout.HORIZONTAL);
        quicks.setPadding(HidiUi.dp(activity, 18), 0, HidiUi.dp(activity, 18), 0);
        addQuick(quicks, "Work", "work-edit");
        addQuick(quicks, "Everyday", "everyday");
        addQuick(quicks, "Occasion", "occasion");
        root.addView(quicks);

        resultLabel = HidiUi.text(activity, "Start typing to discover", 12, HidiUi.MUTED, Typeface.NORMAL);
        resultLabel.setPadding(HidiUi.dp(activity, 22), HidiUi.dp(activity, 28), HidiUi.dp(activity, 22), HidiUi.dp(activity, 12));
        root.addView(resultLabel);

        results = new LinearLayout(activity);
        results.setOrientation(LinearLayout.VERTICAL);
        results.setPadding(HidiUi.dp(activity, 18), 0, HidiUi.dp(activity, 18), 0);
        root.addView(results);

        query.addTextChangedListener(new TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int start, int count, int after) {}
            @Override public void onTextChanged(CharSequence s, int start, int before, int count) { render(s.toString()); }
            @Override public void afterTextChanged(Editable s) {}
        });

        catalog.products(products -> {
            all = products;
            if (query.getText().length() > 0) render(query.getText().toString());
        });
    }

    private void addQuick(LinearLayout parent, String label, String filter) {
        TextView chip = HidiUi.chip(activity, label, false);
        LinearLayout.LayoutParams params = HidiUi.wrap();
        params.setMargins(0, 0, HidiUi.dp(activity, 9), 0);
        chip.setLayoutParams(params);
        chip.setOnClickListener(v -> navigator.openShop(filter));
        parent.addView(chip);
    }

    private void render(String raw) {
        String value = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        results.removeAllViews();

        if (value.length() < 2) {
            resultLabel.setText("Start typing to discover");
            return;
        }

        List<HidiCatalog.Product> matched = new ArrayList<>();
        for (HidiCatalog.Product product : all) {
            String haystack = (product.name + " " + product.category + " "
                    + android.text.TextUtils.join(" ", product.collections) + " "
                    + product.description).toLowerCase(Locale.ROOT);
            if (haystack.contains(value)) matched.add(product);
        }

        resultLabel.setText(matched.size() + (matched.size() == 1 ? " match" : " matches"));

        if (matched.isEmpty()) {
            TextView empty = HidiUi.serif(activity, "Nothing obvious yet.\nTry a simpler word.", 22, HidiUi.INK);
            empty.setGravity(Gravity.CENTER);
            empty.setPadding(0, HidiUi.dp(activity, 48), 0, HidiUi.dp(activity, 48));
            results.addView(empty);
            return;
        }

        int widthDp = Math.round(activity.getResources().getDisplayMetrics().widthPixels
                / activity.getResources().getDisplayMetrics().density);
        int cardWidth = Math.max(148, (widthDp - 48) / 2);

        for (int i = 0; i < matched.size(); i += 2) {
            LinearLayout row = new LinearLayout(activity);
            row.setOrientation(LinearLayout.HORIZONTAL);

            View left = productCard(matched.get(i), cardWidth);
            LinearLayout.LayoutParams lp = (LinearLayout.LayoutParams) left.getLayoutParams();
            lp.setMargins(0, 0, HidiUi.dp(activity, 12), HidiUi.dp(activity, 18));
            left.setLayoutParams(lp);
            row.addView(left);

            if (i + 1 < matched.size()) {
                View right = productCard(matched.get(i + 1), cardWidth);
                LinearLayout.LayoutParams rp = (LinearLayout.LayoutParams) right.getLayoutParams();
                rp.setMargins(0, 0, 0, HidiUi.dp(activity, 18));
                right.setLayoutParams(rp);
                row.addView(right);
            }

            results.addView(row);
        }
    }

    private View productCard(HidiCatalog.Product product, int width) {
        return HidiProductCard.create(
                activity,
                product,
                images,
                store,
                new HidiProductCard.Listener() {
                    @Override public void open(HidiCatalog.Product selected) { navigator.openProduct(selected); }
                    @Override public void savedChanged() {}
                },
                width
        );
    }
}
