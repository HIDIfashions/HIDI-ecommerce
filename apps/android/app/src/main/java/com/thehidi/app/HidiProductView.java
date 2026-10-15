package com.thehidi.app;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

final class HidiProductView extends FrameLayout {
    interface Navigator {
        void back();
        void openBag();
        void cartChanged(int itemCount);
    }

    private final Activity activity;
    private final Navigator navigator;
    private final RemoteImageLoader images;
    private final HidiAppStore store;
    private final HidiCartClient cart;
    private final HidiCatalog.Product product;

    private ImageView mainImage;
    private LinearLayout colorRow;
    private LinearLayout sizeRow;
    private TextView price;
    private TextView addButton;
    private ImageButton saveButton;
    private String selectedColor = "";
    private HidiCatalog.Variant selectedVariant;

    HidiProductView(
            Activity activity,
            HidiCatalog.Product product,
            Navigator navigator,
            RemoteImageLoader images,
            HidiAppStore store,
            HidiCartClient cart
    ) {
        super(activity);
        this.activity = activity;
        this.product = product;
        this.navigator = navigator;
        this.images = images;
        this.store = store;
        this.cart = cart;

        setBackgroundColor(HidiUi.CANVAS);

        ScrollView scroll = new ScrollView(activity);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(OVER_SCROLL_NEVER);

        LinearLayout root = new LinearLayout(activity);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setPadding(0, 0, 0, HidiUi.dp(activity, 108));
        scroll.addView(root, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));
        addView(scroll, HidiUi.match());

        ImageButton back = HidiUi.iconButton(activity, R.drawable.ic_back, "Back");
        back.setOnClickListener(v -> navigator.back());
        ImageButton bag = HidiUi.iconButton(activity, R.drawable.ic_bag, "Bag");
        bag.setOnClickListener(v -> navigator.openBag());
        root.addView(HidiUi.topBar(activity, "Details", "HIDI APP", back, bag));

        addGallery(root);
        addIdentity(root);
        addOptions(root);
        addDetails(root);
        addBottomBar();

