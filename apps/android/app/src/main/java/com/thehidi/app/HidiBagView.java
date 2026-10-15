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
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.TextView;

final class HidiBagView extends FrameLayout {
    interface Navigator {
        void back();
        void browse();
        void checkout();
        void cartChanged(int itemCount);
    }

    private final Activity activity;
    private final Navigator navigator;
    private final RemoteImageLoader images;
    private final HidiCartClient cart;
    private final LinearLayout body;
    private final TextView checkoutButton;
    private final TextView subtotal;
    private final ProgressBar loading;

    HidiBagView(
            Activity activity,
            Navigator navigator,
            RemoteImageLoader images,
            HidiCartClient cart
    ) {
        super(activity);
        this.activity = activity;
        this.navigator = navigator;
        this.images = images;
        this.cart = cart;

        setBackgroundColor(HidiUi.CANVAS);

        LinearLayout shell = new LinearLayout(activity);
        shell.setOrientation(LinearLayout.VERTICAL);
        addView(shell, HidiUi.match());

        ImageButton back = HidiUi.iconButton(activity, R.drawable.ic_back, "Back");
        back.setOnClickListener(v -> navigator.back());
        shell.addView(HidiUi.topBar(activity, "Bag", "READY WHEN YOU ARE", back, null));

        loading = new ProgressBar(activity);
        loading.setIndeterminate(true);
        LinearLayout.LayoutParams loadingParams = new LinearLayout.LayoutParams(
                HidiUi.dp(activity, 28),
                HidiUi.dp(activity, 28)
        );
        loadingParams.gravity = Gravity.CENTER_HORIZONTAL;
        loadingParams.topMargin = HidiUi.dp(activity, 40);
        shell.addView(loading, loadingParams);

        ScrollView scroll = new ScrollView(activity);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setOverScrollMode(OVER_SCROLL_NEVER);

        body = new LinearLayout(activity);
        body.setOrientation(LinearLayout.VERTICAL);
        body.setPadding(HidiUi.dp(activity, 18), HidiUi.dp(activity, 12), HidiUi.dp(activity, 18), HidiUi.dp(activity, 110));
        scroll.addView(body, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        ));

