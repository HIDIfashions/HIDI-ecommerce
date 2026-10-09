package com.thehidi.app;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.Space;
import android.widget.TextView;

import java.util.List;

final class HidiHomeView extends ScrollView {
    interface Navigator {
        void openShop(String collection);
        void openSearch();
        void openBag();
        void openProduct(HidiCatalog.Product product);
        void openSaved();
    }

    private final Activity activity;
    private final Navigator navigator;
    private final RemoteImageLoader images;
    private final HidiCatalog catalog;
    private final HidiAppStore store;
    private final LinearLayout root;
    private final LinearLayout newRow;

    HidiHomeView(
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
        setClipToPadding(false);
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

        addAppBar();
        addGreeting();
        addForYouCard();
        addQuickEdits();
        addNewHeader();

        newRow = new LinearLayout(activity);
        newRow.setOrientation(LinearLayout.HORIZONTAL);
        newRow.setPadding(HidiUi.dp(activity, 18), 0, HidiUi.dp(activity, 18), 0);

        HorizontalScrollView newScroll = new HorizontalScrollView(activity);
        newScroll.setHorizontalScrollBarEnabled(false);
        newScroll.setClipToPadding(false);
        newScroll.setOverScrollMode(OVER_SCROLL_NEVER);
        newScroll.addView(newRow);
        root.addView(newScroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                HidiUi.dp(activity, 344)
        ));

        addAnanyaCard();
        addPrivateClientCard();
        addPromiseCard();

        catalog.featured(this::renderProducts);

