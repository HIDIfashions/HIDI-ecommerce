package com.thehidi.app;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.text.NumberFormat;
import java.util.Locale;

final class HidiProductCard {
    interface Listener {
        void open(HidiCatalog.Product product);
        void savedChanged();
    }

    private HidiProductCard() {}

    static View create(
            Activity activity,
            HidiCatalog.Product product,
            RemoteImageLoader images,
            HidiAppStore store,
            Listener listener,
            int widthDp
    ) {
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackgroundColor(Color.TRANSPARENT);

        FrameLayout imageFrame = new FrameLayout(activity);
        imageFrame.setBackground(HidiUi.rounded(HidiUi.SURFACE_MUTED, 22, activity));
        imageFrame.setClipToOutline(true);

        ImageView image = new ImageView(activity);
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        images.load(image, product.primaryImage(), HidiUi.SURFACE_MUTED);
        imageFrame.addView(image, HidiUi.match());

        ImageButton heart = HidiUi.iconButton(activity, R.drawable.ic_heart, "Save");
        heart.setBackground(HidiUi.rounded(0xF2FFFDFB, 18, activity));
        updateHeart(heart, store.isSaved(product.slug));

        FrameLayout.LayoutParams heartParams = new FrameLayout.LayoutParams(
                HidiUi.dp(activity, 40),
                HidiUi.dp(activity, 40),
                Gravity.TOP | Gravity.END
        );
        heartParams.setMargins(0, HidiUi.dp(activity, 10), HidiUi.dp(activity, 10), 0);
        imageFrame.addView(heart, heartParams);

        heart.setOnClickListener(v -> {
            boolean saved = store.toggleSaved(product.slug);
            updateHeart(heart, saved);
            listener.savedChanged();
        });

        card.addView(imageFrame, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                HidiUi.dp(activity, 252)
        ));

        TextView name = HidiUi.text(activity, product.name, 13, HidiUi.INK, Typeface.BOLD);
        name.setMaxLines(1);
        name.setEllipsize(android.text.TextUtils.TruncateAt.END);
        name.setPadding(HidiUi.dp(activity, 2), HidiUi.dp(activity, 11), 0, 0);
        card.addView(name);

        LinearLayout meta = new LinearLayout(activity);
        meta.setOrientation(LinearLayout.HORIZONTAL);
        meta.setGravity(Gravity.CENTER_VERTICAL);
        meta.setPadding(HidiUi.dp(activity, 2), HidiUi.dp(activity, 5), 0, 0);

        TextView price = HidiUi.text(
                activity,
                formatPrice(product.minPricePaise),
                12,
                HidiUi.WINE,
                Typeface.BOLD
        );
        meta.addView(price);

        TextView dot = HidiUi.text(activity, " · ", 11, HidiUi.MUTED, Typeface.NORMAL);
        meta.addView(dot);

        TextView stock = HidiUi.text(
                activity,
                product.inStock ? "Ready to shop" : "Sold out",
                10,
                HidiUi.MUTED,
                Typeface.NORMAL
        );
        meta.addView(stock);

        card.addView(meta);
        card.setOnClickListener(v -> listener.open(product));
        HidiUi.press(card);

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                HidiUi.dp(activity, widthDp),
                HidiUi.dp(activity, 328)
        );
        card.setLayoutParams(params);
        return card;
    }

    private static void updateHeart(ImageButton heart, boolean saved) {
        heart.setColorFilter(saved ? HidiUi.WINE : HidiUi.INK);
        heart.setAlpha(saved ? 1f : 0.78f);
        heart.setContentDescription(saved ? "Remove from saved" : "Save");
    }

    static String formatPrice(int paise) {
        if (paise <= 0) return "";
        NumberFormat format = NumberFormat.getCurrencyInstance(new Locale("en", "IN"));
        format.setMaximumFractionDigits(0);
        return format.format(paise / 100.0);
    }
}