        shell.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
        ));

        LinearLayout bottom = new LinearLayout(activity);
        bottom.setGravity(Gravity.CENTER_VERTICAL);
        bottom.setPadding(HidiUi.dp(activity, 14), HidiUi.dp(activity, 10), HidiUi.dp(activity, 14), HidiUi.dp(activity, 10));
        bottom.setBackground(HidiUi.bordered(HidiUi.SURFACE, 0, HidiUi.LINE, activity));
        bottom.setElevation(HidiUi.dp(activity, 12));

        LinearLayout summary = new LinearLayout(activity);
        summary.setOrientation(LinearLayout.VERTICAL);
        TextView label = HidiUi.text(activity, "Subtotal", 10, HidiUi.MUTED, Typeface.NORMAL);
        summary.addView(label);
        subtotal = HidiUi.text(activity, "—", 15, HidiUi.INK, Typeface.BOLD);
        summary.addView(subtotal);
        bottom.addView(summary, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        checkoutButton = HidiUi.text(activity, "Secure checkout", 12, Color.WHITE, Typeface.BOLD);
        checkoutButton.setGravity(Gravity.CENTER);
        checkoutButton.setBackground(HidiUi.rounded(HidiUi.INK, 18, activity));
        checkoutButton.setEnabled(false);
        checkoutButton.setAlpha(0.4f);
        checkoutButton.setOnClickListener(v -> navigator.checkout());
        HidiUi.press(checkoutButton);
        bottom.addView(checkoutButton, new LinearLayout.LayoutParams(
                HidiUi.dp(activity, 178),
                HidiUi.dp(activity, 54)
        ));

        shell.addView(bottom, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                HidiUi.dp(activity, 74)
        ));

        load();
    }

    private void load() {
        loading.setVisibility(View.VISIBLE);
        cart.load((snapshot, error) -> {
            loading.setVisibility(View.GONE);
            render(snapshot, error);
        });
    }

    private void render(HidiCartClient.Cart snapshot, String error) {
        body.removeAllViews();

        if (error != null) {
            TextView message = HidiUi.text(activity, error, 13, HidiUi.MUTED, Typeface.NORMAL);
            message.setGravity(Gravity.CENTER);
            message.setPadding(0, HidiUi.dp(activity, 50), 0, HidiUi.dp(activity, 20));
            body.addView(message);

            TextView retry = HidiUi.chip(activity, "Try again", true);
            LinearLayout.LayoutParams rp = HidiUi.wrap();
            rp.gravity = Gravity.CENTER_HORIZONTAL;
            retry.setLayoutParams(rp);
            retry.setOnClickListener(v -> load());
            body.addView(retry);
            return;
        }

        if (snapshot == null || snapshot.items.isEmpty()) {
            subtotal.setText("₹0");
            checkoutButton.setEnabled(false);
            checkoutButton.setAlpha(0.4f);
            navigator.cartChanged(0);

            LinearLayout empty = new LinearLayout(activity);
            empty.setOrientation(LinearLayout.VERTICAL);
            empty.setGravity(Gravity.CENTER);
            empty.setPadding(0, HidiUi.dp(activity, 58), 0, HidiUi.dp(activity, 58));

            TextView title = HidiUi.serif(activity, "Your bag is beautifully empty.", 25, HidiUi.INK);
            title.setGravity(Gravity.CENTER);
            empty.addView(title);

            TextView copy = HidiUi.text(activity, "Keep it intentional. Add only what you love.", 12, HidiUi.MUTED, Typeface.NORMAL);
            copy.setGravity(Gravity.CENTER);
            copy.setPadding(0, HidiUi.dp(activity, 10), 0, HidiUi.dp(activity, 20));
            empty.addView(copy);

            TextView browse = HidiUi.chip(activity, "Browse HIDI", true);
            browse.setOnClickListener(v -> navigator.browse());
            empty.addView(browse, HidiUi.wrap());

            body.addView(empty);
            return;
        }

        navigator.cartChanged(snapshot.itemCount);
        subtotal.setText(HidiProductCard.formatPrice(snapshot.subtotalPaise));
        checkoutButton.setEnabled(true);
        checkoutButton.setAlpha(1f);
        checkoutButton.setText("Checkout · " + snapshot.itemCount);

        TextView count = HidiUi.overline(activity, snapshot.itemCount + (snapshot.itemCount == 1 ? " piece" : " pieces"));
        count.setPadding(HidiUi.dp(activity, 4), 0, 0, HidiUi.dp(activity, 12));
        body.addView(count);

        for (HidiCartClient.Item item : snapshot.items) {
            body.addView(itemCard(item));
        }

        LinearLayout promise = new LinearLayout(activity);
        promise.setOrientation(LinearLayout.VERTICAL);
        promise.setPadding(HidiUi.dp(activity, 18), HidiUi.dp(activity, 18), HidiUi.dp(activity, 18), HidiUi.dp(activity, 18));
        promise.setBackground(HidiUi.bordered(HidiUi.SURFACE, 22, HidiUi.LINE, activity));

        TextView ship = HidiUi.text(activity, snapshot.subtotalPaise >= 149900
                ? "Complimentary shipping unlocked"
                : "Shipping calculated at checkout", 12, HidiUi.INK, Typeface.BOLD);
        promise.addView(ship);

        TextView secure = HidiUi.text(activity, "Secure payment · UPI · Cards · Net banking", 11, HidiUi.MUTED, Typeface.NORMAL);
        secure.setPadding(0, HidiUi.dp(activity, 5), 0, 0);
        promise.addView(secure);

        LinearLayout.LayoutParams pp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        pp.topMargin = HidiUi.dp(activity, 10);
        body.addView(promise, pp);
    }

    private View itemCard(HidiCartClient.Item item) {
        LinearLayout card = new LinearLayout(activity);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setPadding(HidiUi.dp(activity, 10), HidiUi.dp(activity, 10), HidiUi.dp(activity, 10), HidiUi.dp(activity, 10));
        card.setBackground(HidiUi.rounded(HidiUi.SURFACE, 22, activity));

        ImageView image = new ImageView(activity);
        image.setScaleType(ImageView.ScaleType.CENTER_CROP);
        image.setBackground(HidiUi.rounded(HidiUi.SURFACE_MUTED, 16, activity));
        image.setClipToOutline(true);
        images.load(image, item.productImage, HidiUi.SURFACE_MUTED);
        card.addView(image, new LinearLayout.LayoutParams(
                HidiUi.dp(activity, 94),
                HidiUi.dp(activity, 124)
        ));

        LinearLayout copy = new LinearLayout(activity);
        copy.setOrientation(LinearLayout.VERTICAL);
        copy.setPadding(HidiUi.dp(activity, 14), HidiUi.dp(activity, 4), 0, 0);

        TextView name = HidiUi.text(activity, item.productName, 13, HidiUi.INK, Typeface.BOLD);
        name.setMaxLines(2);
        copy.addView(name);

        TextView variant = HidiUi.text(activity, item.color + " · Size " + item.size, 11, HidiUi.MUTED, Typeface.NORMAL);
        variant.setPadding(0, HidiUi.dp(activity, 5), 0, HidiUi.dp(activity, 7));
        copy.addView(variant);

        TextView price = HidiUi.text(activity, HidiProductCard.formatPrice(item.lineTotalPaise), 12, HidiUi.WINE, Typeface.BOLD);
        copy.addView(price);

        LinearLayout quantity = new LinearLayout(activity);
        quantity.setGravity(Gravity.CENTER_VERTICAL);
        quantity.setPadding(0, HidiUi.dp(activity, 12), 0, 0);

        TextView minus = quantityButton("−");
        minus.setOnClickListener(v -> {
            if (item.quantity <= 1) cart.remove(item.id, this::cartResult);
            else cart.update(item.id, item.quantity - 1, this::cartResult);
        });
        quantity.addView(minus);

        TextView amount = HidiUi.text(activity, String.valueOf(item.quantity), 12, HidiUi.INK, Typeface.BOLD);
        amount.setGravity(Gravity.CENTER);
        quantity.addView(amount, new LinearLayout.LayoutParams(HidiUi.dp(activity, 34), HidiUi.dp(activity, 36)));

        TextView plus = quantityButton("+");
        plus.setEnabled(item.quantity < Math.max(1, item.available));
        plus.setAlpha(plus.isEnabled() ? 1f : 0.35f);
        plus.setOnClickListener(v -> cart.update(item.id, item.quantity + 1, this::cartResult));
        quantity.addView(plus);

        TextView remove = HidiUi.text(activity, "Remove", 10, HidiUi.WINE, Typeface.BOLD);
        remove.setPadding(HidiUi.dp(activity, 16), HidiUi.dp(activity, 10), 0, HidiUi.dp(activity, 10));
        remove.setOnClickListener(v -> cart.remove(item.id, this::cartResult));
        quantity.addView(remove);

        copy.addView(quantity);
        card.addView(copy, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
        );
        params.bottomMargin = HidiUi.dp(activity, 10);
        card.setLayoutParams(params);
        return card;
    }

    private TextView quantityButton(String label) {
        TextView button = HidiUi.text(activity, label, 16, HidiUi.INK, Typeface.NORMAL);
        button.setGravity(Gravity.CENTER);
        button.setBackground(HidiUi.bordered(HidiUi.CANVAS, 12, HidiUi.LINE, activity));
        HidiUi.press(button);
        button.setLayoutParams(new LinearLayout.LayoutParams(HidiUi.dp(activity, 36), HidiUi.dp(activity, 36)));
        return button;
    }

    private void cartResult(HidiCartClient.Cart snapshot, String error) {
        render(snapshot, error);
    }
}