        setAlpha(0f);
        setTranslationY(HidiUi.dp(activity, 8));
        animate().alpha(1f).translationY(0f).setDuration(240L).start();
    }

    private void addAppBar() {
        LinearLayout bar = new LinearLayout(activity);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(HidiUi.dp(activity, 18), HidiUi.dp(activity, 10), HidiUi.dp(activity, 18), HidiUi.dp(activity, 4));

        ImageButton search = HidiUi.iconButton(activity, R.drawable.ic_search, "Search");
        search.setOnClickListener(v -> navigator.openSearch());
        bar.addView(search, new LinearLayout.LayoutParams(HidiUi.dp(activity, 46), HidiUi.dp(activity, 46)));

        TextView mark = HidiUi.text(activity, "HIDI", 22, HidiUi.INK, Typeface.BOLD);
        mark.setGravity(Gravity.CENTER);
        mark.setLetterSpacing(0.18f);
        bar.addView(mark, new LinearLayout.LayoutParams(0, HidiUi.dp(activity, 52), 1f));

        ImageButton bag = HidiUi.iconButton(activity, R.drawable.ic_bag, "Bag");
        bag.setOnClickListener(v -> navigator.openBag());
        bar.addView(bag, new LinearLayout.LayoutParams(HidiUi.dp(activity, 46), HidiUi.dp(activity, 46)));

        root.addView(bar);
    }

    private void addGreeting() {
        LinearLayout block = new LinearLayout(activity);
        block.setOrientation(LinearLayout.VERTICAL);
        block.setPadding(HidiUi.dp(activity, 22), HidiUi.dp(activity, 18), HidiUi.dp(activity, 22), HidiUi.dp(activity, 18));

        TextView overline = HidiUi.overline(activity, "For you");
        block.addView(overline);

        TextView title = HidiUi.serif(activity, "A quieter way to find\nyour next favourite.", 31, HidiUi.INK);
        title.setLineSpacing(0f, 0.96f);
        title.setPadding(0, HidiUi.dp(activity, 7), 0, 0);
        block.addView(title);

        root.addView(block);
    }

    private void addForYouCard() {
        FrameLayout card = new FrameLayout(activity);
        card.setBackground(HidiUi.rounded(HidiUi.SAGE, 28, activity));
        card.setClipToOutline(true);
        card.setElevation(HidiUi.dp(activity, 2));

        ImageView image = new ImageView(activity);
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        images.load(image, "/brand/hidi-hero-green-garden-fullbody.webp", HidiUi.SAGE);
        card.addView(image, HidiUi.match());

        View wash = new View(activity);
        wash.setBackground(new GradientDrawable(
                GradientDrawable.Orientation.BOTTOM_TOP,
                new int[]{0xB51E1717, 0x201E1717, 0x001E1717}
        ));
        card.addView(wash, HidiUi.match());

        LinearLayout copy = new LinearLayout(activity);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.setPadding(HidiUi.dp(activity, 20), HidiUi.dp(activity, 20), HidiUi.dp(activity, 20), HidiUi.dp(activity, 20));

        TextView label = HidiUi.text(activity, "EDITOR'S NOTE", 9, Color.WHITE, Typeface.BOLD);
        label.setLetterSpacing(0.12f);
        copy.addView(label);

        TextView title = HidiUi.serif(activity, "Easy pieces.\nStrong presence.", 30, Color.WHITE);
        title.setPadding(0, HidiUi.dp(activity, 7), 0, HidiUi.dp(activity, 13));
        copy.addView(title);

        TextView action = HidiUi.text(activity, "Discover new arrivals  →", 12, Color.WHITE, Typeface.BOLD);
        copy.addView(action);

        FrameLayout.LayoutParams copyParams = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM
        );
        card.addView(copy, copyParams);
        card.setOnClickListener(v -> navigator.openShop("new-arrivals"));
        HidiUi.press(card);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                HidiUi.dp(activity, 420)
        );
        params.setMargins(HidiUi.dp(activity, 18), 0, HidiUi.dp(activity, 18), 0);
        root.addView(card, params);
    }

    private void addQuickEdits() {
        TextView title = HidiUi.text(activity, "Choose your pace", 16, HidiUi.INK, Typeface.BOLD);
        title.setPadding(HidiUi.dp(activity, 22), HidiUi.dp(activity, 28), HidiUi.dp(activity, 22), HidiUi.dp(activity, 12));
        root.addView(title);

        HorizontalScrollView scroll = new HorizontalScrollView(activity);
        scroll.setHorizontalScrollBarEnabled(false);
        scroll.setOverScrollMode(OVER_SCROLL_NEVER);

        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setPadding(HidiUi.dp(activity, 18), 0, HidiUi.dp(activity, 18), 0);

        row.addView(editChip("New", "new-arrivals"));
        row.addView(editChip("Work", "work-edit"));
        row.addView(editChip("Everyday", "everyday"));
        row.addView(editChip("Occasion", "occasion"));
        row.addView(editChip("All styles", "all"));

        scroll.addView(row);
        root.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                HidiUi.dp(activity, 54)
        ));
    }

    private View editChip(String label, String collection) {
        TextView chip = HidiUi.chip(activity, label, false);
        LinearLayout.LayoutParams params = HidiUi.wrap();
        params.setMargins(0, 0, HidiUi.dp(activity, 9), 0);
        chip.setLayoutParams(params);
        chip.setOnClickListener(v -> navigator.openShop(collection));
        return chip;
    }

    private void addNewHeader() {
        LinearLayout bar = new LinearLayout(activity);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(HidiUi.dp(activity, 22), HidiUi.dp(activity, 30), HidiUi.dp(activity, 18), HidiUi.dp(activity, 12));

        LinearLayout copy = new LinearLayout(activity);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.addView(HidiUi.overline(activity, "Just in"));
        TextView title = HidiUi.text(activity, "Freshly arrived", 20, HidiUi.INK, Typeface.BOLD);
        title.setPadding(0, HidiUi.dp(activity, 3), 0, 0);
        copy.addView(title);

        bar.addView(copy, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView all = HidiUi.text(activity, "See all", 11, HidiUi.WINE, Typeface.BOLD);
        all.setPadding(HidiUi.dp(activity, 10), HidiUi.dp(activity, 10), 0, HidiUi.dp(activity, 10));
        all.setOnClickListener(v -> navigator.openShop("all"));
        bar.addView(all);

        root.addView(bar);
    }

    private void renderProducts(List<HidiCatalog.Product> products) {
        newRow.removeAllViews();
        int count = Math.min(products.size(), 6);
        for (int i = 0; i < count; i++) {
            HidiCatalog.Product product = products.get(i);
            View card = HidiProductCard.create(
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
                            // Home does not need to rebuild when a heart changes.
                        }
                    },
                    178
            );
            LinearLayout.LayoutParams params = (LinearLayout.LayoutParams) card.getLayoutParams();
            params.setMargins(0, 0, HidiUi.dp(activity, 12), 0);
            card.setLayoutParams(params);
            newRow.addView(card);
        }
    }

    private void addAnanyaCard() {
        LinearLayout section = new LinearLayout(activity);
        section.setOrientation(LinearLayout.VERTICAL);
        section.setPadding(HidiUi.dp(activity, 18), HidiUi.dp(activity, 26), HidiUi.dp(activity, 18), 0);

        FrameLayout card = new FrameLayout(activity);
        card.setBackground(HidiUi.rounded(HidiUi.SURFACE, 26, activity));
        card.setClipToOutline(true);
        card.setElevation(HidiUi.dp(activity, 1));

        ImageView image = new ImageView(activity);
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        images.load(image, "/brand/hidi-manifesto-ananya.webp", HidiUi.SURFACE_MUTED);
        card.addView(image, HidiUi.match());

        LinearLayout badge = new LinearLayout(activity);
        badge.setOrientation(LinearLayout.VERTICAL);
        badge.setPadding(HidiUi.dp(activity, 14), HidiUi.dp(activity, 12), HidiUi.dp(activity, 14), HidiUi.dp(activity, 12));
        badge.setBackground(HidiUi.rounded(0xF4FFFDFB, 18, activity));

        badge.addView(HidiUi.overline(activity, "Ananya's selection"));
        TextView copy = HidiUi.text(activity, "Pieces with presence,\nwithout the performance.", 15, HidiUi.INK, Typeface.BOLD);
        copy.setPadding(0, HidiUi.dp(activity, 4), 0, 0);
        badge.addView(copy);

        FrameLayout.LayoutParams badgeParams = new FrameLayout.LayoutParams(
                HidiUi.dp(activity, 238),
                ViewGroup.LayoutParams.WRAP_CONTENT,
                Gravity.BOTTOM | Gravity.START
        );
        badgeParams.setMargins(HidiUi.dp(activity, 14), 0, 0, HidiUi.dp(activity, 14));
        card.addView(badge, badgeParams);

        card.setOnClickListener(v -> navigator.openShop("occasion"));
        HidiUi.press(card);
        section.addView(card, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                HidiUi.dp(activity, 290)
        ));

        root.addView(section);
    }

    private void addPrivateClientCard() {
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(HidiUi.dp(activity, 20), HidiUi.dp(activity, 20), HidiUi.dp(activity, 20), HidiUi.dp(activity, 20));
        card.setBackground(HidiUi.rounded(HidiUi.WINE, 24, activity));

        TextView over = HidiUi.text(activity, "HIDI PRIVÉ", 9, HidiUi.GOLD, Typeface.BOLD);
        over.setLetterSpacing(0.13f);
        card.addView(over);

        TextView title = HidiUi.serif(activity, "Saved pieces. Rewards.\nA more personal HIDI.", 24, Color.WHITE);
        title.setPadding(0, HidiUi.dp(activity, 7), 0, HidiUi.dp(activity, 12));
        card.addView(title);

        TextView link = HidiUi.text(activity, "View your saved edit  →", 11, Color.WHITE, Typeface.BOLD);
        card.addView(link);

        card.setOnClickListener(v -> navigator.openSaved());
        HidiUi.press(card);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(HidiUi.dp(activity, 18), HidiUi.dp(activity, 20), HidiUi.dp(activity, 18), 0);
        root.addView(card, params);
    }

    private void addPromiseCard() {
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(HidiUi.dp(activity, 20), HidiUi.dp(activity, 18), HidiUi.dp(activity, 20), HidiUi.dp(activity, 18));
        card.setBackground(HidiUi.bordered(HidiUi.SURFACE, 22, HidiUi.LINE, activity));

        card.addView(promise("Complimentary shipping", "₹1,499+"));
        card.addView(HidiUi.divider(activity));
        card.addView(promise("Easy exchange", "Within 7 days"));
        card.addView(HidiUi.divider(activity));
        card.addView(promise("Secure checkout", "UPI · Cards · Net banking"));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(HidiUi.dp(activity, 18), HidiUi.dp(activity, 14), HidiUi.dp(activity, 18), 0);
        root.addView(card, params);

        Space end = new Space(activity);
        root.addView(end, new LinearLayout.LayoutParams(1, HidiUi.dp(activity, 20)));
    }

    private View promise(String title, String detail) {
        LinearLayout row = new LinearLayout(activity);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, HidiUi.dp(activity, 12), 0, HidiUi.dp(activity, 12));

        TextView a = HidiUi.text(activity, title, 12, HidiUi.INK, Typeface.BOLD);
        row.addView(a, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView b = HidiUi.text(activity, detail, 11, HidiUi.MUTED, Typeface.NORMAL);
        row.addView(b);

        return row;
    }
}