        if (!product.variants.isEmpty()) {
            selectedColor = product.variants.get(0).color;
            renderColors();
            renderSizes();
        }
    }

    private void addGallery(LinearLayout root) {
        FrameLayout imageFrame = new FrameLayout(activity);
        imageFrame.setBackground(HidiUi.rounded(HidiUi.SURFACE_MUTED, 28, activity));
        imageFrame.setClipToOutline(true);

        mainImage = new ImageView(activity);
        mainImage.setScaleType(ImageView.ScaleType.CENTER_CROP);
        images.load(mainImage, product.primaryImage(), HidiUi.SURFACE_MUTED);
        imageFrame.addView(mainImage, HidiUi.match());

        LinearLayout.LayoutParams imageParams = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                HidiUi.dp(activity, 470)
        );
        imageParams.setMargins(HidiUi.dp(activity, 14), 0, HidiUi.dp(activity, 14), 0);
        root.addView(imageFrame, imageParams);

        if (product.images.size() > 1) {
            HorizontalScrollView thumbsScroll = new HorizontalScrollView(activity);
            thumbsScroll.setHorizontalScrollBarEnabled(false);
            thumbsScroll.setOverScrollMode(OVER_SCROLL_NEVER);

            LinearLayout thumbs = new LinearLayout(activity);
            thumbs.setOrientation(LinearLayout.HORIZONTAL);
            thumbs.setPadding(HidiUi.dp(activity, 18), HidiUi.dp(activity, 10), HidiUi.dp(activity, 18), 0);

            int count = Math.min(product.images.size(), 6);
            for (int i = 0; i < count; i++) {
                String url = product.images.get(i);
                ImageView thumb = new ImageView(activity);
                thumb.setScaleType(ImageView.ScaleType.CENTER_CROP);
                thumb.setBackground(HidiUi.rounded(HidiUi.SURFACE_MUTED, 14, activity));
                thumb.setClipToOutline(true);
                images.load(thumb, url, HidiUi.SURFACE_MUTED);
                thumb.setOnClickListener(v -> images.load(mainImage, url, HidiUi.SURFACE_MUTED));
                HidiUi.press(thumb);

                LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(
                        HidiUi.dp(activity, 62),
                        HidiUi.dp(activity, 76)
                );
                p.setMargins(0, 0, HidiUi.dp(activity, 8), 0);
                thumbs.addView(thumb, p);
            }

            thumbsScroll.addView(thumbs);
            root.addView(thumbsScroll, new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    HidiUi.dp(activity, 94)
            ));
        }
    }

    private void addIdentity(LinearLayout root) {
        LinearLayout block = new LinearLayout(activity);
        block.setOrientation(LinearLayout.VERTICAL);
        block.setPadding(HidiUi.dp(activity, 22), HidiUi.dp(activity, 22), HidiUi.dp(activity, 22), HidiUi.dp(activity, 18));

        block.addView(HidiUi.overline(activity, "HIDI selection"));

        TextView name = HidiUi.serif(activity, product.name, 29, HidiUi.INK);
        name.setPadding(0, HidiUi.dp(activity, 6), 0, HidiUi.dp(activity, 8));
        block.addView(name);

        price = HidiUi.text(activity, HidiProductCard.formatPrice(product.minPricePaise), 15, HidiUi.WINE, Typeface.BOLD);
        block.addView(price);

        if (product.description != null && !product.description.trim().isEmpty()) {
            TextView description = HidiUi.text(activity, product.description.trim(), 13, HidiUi.MUTED, Typeface.NORMAL);
            description.setLineSpacing(HidiUi.dp(activity, 2), 1.05f);
            description.setPadding(0, HidiUi.dp(activity, 14), 0, 0);
            block.addView(description);
        }

        root.addView(block);
    }

    private void addOptions(LinearLayout root) {
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(HidiUi.dp(activity, 18), HidiUi.dp(activity, 18), HidiUi.dp(activity, 18), HidiUi.dp(activity, 18));
        card.setBackground(HidiUi.bordered(HidiUi.SURFACE, 24, HidiUi.LINE, activity));

        TextView colorLabel = HidiUi.text(activity, "Colour", 12, HidiUi.INK, Typeface.BOLD);
        card.addView(colorLabel);

        colorRow = new LinearLayout(activity);
        colorRow.setOrientation(LinearLayout.HORIZONTAL);
        colorRow.setPadding(0, HidiUi.dp(activity, 10), 0, HidiUi.dp(activity, 18));
        card.addView(colorRow);

        LinearLayout sizeHeader = new LinearLayout(activity);
        sizeHeader.setGravity(Gravity.CENTER_VERTICAL);
        TextView sizeLabel = HidiUi.text(activity, "Choose your size", 12, HidiUi.INK, Typeface.BOLD);
        sizeHeader.addView(sizeLabel, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        TextView fit = HidiUi.text(activity, "HIDI Fit", 11, HidiUi.WINE, Typeface.BOLD);
        sizeHeader.addView(fit);
        card.addView(sizeHeader);

        sizeRow = new LinearLayout(activity);
        sizeRow.setOrientation(LinearLayout.HORIZONTAL);
        sizeRow.setPadding(0, HidiUi.dp(activity, 10), 0, 0);
        card.addView(sizeRow);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(HidiUi.dp(activity, 18), 0, HidiUi.dp(activity, 18), HidiUi.dp(activity, 12));
        root.addView(card, params);
    }

    private void renderColors() {
        colorRow.removeAllViews();
        Set<String> colors = new LinkedHashSet<>();
        for (HidiCatalog.Variant variant : product.variants) {
            if (variant.color != null && !variant.color.trim().isEmpty()) colors.add(variant.color);
        }

        if (colors.isEmpty()) {
            TextView one = HidiUi.text(activity, "As shown", 11, HidiUi.MUTED, Typeface.NORMAL);
            colorRow.addView(one);
            return;
        }

        for (String color : colors) {
            boolean active = color.equals(selectedColor);
            TextView chip = HidiUi.chip(activity, color, active);
            LinearLayout.LayoutParams p = HidiUi.wrap();
            p.setMargins(0, 0, HidiUi.dp(activity, 8), 0);
            chip.setLayoutParams(p);
            chip.setOnClickListener(v -> {
                selectedColor = color;
                selectedVariant = null;
                renderColors();
                renderSizes();
                updateAction();
            });
            colorRow.addView(chip);
        }
    }

    private void renderSizes() {
        sizeRow.removeAllViews();

        List<HidiCatalog.Variant> variants = new ArrayList<>();
        for (HidiCatalog.Variant variant : product.variants) {
            if (selectedColor.isEmpty() || selectedColor.equals(variant.color)) variants.add(variant);
        }

        for (HidiCatalog.Variant variant : variants) {
            boolean active = selectedVariant != null && selectedVariant.id.equals(variant.id);
            TextView chip = HidiUi.chip(activity, variant.size, active);
            chip.setAlpha(variant.available > 0 ? 1f : 0.35f);
            chip.setEnabled(variant.available > 0);
            LinearLayout.LayoutParams p = HidiUi.wrap();
            p.setMargins(0, 0, HidiUi.dp(activity, 8), 0);
            chip.setLayoutParams(p);
            chip.setOnClickListener(v -> {
                selectedVariant = selectedVariant != null && selectedVariant.id.equals(variant.id)
                        ? null
                        : variant;
                renderSizes();
                updateAction();
            });
            sizeRow.addView(chip);
        }
    }

    private void addDetails(LinearLayout root) {
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setPadding(HidiUi.dp(activity, 18), HidiUi.dp(activity, 6), HidiUi.dp(activity, 18), HidiUi.dp(activity, 6));
        card.setBackground(HidiUi.bordered(HidiUi.SURFACE, 24, HidiUi.LINE, activity));

        if (product.fabric != null && !product.fabric.trim().isEmpty()) {
            card.addView(detailRow("Fabric", product.fabric.trim()));
            card.addView(HidiUi.divider(activity));
        }
        if (product.care != null && !product.care.trim().isEmpty()) {
            card.addView(detailRow("Care", product.care.trim()));
            card.addView(HidiUi.divider(activity));
        }
        card.addView(detailRow("Delivery", "Complimentary shipping on ₹1,499+"));
        card.addView(HidiUi.divider(activity));
        card.addView(detailRow("Exchange", "Eligible exchanges within 7 days"));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.setMargins(HidiUi.dp(activity, 18), 0, HidiUi.dp(activity, 18), HidiUi.dp(activity, 20));
        root.addView(card, params);
    }

    private View detailRow(String label, String value) {
        LinearLayout row = new LinearLayout(activity);
        row.setOrientation(LinearLayout.VERTICAL);
        row.setPadding(0, HidiUi.dp(activity, 14), 0, HidiUi.dp(activity, 14));

        TextView a = HidiUi.text(activity, label, 11, HidiUi.INK, Typeface.BOLD);
        row.addView(a);

        TextView b = HidiUi.text(activity, value, 11, HidiUi.MUTED, Typeface.NORMAL);
        b.setPadding(0, HidiUi.dp(activity, 4), 0, 0);
        b.setLineSpacing(HidiUi.dp(activity, 1), 1.04f);
        row.addView(b);

        return row;
    }

    private void addBottomBar() {
        LinearLayout bar = new LinearLayout(activity);
        bar.setGravity(Gravity.CENTER_VERTICAL);
        bar.setPadding(HidiUi.dp(activity, 12), HidiUi.dp(activity, 10), HidiUi.dp(activity, 12), HidiUi.dp(activity, 10));
        bar.setBackground(HidiUi.bordered(HidiUi.SURFACE, 0, HidiUi.LINE, activity));
        bar.setElevation(HidiUi.dp(activity, 12));

        saveButton = HidiUi.iconButton(activity, R.drawable.ic_heart, "Save");
        updateSave();
        saveButton.setOnClickListener(v -> {
            store.toggleSaved(product.slug);
            updateSave();
        });
        bar.addView(saveButton, new LinearLayout.LayoutParams(HidiUi.dp(activity, 52), HidiUi.dp(activity, 52)));

        addButton = HidiUi.text(activity, "Choose a size", 12, Color.WHITE, Typeface.BOLD);
        addButton.setGravity(Gravity.CENTER);
        addButton.setLetterSpacing(0.03f);
        addButton.setBackground(HidiUi.rounded(HidiUi.INK, 18, activity));
        addButton.setAlpha(0.52f);
        addButton.setEnabled(false);
        addButton.setOnClickListener(v -> addToBag());
        HidiUi.press(addButton);

        LinearLayout.LayoutParams actionParams = new LinearLayout.LayoutParams(
                0,
                HidiUi.dp(activity, 54),
                1f
        );
        actionParams.leftMargin = HidiUi.dp(activity, 10);
        bar.addView(addButton, actionParams);

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                HidiUi.dp(activity, 74),
                Gravity.BOTTOM
        );
        addView(bar, params);
    }

    private void updateSave() {
        boolean saved = store.isSaved(product.slug);
        saveButton.setColorFilter(saved ? HidiUi.WINE : HidiUi.INK);
        saveButton.setAlpha(saved ? 1f : 0.75f);
        saveButton.setContentDescription(saved ? "Remove from saved" : "Save");
    }

    private void updateAction() {
        if (selectedVariant == null) {
            addButton.setText("Choose a size");
            addButton.setEnabled(false);
            addButton.setAlpha(0.52f);
            price.setText(HidiProductCard.formatPrice(product.minPricePaise));
            return;
        }

        addButton.setText("Add to bag  ·  " + HidiProductCard.formatPrice(selectedVariant.pricePaise));
        addButton.setEnabled(true);
        addButton.setAlpha(1f);
        price.setText(HidiProductCard.formatPrice(selectedVariant.pricePaise));
    }

    private void addToBag() {
        if (selectedVariant == null) return;

        addButton.setEnabled(false);
        addButton.setAlpha(0.7f);
        addButton.setText("Adding…");

        cart.add(selectedVariant.id, (snapshot, error) -> {
            if (error != null || snapshot == null) {
                addButton.setText(error == null ? "Try again" : error);
                addButton.setEnabled(true);
                addButton.setAlpha(1f);
                return;
            }

            navigator.cartChanged(snapshot.itemCount);
            addButton.setText("Added · View bag");
            addButton.setEnabled(true);
            addButton.setAlpha(1f);
            addButton.setOnClickListener(v -> navigator.openBag());
        });
    }
}
